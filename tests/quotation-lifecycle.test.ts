// Owner lifecycle actions (revoke, new link, dismiss, delete, resend) and 90-day retention on
// SIMULATED D1 (node:sqlite), through the real owner, public and sender code. Mocked email only.

import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleOwner, validOwnerOrigin, type OwnerEnv } from '../worker/owner/handler.ts';
import { capWarningRetentionSql, retentionPolicy, runRetention } from '../worker/owner/retention.ts';
import { runScheduled, runScheduledRetention, type SenderEnv } from '../worker/owner/scheduled.ts';
import { runSender, sendPolicy } from '../worker/owner/sender.ts';
import { deletionSql, purgeGuardSql, resendQuotation } from '../worker/owner/store.ts';
import { handleIntake } from '../worker/public/intake.ts';
import { handleQuote } from '../worker/public/quote.ts';
import { setLogSink } from '../src/lib/quotation/log.ts';
import { sha256Hex } from '../src/lib/quotation/owner-form.ts';
import { currentLinkKey, quoteLinkToken } from '../src/lib/quotation/quote-link.ts';
import { createTestAccess, TEST_AUD, TEST_OWNER, TEST_TEAM, type TestAccess } from './support/access-jwt.ts';
import { createMockProvider, type MockProvider } from './support/mock-email.ts';
import { createTestDatabase, type TestDatabase } from './support/sqlite-d1.ts';

const OWNER_ORIGIN = 'https://buildtrack-owner.example.test';
const PUBLIC_ORIGIN = 'https://buildtrack.example.test';
const DAY = 24 * 60 * 60 * 1000;
const randomKey = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));

let access: TestAccess;
beforeAll(async () => {
  access = await createTestAccess();
});
const keys = async (kid: string) => (kid === access.kid ? access.publicJwk : null);

let db: TestDatabase;
let env: SenderEnv & { INTAKE_HMAC_KEY: string; INTAKE_HMAC_KEY_VERSION: string };
let mock: MockProvider;
let logLines: string[];
beforeEach(() => {
  db = createTestDatabase();
  env = {
    DB: db,
    WORKFLOW_ENABLED: 'on',
    PUBLIC_ORIGIN,
    INTAKE_HMAC_KEY: randomKey(),
    INTAKE_HMAC_KEY_VERSION: '1',
    OWNER_ORIGIN,
    OWNER_EMAIL: TEST_OWNER,
    ACCESS_TEAM_DOMAIN: TEST_TEAM,
    ACCESS_AUD: TEST_AUD,
    OWNER_FORM_KEY: randomKey(),
    QUOTE_LINK_KEY_CURRENT: '1',
    QUOTE_LINK_KEY_V1: randomKey(),
    SENDING_ENABLED: 'on',
    EMAIL_MODE: 'resend', // these tests cover the retained automatic mode; manual mode: quotation-manual.test.ts
    MAIL_FROM: 'BuildTrack <quotes@mail.example.test>',
  };
  mock = createMockProvider();
  logLines = [];
  setLogSink((line) => logLines.push(line));
});
afterEach(() => setLogSink(() => {}));

let ip = 0;
async function storeRequest(now = Date.now()): Promise<string> {
  const response = await handleIntake(
    new Request(`${PUBLIC_ORIGIN}/api/quotation-requests`, {
      method: 'POST',
      body: JSON.stringify({
        service: '', plan: 'professional', name: 'Maria Test Customer', email: 'maria.customer@example.test', organization: 'Example Builders',
        phone: '', organization_type: 'contractors', project_need: 'Tracking cement across two sites', message: '', privacy_ack: 'yes', submission_id: crypto.randomUUID(),
      }),
      headers: { 'Content-Type': 'application/json', Origin: PUBLIC_ORIGIN, 'CF-Connecting-IP': `198.51.100.${++ip % 250}` },
    }),
    env,
    now,
  );
  const { reference } = (await response.json()) as { reference: string };
  return (db.raw.prepare('SELECT id FROM quote_requests WHERE ref = ?').get(reference) as { id: string }).id;
}
async function owner(path: string, body?: Record<string, string>, headers: Record<string, string> = {}, now = Date.now()) {
  return handleOwner(
    new Request(`${OWNER_ORIGIN}${path}`, {
      method: body ? 'POST' : 'GET',
      body: body ? new URLSearchParams(body).toString() : undefined,
      headers: { 'Cf-Access-Jwt-Assertion': await access.sign(), ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded', Origin: OWNER_ORIGIN } : {}), ...headers },
    }),
    env as OwnerEnv,
    keys,
    now,
  );
}
const formOf = (html: string) => ({ form_token: /name="form_token" value="([^"]+)"/.exec(html)?.[1] ?? '', version: /name="version" value="(\d+)"/.exec(html)?.[1] ?? '' });
async function approvedQuote(): Promise<{ requestId: string; quoteId: string; token: string }> {
  const requestId = await storeRequest();
  const detail = formOf(await (await owner(`/requests/${requestId}`)).text());
  await owner(`/requests/${requestId}/draft`, { ...detail, scope: 'Starter setup for two sites, with training.', amount: '7,990', validity_days: '14' });
  await owner(`/requests/${requestId}/approve`, formOf(await (await owner(`/requests/${requestId}/confirm`)).text()));
  const quoteId = (db.raw.prepare('SELECT id FROM quotes WHERE request_id = ?').get(requestId) as { id: string }).id;
  return { requestId, quoteId, token: await quoteLinkToken((await currentLinkKey(env as unknown as Record<string, unknown>))!, quoteId, 1) };
}
const customer = (action: 'view' | 'accept' | 'simulate', fields: Record<string, string>, now: number | (() => number) = Date.now()) =>
  handleQuote(
    new Request(`${PUBLIC_ORIGIN}/api/quote/${action}`, {
      method: 'POST',
      body: JSON.stringify(fields),
      headers: { 'Content-Type': 'application/json', Origin: PUBLIC_ORIGIN, 'CF-Connecting-IP': '203.0.113.9' },
    }),
    env,
    action,
    now,
  );
const quote = (id: string) => db.raw.prepare('SELECT * FROM quotes WHERE id = ?').get(id) as Record<string, any>;
const request = (id: string) => db.raw.prepare('SELECT * FROM quote_requests WHERE id = ?').get(id) as Record<string, any> | undefined;
const count = (sql: string, ...params: (string | number)[]) => (db.raw.prepare(`SELECT COUNT(*) AS n FROM ${sql}`).get(...params) as { n: number }).n;
const all = () => JSON.stringify(['quote_requests', 'quotes', 'quote_links', 'quote_events', 'email_jobs', 'email_attempts', 'simulated_checkouts', 'used_form_tokens'].map((t) => db.raw.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()));
const send = (now: number | (() => number) = Date.now()) => runScheduled(env, () => mock.transport, now, validOwnerOrigin, { quotationEmailsReady: true });
const confirmAndPost = async (requestId: string, kind: string) => owner(`/requests/${requestId}/${kind}`, formOf(await (await owner(`/requests/${requestId}/${kind}`)).text()));

describe('owner lifecycle: revoke', () => {
  it('revokes every link at once, cancels unsent quotation emails, and tells the customer nothing about the quotation', async () => {
    const { requestId, quoteId, token } = await approvedQuote();
    const before = all();
    const page = await (await owner(`/requests/${requestId}/revoke`)).text();
    expect(all()).toBe(before); // the confirmation page changes nothing
    expect(page).toContain('cannot be recalled');
    expect((await owner(`/requests/${requestId}/revoke`, formOf(page))).status).toBe(303);
    expect(quote(quoteId)).toMatchObject({ status: 'revoked', token_hash: null });
    expect(quote(quoteId).revoked_at).toBeTypeOf('number');
    expect(count('quote_links WHERE quote_id = ? AND revoked_at IS NOT NULL', quoteId)).toBe(1);
    expect(db.raw.prepare("SELECT status, last_result FROM email_jobs WHERE kind = 'quotation'").get()).toEqual({ status: 'cancelled', last_result: 'E_REVOKED' });
    expect(count("quote_events WHERE event = 'revoked'")).toBe(1);
    const view = await customer('view', { token });
    const answer = (await view.json()) as Record<string, unknown>;
    expect([view.status, answer.error]).toEqual([410, 'revoked']);
    expect(JSON.stringify(answer)).not.toMatch(/Starter setup|7,990|Maria/);
    // The same confirmation again: refused (the quotation is no longer at that version; token already used).
    expect((await owner(`/requests/${requestId}/revoke`, formOf(page))).status).toBe(409);
    expect(count("quote_events WHERE event = 'revoked'")).toBe(1);
  });

  it('two concurrent revocations from separate confirmation pages: one wins, the other changes nothing', async () => {
    const { requestId } = await approvedQuote();
    const pages = await Promise.all([1, 2].map(async () => formOf(await (await owner(`/requests/${requestId}/revoke`)).text())));
    const statuses = await Promise.all(pages.map((fields) => owner(`/requests/${requestId}/revoke`, fields).then((r) => r.status)));
    expect(statuses.sort()).toEqual([303, 409]);
    expect(count("quote_events WHERE event = 'revoked'")).toBe(1);
  });

  it('an email already being sent cannot be recalled: it may still be accepted, but the quotation stays revoked', async () => {
    const { requestId, quoteId } = await approvedQuote();
    db.raw.prepare("UPDATE email_jobs SET status = 'cancelled' WHERE kind = 'owner_notification'").run();
    mock.script.push('accept_slow');
    const sending = send();
    await vi.waitFor(() => expect(db.raw.prepare("SELECT status FROM email_jobs WHERE kind = 'quotation'").get()).toEqual({ status: 'sending' }));
    expect((await confirmAndPost(requestId, 'revoke')).status).toBe(303);
    mock.release();
    await sending;
    expect(db.raw.prepare("SELECT status FROM email_jobs WHERE kind = 'quotation'").get()).toEqual({ status: 'provider_accepted' });
    expect(quote(quoteId).status).toBe('revoked'); // never "emailed" again; its link does not work
  });

  it('refuses cross-site, forged-token and unauthenticated attempts, changing nothing', async () => {
    const { requestId } = await approvedQuote();
    const fields = formOf(await (await owner(`/requests/${requestId}/revoke`)).text());
    const before = all();
    expect((await owner(`/requests/${requestId}/revoke`, fields, { Origin: 'https://attacker.example.test' })).status).toBe(403);
    expect((await owner(`/requests/${requestId}/revoke`, { ...fields, form_token: 'forged' })).status).toBe(403);
    expect((await owner(`/requests/${requestId}/revoke`, fields, { 'Cf-Access-Jwt-Assertion': 'x.y.z' })).status).toBe(404);
    expect(all()).toBe(before);
  });
});

describe('owner lifecycle: new link and resend', () => {
  it('after a revocation: next generation, same immutable snapshot and expiry, one new job; the old link says revoked', async () => {
    const { requestId, quoteId, token } = await approvedQuote();
    await confirmAndPost(requestId, 'revoke');
    const snapshot = quote(quoteId);
    const page = await (await owner(`/requests/${requestId}/new-link`)).text();
    expect(page).toContain('stay exactly as approved');
    expect((await owner(`/requests/${requestId}/new-link`, formOf(page))).status).toBe(303);
    const after = quote(quoteId);
    expect(after).toMatchObject({ status: 'approved', link_generation: 2, revoked_at: null });
    for (const column of ['snap_name', 'snap_email', 'snap_scope', 'snap_amount_centavos', 'snap_validity_days', 'expires_at', 'approved_at']) expect(after[column]).toBe(snapshot[column]);
    const newToken = await quoteLinkToken((await currentLinkKey(env as unknown as Record<string, unknown>))!, quoteId, 2);
    expect(after.token_hash).toBe(await sha256Hex(newToken));
    expect(((await (await customer('view', { token })).json()) as { error: string }).error).toBe('revoked');
    expect((await customer('view', { token: newToken })).status).toBe(200);
    await send();
    const sent = mock.inbox.filter((m) => m.key.startsWith('bt-q-'));
    expect(sent.map((m) => m.key)).toEqual([`bt-q-${quoteId}-g2-s0`]);
    expect(sent[0]!.message.text).toContain(`#t=${newToken}`);
    expect(count("quote_events WHERE event = 'link_replaced'")).toBe(1);
  });

  it('replacing an emailed link: the old link says superseded; unsent older jobs are cancelled', async () => {
    const { requestId, quoteId, token } = await approvedQuote();
    await send(); // generation 1 sent
    expect(quote(quoteId).status).toBe('emailed');
    await confirmAndPost(requestId, 'new-link');
    expect(((await (await customer('view', { token })).json()) as { error: string }).error).toBe('superseded');
    expect(db.raw.prepare("SELECT link_generation, status FROM email_jobs WHERE kind = 'quotation' ORDER BY link_generation").all()).toEqual([
      { link_generation: 1, status: 'provider_accepted' },
      { link_generation: 2, status: 'queued' },
    ]);
  });

  // Codex consolidated review, finding 1: a send for the older link that was already in flight
  // when the link was replaced completes afterwards.
  it('an older link’s in-flight send completing after a replacement keeps its own acceptance, but never marks the new link emailed', async () => {
    const { requestId, quoteId } = await approvedQuote();
    db.raw.prepare("UPDATE email_jobs SET status = 'cancelled' WHERE kind = 'owner_notification'").run();
    mock.script.push('accept_slow');
    const sending = send();
    await vi.waitFor(() => expect(db.raw.prepare("SELECT status FROM email_jobs WHERE kind = 'quotation'").get()).toEqual({ status: 'sending' }));
    expect((await confirmAndPost(requestId, 'new-link')).status).toBe(303);
    mock.release();
    await sending;
    const jobs = () =>
      db.raw.prepare("SELECT idempotency_key, status, last_result, provider_message_id IS NOT NULL AS has_id FROM email_jobs WHERE kind = 'quotation' ORDER BY link_generation, resend_seq").all();
    // Truthful history: generation 1 was accepted by the provider, with its message id and attempt record.
    expect(jobs()).toEqual([
      { idempotency_key: `bt-q-${quoteId}-g1-s0`, status: 'provider_accepted', last_result: 'OK_ACCEPTED', has_id: 1 },
      { idempotency_key: `bt-q-${quoteId}-g2-s0`, status: 'queued', last_result: null, has_id: 0 },
    ]);
    expect(db.raw.prepare(`SELECT outcome, provider_called_at IS NOT NULL AS called FROM email_attempts WHERE job_id = (SELECT id FROM email_jobs WHERE idempotency_key = 'bt-q-${quoteId}-g1-s0')`).all()).toEqual([
      { outcome: 'OK_ACCEPTED', called: 1 },
    ]);
    // ...but the quotation, now on generation 2, is not "emailed": its own email has not been accepted.
    expect(quote(quoteId)).toMatchObject({ status: 'approved', link_generation: 2, emailed_at: null });
    // Generation 2's email is rejected: the owner can still resend it, and that resend marks it emailed.
    mock.script.push('reject');
    await send();
    expect(jobs()[1]).toMatchObject({ status: 'needs_owner', last_result: 'E_REJECTED_422' });
    expect(quote(quoteId).status).toBe('approved');
    expect((await confirmAndPost(requestId, 'resend')).status).toBe(303);
    await send();
    expect(jobs()[2]).toMatchObject({ idempotency_key: `bt-q-${quoteId}-g2-s1`, status: 'provider_accepted' });
    expect(quote(quoteId).status).toBe('emailed');
  });

  // Codex consolidated review, finding 2: resend_seq restarts for each link generation.
  it('resends of an earlier link generation never block a confirmed resend for the replacement link', async () => {
    const { requestId, quoteId } = await approvedQuote();
    db.raw.prepare("UPDATE email_jobs SET status = 'cancelled' WHERE kind = 'owner_notification'").run();
    const jobs = () => db.raw.prepare("SELECT idempotency_key AS key, status FROM email_jobs WHERE kind = 'quotation' ORDER BY link_generation, resend_seq").all();
    const g = (generation: number, seq: number) => `bt-q-${quoteId}-g${generation}-s${seq}`;
    mock.script.push('reject');
    await send(); // generation 1 rejected
    expect((await confirmAndPost(requestId, 'resend')).status).toBe(303); // generation 1, resend 1
    mock.script.push('reject');
    await send();
    expect(jobs()).toEqual([
      { key: g(1, 0), status: 'needs_owner' },
      { key: g(1, 1), status: 'needs_owner' },
    ]);
    expect((await confirmAndPost(requestId, 'new-link')).status).toBe(303);
    mock.script.push('reject');
    await send(); // generation 2 rejected
    expect(jobs()).toEqual([
      { key: g(1, 0), status: 'cancelled' },
      { key: g(1, 1), status: 'cancelled' },
      { key: g(2, 0), status: 'needs_owner' },
    ]);
    const page = await (await owner(`/requests/${requestId}/resend`)).text();
    expect(page).toContain('Send again');
    expect((await owner(`/requests/${requestId}/resend`, formOf(page))).status).toBe(303); // refused (409) before the repair
    expect(jobs()).toEqual([
      { key: g(1, 0), status: 'cancelled' },
      { key: g(1, 1), status: 'cancelled' },
      { key: g(2, 0), status: 'needs_owner' },
      { key: g(2, 1), status: 'queued' },
    ]);
    // Directly at the store, with fresh single-use tokens: an earlier generation's job, and a job that
    // is no longer the latest of the current generation, are both refused.
    const use = (name: string) => ({ tokenHash: `test-${name}`, tokenExpires: Date.now() + 600_000, owner: TEST_OWNER, now: Date.now() });
    const id = (key: string) => (db.raw.prepare('SELECT id FROM email_jobs WHERE idempotency_key = ?').get(key) as { id: string }).id;
    const version = quote(quoteId).version as number;
    expect(await resendQuotation(db, { jobId: id(g(1, 0)), quoteId, version, use: use('old-generation') })).toBe('stale');
    expect(await resendQuotation(db, { jobId: id(g(2, 0)), quoteId, version, use: use('not-latest') })).toBe('stale');
    expect(jobs()).toHaveLength(4);
    await send();
    expect(jobs()[3]).toEqual({ key: g(2, 1), status: 'provider_accepted' });
    expect(quote(quoteId).status).toBe('emailed');
    expect(count("quote_events WHERE event = 'resent'")).toBe(2);
  });

  it('owner page: the main email statement describes the current link only; older links’ emails are history', async () => {
    const { requestId } = await approvedQuote();
    await send(); // generation 1 accepted by the (mock) provider
    await confirmAndPost(requestId, 'new-link');
    const sections = async () => {
      const page = (await (await owner(`/requests/${requestId}`)).text()).replace(/\s+/g, ' ');
      const [main, history = ''] = page.split('<h3>Earlier links (history)</h3>');
      return { main: main!, history };
    };
    const accepted = 'The email provider accepted the quotation email.';
    // Generation 2 queued: before the fix the main statement said "accepted" because of generation 1.
    let { main, history } = await sections();
    expect(main).toContain('Quotation email (current link)');
    expect(main).toContain('No email has been sent yet: the quotation email is waiting in the queue.');
    expect(main).not.toContain(accepted);
    expect(history).toContain('Link 1, First send');
    expect(history).toContain('Accepted by the email provider.');
    expect(history).toContain('no longer works');
    // Generation 2 rejected: "not sent", and the resend is offered.
    mock.script.push('reject');
    await send();
    ({ main, history } = await sections());
    expect(main).toContain('Not sent: the email provider has not accepted the quotation email.');
    expect(main).not.toContain(accepted);
    expect(main).toContain('Send the quotation email again');
    expect(history).toContain('Accepted by the email provider.');
    // Resent and accepted: now the main statement says accepted; the history is unchanged.
    await confirmAndPost(requestId, 'resend');
    await send();
    ({ main, history } = await sections());
    expect(main).toContain(accepted);
    expect(main).toMatch(/Resend 1, queued [^<]*: Accepted by the email provider\./);
    expect(history.split('</ul>')[0]!.match(/<li>/g)).toHaveLength(1); // the history list: link 1 only
  });

  it('owner page without a replaced link: no history section, unchanged wording', async () => {
    const { requestId } = await approvedQuote();
    await send();
    const page = await (await owner(`/requests/${requestId}`)).text();
    expect(page).toContain('<h3>Quotation email</h3>');
    expect(page).not.toContain('Earlier links');
    expect(page).toContain('The email provider accepted the quotation email.');
  });

  it('is not offered after expiry (the approved expiry is immutable), and a stale page cannot do it', async () => {
    const { requestId, quoteId } = await approvedQuote();
    const expires = quote(quoteId).expires_at;
    // An Access token still valid at that later time (the owner's sign-in is not what is tested).
    const later = { 'Cf-Access-Jwt-Assertion': await access.sign({ exp: Math.floor(expires / 1000) + 3600 }) };
    expect((await owner(`/requests/${requestId}/new-link`, undefined, later, expires + 1)).status).toBe(303);
    const fields = formOf(await (await owner(`/requests/${requestId}/new-link`)).text());
    // The form token itself expires after 10 minutes; issue the post just after expiry with a fresh page instead.
    const freshAtExpiry = formOf(await (await owner(`/requests/${requestId}/new-link`, undefined, later, expires - 1000)).text());
    expect((await owner(`/requests/${requestId}/new-link`, freshAtExpiry, later, expires + 1)).status).toBe(409);
    expect(fields.form_token).not.toBe('');
    expect(quote(quoteId).link_generation).toBe(1);
  });
});

describe('owner lifecycle: dismiss and delete', () => {
  it('dismisses a request without a quotation; not offered once a quotation exists', async () => {
    const requestId = await storeRequest();
    expect((await confirmAndPost(requestId, 'dismiss')).status).toBe(303);
    expect(request(requestId)!.status).toBe('dismissed');
    const quoted = (await approvedQuote()).requestId;
    expect((await owner(`/requests/${quoted}/dismiss`)).status).toBe(303); // redirected: not applicable
  });

  it('deletes everything the application holds for the request, in one batch; the customer link becomes invalid', async () => {
    const { requestId, quoteId, token } = await approvedQuote();
    const { version } = ((await (await customer('view', { token })).json()) as { view: { version: number } }).view;
    await customer('accept', { token, version: String(version) });
    await customer('simulate', { token, version: String(version + 1), method: 'card', outcome: 'success', attempt_id: crypto.randomUUID() });
    await send();
    expect(count('email_attempts')).toBeGreaterThan(0);
    const page = await (await owner(`/requests/${requestId}/delete`)).text();
    expect(page).toContain('Not deleted by this, because BuildTrack does not control it');
    expect((await owner(`/requests/${requestId}/delete`, formOf(page))).status).toBe(303);
    expect(request(requestId)).toBeUndefined();
    for (const table of ['quotes', 'quote_links', 'quote_events', 'email_jobs', 'email_attempts', 'simulated_checkouts']) expect(count(table), table).toBe(0);
    expect(count('quote_ref_sequences')).toBe(1); // non-personal sequence metadata is kept
    const view = await customer('view', { token });
    expect([view.status, ((await view.json()) as { error: string }).error]).toEqual([404, 'invalid']);
    expect(quoteId).toBeTruthy();
  });

  it('waits while an email for the request is being sent, then deletes', async () => {
    const { requestId } = await approvedQuote();
    db.raw.prepare("UPDATE email_jobs SET status = 'cancelled' WHERE kind = 'owner_notification'").run();
    const fields = formOf(await (await owner(`/requests/${requestId}/delete`)).text());
    mock.script.push('accept_slow');
    const sending = send();
    await vi.waitFor(() => expect(db.raw.prepare("SELECT status FROM email_jobs WHERE kind = 'quotation'").get()).toEqual({ status: 'sending' }));
    expect(await (await owner(`/requests/${requestId}/delete`)).text()).toContain('being sent right now');
    const refused = await owner(`/requests/${requestId}/delete`, fields);
    expect([refused.status, (await refused.text()).includes('being sent right now')]).toEqual([409, true]);
    expect(request(requestId)).toBeDefined();
    mock.release();
    await sending;
    expect((await confirmAndPost(requestId, 'delete')).status).toBe(303);
    expect(request(requestId)).toBeUndefined();
  });

  it('a stale delete confirmation (the quotation changed since) deletes nothing', async () => {
    const { requestId } = await approvedQuote();
    const fields = formOf(await (await owner(`/requests/${requestId}/delete`)).text());
    await confirmAndPost(requestId, 'revoke'); // version changes
    expect((await owner(`/requests/${requestId}/delete`, fields)).status).toBe(409);
    expect(request(requestId)).toBeDefined();
  });

  it('no GET or HEAD on any owner route changes anything or sends email', async () => {
    const { requestId } = await approvedQuote();
    const plain = await storeRequest();
    const before = all();
    for (const id of [requestId, plain]) {
      for (const path of ['', '/confirm', '/resend', '/revoke', '/new-link', '/dismiss', '/delete', '/draft', '/approve']) {
        await owner(`/requests/${id}${path}`);
        await handleOwner(new Request(`${OWNER_ORIGIN}/requests/${id}${path}`, { method: 'HEAD', headers: { 'Cf-Access-Jwt-Assertion': await access.sign() } }), env as OwnerEnv, keys);
      }
    }
    await owner('/');
    expect(all()).toBe(before);
    expect(mock.calls).toHaveLength(0);
  });
});

describe('retention: 90 days after the last activity', () => {
  const age = (requestId: string, days: number) => db.raw.prepare('UPDATE quote_requests SET last_activity_at = ? WHERE id = ?').run(Date.now() - days * DAY, requestId);

  it('last activity: set at intake; moved by owner and customer changes; never by views or repeats', async () => {
    const t0 = Date.now() - 10 * DAY;
    const requestId = await storeRequest(t0);
    expect(request(requestId)!.last_activity_at).toBe(t0);
    const { requestId: r2, token } = await approvedQuote();
    const afterApproval = request(r2)!.last_activity_at;
    db.raw.prepare('UPDATE quote_requests SET last_activity_at = 1 WHERE id = ?').run(r2);
    for (let i = 0; i < 3; i++) await customer('view', { token });
    expect(request(r2)!.last_activity_at).toBe(1); // views never count
    const { version } = ((await (await customer('view', { token })).json()) as { view: { version: number } }).view;
    await customer('accept', { token, version: String(version) }, afterApproval + 5);
    expect(request(r2)!.last_activity_at).toBe(afterApproval + 5);
    db.raw.prepare('UPDATE quote_requests SET last_activity_at = 1 WHERE id = ?').run(r2);
    await customer('accept', { token, version: String(version) }, afterApproval + 6); // a repeat changes nothing
    expect(request(r2)!.last_activity_at).toBe(1);
    const attempt = crypto.randomUUID();
    await customer('simulate', { token, version: String(version + 1), method: 'card', outcome: 'success', attempt_id: attempt }, afterApproval + 7);
    expect(request(r2)!.last_activity_at).toBe(afterApproval + 7);
    db.raw.prepare('UPDATE quote_requests SET last_activity_at = 1 WHERE id = ?').run(r2);
    await customer('simulate', { token, version: String(version + 1), method: 'card', outcome: 'success', attempt_id: attempt }, afterApproval + 8);
    expect(request(r2)!.last_activity_at).toBe(1); // the identical repeat records nothing new
  });

  it('deletes requests older than 90 days whole (attempt history included); keeps newer ones and sequence counters', async () => {
    const old = await approvedQuote();
    await send();
    const recent = await approvedQuote();
    age(old.requestId, 91);
    age(recent.requestId, 89);
    const summary = await runRetention(db, Date.now());
    expect(summary).toMatchObject({ requestsDeleted: 1, requestsSkipped: 0 });
    expect(request(old.requestId)).toBeUndefined();
    expect(request(recent.requestId)).toBeDefined();
    for (const [table, column] of [['quotes', 'request_id'], ['email_jobs', 'request_id'], ['quote_events', 'request_id']] as const) {
      expect(count(`${table} WHERE ${column} = ?`, old.requestId), table).toBe(0);
    }
    expect(count('quote_links WHERE quote_id = ?', old.quoteId)).toBe(0);
    expect(count('email_attempts WHERE job_id NOT IN (SELECT id FROM email_jobs)')).toBe(0);
    expect(count('quote_ref_sequences')).toBe(1);
    expect(count('ref_sequences')).toBe(1);
  });

  it('skips a request whose email is being sent, and deletes it on a later run', async () => {
    const { requestId } = await approvedQuote();
    db.raw.prepare("UPDATE email_jobs SET status = 'cancelled' WHERE kind = 'owner_notification'").run();
    mock.script.push('accept_slow');
    const sending = send();
    await vi.waitFor(() => expect(db.raw.prepare("SELECT status FROM email_jobs WHERE kind = 'quotation'").get()).toEqual({ status: 'sending' }));
    age(requestId, 91);
    expect(await runRetention(db, Date.now())).toMatchObject({ requestsDeleted: 0, requestsSkipped: 1 });
    mock.release();
    await sending;
    age(requestId, 91);
    expect(await runRetention(db, Date.now())).toMatchObject({ requestsDeleted: 1 });
  });

  it('works in bounded batches, and purges expired form tokens and old cap warnings', async () => {
    for (let i = 0; i < retentionPolicy.requestsPerRun + 5; i++) age(await storeRequest(), 100);
    db.raw.prepare("INSERT INTO used_form_tokens (token_hash, attempt, used_at, expires_at) VALUES ('old', 'a', 0, ?), ('new', 'b', 0, ?)").run(Date.now() - 2 * DAY, Date.now() + DAY);
    db.raw
      .prepare("INSERT INTO email_jobs (id, kind, resend_seq, idempotency_key, status, next_attempt_at, created_at, updated_at) VALUES ('w', 'owner_cap_warning', 0, 'bt-cap-2000-01-01', 'provider_accepted', 0, ?, ?)")
      .run(Date.now() - 91 * DAY, Date.now() - 91 * DAY);
    const first = await runRetention(db, Date.now());
    expect(first).toEqual({ requestsDeleted: retentionPolicy.requestsPerRun, requestsSkipped: 0, formTokensDeleted: 1, capWarningsDeleted: 1 });
    expect((await runRetention(db, Date.now())).requestsDeleted).toBe(5);
    expect(count('used_form_tokens')).toBe(1);
  });

  // Codex consolidated review, finding 4: a cap warning left in `sending` by a vanished runner.
  describe('old cap warnings left in sending', () => {
    const old = () => Date.now() - 91 * DAY;
    function capWarning(id: string, status: string, leaseUntil: number | null, createdAt = old()) {
      db.raw
        .prepare(
          `INSERT INTO email_jobs (id, kind, resend_seq, idempotency_key, status, attempts, next_attempt_at, lease_id, lease_until, first_attempt_at, created_at, updated_at)
           VALUES (?, 'owner_cap_warning', 0, ?, ?, 1, 0, ?, ?, ?, ?, ?)`,
        )
        .run(id, `bt-cap-${id}`, status, leaseUntil === null ? null : `lease-${id}`, leaseUntil, createdAt, createdAt, createdAt);
      db.raw
        .prepare('INSERT INTO email_attempts (id, job_id, attempt, started_at, send_intent_at) VALUES (?, ?, 1, ?, ?)')
        .run(leaseUntil === null ? `done-${id}` : `lease-${id}`, id, createdAt, createdAt);
    }
    const ids = () => (db.raw.prepare("SELECT id FROM email_jobs WHERE kind = 'owner_cap_warning' ORDER BY id").all() as { id: string }[]).map((r) => r.id);
    const capAttemptJobs = () =>
      (db.raw.prepare("SELECT job_id FROM email_attempts WHERE job_id IN ('a-expired', 'b-live', 'c-stopped', 'd-recent-expired') ORDER BY job_id").all() as { job_id: string }[]).map(
        (r) => r.job_id,
      );

    it('are deleted (with their attempts) once the lease has expired, even with sending off; a live lease is kept', async () => {
      const keep = await approvedQuote(); // an unrelated request's jobs and attempts are untouched
      await send();
      const otherAttempts = count('email_attempts WHERE job_id IN (SELECT id FROM email_jobs WHERE request_id = ?)', keep.requestId);
      expect(otherAttempts).toBeGreaterThan(0);
      const now = Date.now();
      capWarning('a-expired', 'sending', now - 60_000);
      capWarning('b-live', 'sending', now + 60_000);
      capWarning('c-stopped', 'needs_owner', null);
      capWarning('d-recent-expired', 'sending', now - 60_000, now - 10 * DAY);
      const summary = await runScheduledRetention({ ...env, SENDING_ENABLED: 'off' } as OwnerEnv, now);
      expect(summary).toMatchObject({ capWarningsDeleted: 2 });
      expect(ids()).toEqual(['b-live', 'd-recent-expired']);
      expect(capAttemptJobs()).toEqual(['b-live', 'd-recent-expired']);
      expect(count('email_attempts WHERE job_id IN (SELECT id FROM email_jobs WHERE request_id = ?)', keep.requestId)).toBe(otherAttempts);
      expect(count('email_attempts WHERE job_id NOT IN (SELECT id FROM email_jobs)')).toBe(0);
      // Exactly at the lease's end it still counts as live (the sender's recovery uses the same rule).
      expect((await runRetention(db, now + 60_000)).capWarningsDeleted).toBe(0);
      expect((await runRetention(db, now + 60_001)).capWarningsDeleted).toBe(1);
      expect(ids()).toEqual(['d-recent-expired']);
    });

    it('a real runner sending one is never deleted under it; a runner whose lease expired and whose job was deleted writes nothing back', async () => {
      const t = Date.now();
      db.raw.prepare("INSERT INTO intake_daily (day, requests, notifications, cap_reached_at, created_at) VALUES ('2000-01-01', 200, 0, ?, ?)").run(old(), old());
      db.raw
        .prepare("INSERT INTO email_jobs (id, kind, resend_seq, idempotency_key, status, next_attempt_at, created_at, updated_at) VALUES ('w', 'owner_cap_warning', 0, 'bt-cap-2000-01-01', 'queued', 0, ?, ?)")
        .run(old(), old());
      // Live: retention during the send keeps the job.
      mock.script.push('accept_slow');
      const sending = runSender({ db, transport: mock.transport, sender: { from: env.MAIL_FROM!, ownerEmail: TEST_OWNER, ownerOrigin: OWNER_ORIGIN, publicOrigin: PUBLIC_ORIGIN }, linkKey: async () => null, clock: () => t, quotationEmailsReady: false });
      await vi.waitFor(() => expect(mock.calls).toHaveLength(1));
      expect((await runRetention(db, t + sendPolicy.leaseMs - 1)).capWarningsDeleted).toBe(0);
      expect(ids()).toEqual(['w']);
      // The lease expires while the runner still waits; retention then deletes the job and its open attempt.
      expect((await runRetention(db, t + sendPolicy.leaseMs + 1)).capWarningsDeleted).toBe(1);
      expect([ids(), count('email_attempts')]).toEqual([[], 0]);
      mock.release();
      expect((await sending).outcomes).toEqual({ lease_lost: 1 });
      expect([ids(), count('email_attempts')]).toEqual([[], 0]); // nothing recreated or updated
    });
  });

  it('runs on the schedule only with the full owner configuration (fails closed), even when sending is off', async () => {
    const requestId = await storeRequest();
    age(requestId, 91);
    expect(await runScheduledRetention({ ...env, ACCESS_AUD: undefined })).toBeNull();
    expect(request(requestId)).toBeDefined();
    expect(await runScheduledRetention({ ...env, SENDING_ENABLED: 'off' } as OwnerEnv)).toMatchObject({ requestsDeleted: 1 });
  });

  it('every retention statement reads by index, never by scanning earlier records', () => {
    const plan = new DatabaseSync(':memory:');
    const dir = new URL('../migrations/', import.meta.url);
    for (const file of readdirSync(dir).filter((name) => name.endsWith('.sql')).sort()) plan.exec(readFileSync(new URL(file, dir), 'utf8'));
    const statements = [
      'SELECT id FROM quote_requests WHERE last_activity_at < ?1 ORDER BY last_activity_at LIMIT ?2',
      ...deletionSql(purgeGuardSql),
      'DELETE FROM used_form_tokens WHERE rowid IN (SELECT rowid FROM used_form_tokens WHERE expires_at < ?1 LIMIT ?2)',
      capWarningRetentionSql,
      // What the email_attempts_follow_job trigger runs for each deleted job.
      'DELETE FROM email_attempts WHERE job_id = ?1',
    ];
    for (const sql of statements) {
      const details = (plan.prepare(`EXPLAIN QUERY PLAN ${sql}`).all() as { detail: string }[]).map((row) => row.detail);
      expect(details.filter((d) => d.startsWith('SCAN')), sql).toEqual([]);
    }
    expect(plan.prepare(`EXPLAIN QUERY PLAN ${capWarningRetentionSql}`).all().map((row) => (row as { detail: string }).detail)).toContain(
      'SEARCH email_jobs USING INDEX email_jobs_cap_warnings (created_at<?)',
    );
  });
});

describe('sender after lifecycle changes', () => {
  it('a job for a deleted request, or a revoked quotation, is never sent', async () => {
    const { requestId } = await approvedQuote();
    await confirmAndPost(requestId, 'revoke');
    await send(Date.now() + sendPolicy.leaseMs);
    expect(mock.calls.filter((c) => c.key.startsWith('bt-q-'))).toHaveLength(0);
  });
});
