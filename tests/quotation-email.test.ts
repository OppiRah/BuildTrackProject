// Email-job processing (worker/owner/sender.ts, scheduled.ts) against the real migration SQL on
// node:sqlite (SIMULATED D1), with an injected in-memory provider (tests/support/mock-email.ts).
// No network and no email: the Resend transport is exercised only through a stubbed fetch.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import ownerWorker from '../worker/owner/index.ts';
import { handleOwner, validOwnerOrigin, type OwnerEnv } from '../worker/owner/handler.ts';
import { runScheduled, type SenderEnv } from '../worker/owner/scheduled.ts';
import { retryDelay, runSender, sendPolicy, type SenderSetup } from '../worker/owner/sender.ts';
import { currentLinkKey } from '../src/lib/quotation/quote-link.ts';
import { handleIntake } from '../worker/public/intake.ts';
import { classifyResend, RESEND_ENDPOINT, resendTransport } from '../src/lib/quotation/email-transport.ts';
import { setLogSink } from '../src/lib/quotation/log.ts';
import { sha256Hex } from '../src/lib/quotation/owner-form.ts';
import { createTestAccess, TEST_AUD, TEST_OWNER, TEST_TEAM, type TestAccess } from './support/access-jwt.ts';
import { createMockProvider, type MockProvider } from './support/mock-email.ts';
import { createTestDatabase, type TestDatabase } from './support/sqlite-d1.ts';

const OWNER_ORIGIN = 'https://buildtrack-owner.example.test';
const PUBLIC_ORIGIN = 'https://buildtrack.example.test';
const MAIL_FROM = 'BuildTrack <quotes@mail.example.test>';
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const randomKey = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));

let access: TestAccess;
beforeAll(async () => {
  access = await createTestAccess();
});
const keys = async (kid: string) => (kid === access.kid ? access.publicJwk : null);

let db: TestDatabase;
let env: SenderEnv;
let mock: MockProvider;
let logLines: string[];
beforeEach(() => {
  db = createTestDatabase();
  env = {
    DB: db,
    WORKFLOW_ENABLED: 'on',
    SENDING_ENABLED: 'on',
    EMAIL_MODE: 'resend', // these tests cover the retained automatic mode; manual mode: quotation-manual.test.ts
    MAIL_FROM,
    OWNER_ORIGIN,
    PUBLIC_ORIGIN,
    OWNER_EMAIL: TEST_OWNER,
    ACCESS_TEAM_DOMAIN: TEST_TEAM,
    ACCESS_AUD: TEST_AUD,
    OWNER_FORM_KEY: randomKey(),
    QUOTE_LINK_KEY_CURRENT: '1',
    QUOTE_LINK_KEY_V1: randomKey(),
  };
  mock = createMockProvider();
  logLines = [];
  setLogSink((line) => logLines.push(line));
});
afterEach(() => setLogSink(() => {}));

/** Quotation emails are opted in here (customer routes "ready"); the default (committed constant) holds them. */
const run = (now: number | (() => number) = Date.now(), provider = mock) =>
  runScheduled(env, () => provider.transport, now, validOwnerOrigin, { quotationEmailsReady: true });
const customer = { name: 'Maria Test Customer', email: 'maria.customer@example.test', organization: 'Example Builders Inc' };

async function storeRequest(): Promise<string> {
  const response = await handleIntake(
    new Request(`${PUBLIC_ORIGIN}/api/quotation-requests`, {
      method: 'POST',
      body: JSON.stringify({
        service: '',
        plan: 'professional',
        ...customer,
        phone: '',
        organization_type: 'contractors',
        project_need: 'Tracking cement across two sites',
        message: '',
        privacy_ack: 'yes',
        submission_id: crypto.randomUUID(),
      }),
      headers: { 'Content-Type': 'application/json', Origin: PUBLIC_ORIGIN, 'CF-Connecting-IP': `198.51.100.${Math.floor(Math.random() * 200)}` },
    }),
    { DB: db, WORKFLOW_ENABLED: 'on', PUBLIC_ORIGIN, INTAKE_HMAC_KEY: randomKey(), INTAKE_HMAC_KEY_VERSION: '1', EMAIL_MODE: 'resend' },
  );
  const { reference } = (await response.json()) as { reference: string };
  return (db.raw.prepare('SELECT id FROM quote_requests WHERE ref = ?').get(reference) as { id: string }).id;
}

async function owner(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Cf-Access-Jwt-Assertion', await access.sign());
  if (init.method === 'POST') {
    headers.set('Content-Type', 'application/x-www-form-urlencoded');
    headers.set('Origin', OWNER_ORIGIN);
  }
  return handleOwner(new Request(`${OWNER_ORIGIN}${path}`, { ...init, headers }), env as OwnerEnv, keys);
}
const formOf = (html: string) => ({
  form_token: /name="form_token" value="([^"]+)"/.exec(html)?.[1] ?? '',
  version: /name="version" value="(\d+)"/.exec(html)?.[1] ?? '',
});

/** A stored request whose quotation the owner approved; returns ids. */
async function approvedQuote(): Promise<{ requestId: string; quoteId: string }> {
  const requestId = await storeRequest();
  const detail = formOf(await (await owner(`/requests/${requestId}`)).text());
  const fields = { ...detail, scope: 'Starter setup for two sites, with training.', amount: '7,990', validity_days: '14' };
  expect((await owner(`/requests/${requestId}/draft`, { method: 'POST', body: new URLSearchParams(fields).toString() })).status).toBe(303);
  const confirm = formOf(await (await owner(`/requests/${requestId}/confirm`)).text());
  expect((await owner(`/requests/${requestId}/approve`, { method: 'POST', body: new URLSearchParams(confirm).toString() })).status).toBe(303);
  const quoteId = (db.raw.prepare('SELECT id FROM quotes WHERE request_id = ?').get(requestId) as { id: string }).id;
  return { requestId, quoteId };
}
const job = (where: string) => db.raw.prepare(`SELECT * FROM email_jobs WHERE ${where}`).get() as Record<string, any>;
const allText = () =>
  JSON.stringify(
    ['quote_requests', 'quotes', 'quote_events', 'email_jobs', 'used_form_tokens', 'intake_daily', 'client_counters'].map((table) => db.raw.prepare(`SELECT * FROM ${table}`).all()),
  );

describe('sending fails closed without full configuration', () => {
  it.each([
    ['SENDING_ENABLED off', { SENDING_ENABLED: 'off' }],
    ['WORKFLOW_ENABLED off', { WORKFLOW_ENABLED: undefined }],
    ['no D1', { DB: undefined }],
    ['MAIL_FROM missing', { MAIL_FROM: undefined }],
    ['MAIL_FROM with a line break', { MAIL_FROM: 'BuildTrack <a@example.test>\r\nBcc: x@example.test' }],
    ['OWNER_EMAIL invalid', { OWNER_EMAIL: 'owner' }],
    ['OWNER_ORIGIN on HTTP', { OWNER_ORIGIN: 'http://127.0.0.1:8788' }],
    ['PUBLIC_ORIGIN missing', { PUBLIC_ORIGIN: undefined }],
    ['PUBLIC_ORIGIN with a path', { PUBLIC_ORIGIN: `${PUBLIC_ORIGIN}/quote` }],
    ['the link key missing', { QUOTE_LINK_KEY_V1: undefined }],
    ['ACCESS_AUD missing', { ACCESS_AUD: undefined }],
    ['ACCESS_TEAM_DOMAIN invalid', { ACCESS_TEAM_DOMAIN: 'evil.example.test' }],
    ['OWNER_FORM_KEY missing', { OWNER_FORM_KEY: undefined }],
    ['OWNER_FORM_KEY too short', { OWNER_FORM_KEY: btoa('short') }],
  ] as const)('%s: nothing is claimed, sent or read', async (_label, change) => {
    await storeRequest();
    const before = allText();
    let calls = 0;
    const counted = { prepare: (sql: string) => (calls++, db.prepare(sql)), batch: (s: never[]) => (calls++, db.batch(s)) };
    env = { ...env, DB: counted as unknown as SenderEnv['DB'], ...change } as SenderEnv;
    expect(await run()).toBeNull();
    expect([calls, mock.calls.length, allText() === before]).toEqual([0, 0, true]);
    expect(logLines).toContain(JSON.stringify({ event: 'sending_unavailable', route: 'owner' }));
  });

  it('the deployable entry builds no transport except Resend with a key, and has no mock mode', async () => {
    await storeRequest();
    const outbound = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ id: 'never' }));
    try {
      for (const mode of [{ EMAIL_MODE: 'mock' }, { EMAIL_MODE: 'test' }, { EMAIL_MODE: 'resend', RESEND_API_KEY: undefined }, { EMAIL_MODE: undefined }]) {
        await ownerWorker.scheduled({}, { ...env, ...mode });
      }
      expect(outbound).not.toHaveBeenCalled();
      // Every mode except "resend" is manual email mode: the waiting job is cancelled and kept, never sent.
      expect(job("kind = 'owner_notification'")).toMatchObject({ status: 'cancelled', attempts: 0, last_result: 'E_MANUAL_MODE' });
    } finally {
      outbound.mockRestore();
    }
  });

  it('fully configured, the deployable entry sends through the Resend API contract (fetch stubbed; no network)', async () => {
    await storeRequest();
    const requests: { url: string; init: RequestInit }[] = [];
    const outbound = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      requests.push({ url: String(url), init: init! });
      return Response.json({ id: 'resend-message-id' });
    });
    try {
      await ownerWorker.scheduled({}, { ...env, EMAIL_MODE: 'resend', RESEND_API_KEY: 're_test_not_a_real_key' });
    } finally {
      outbound.mockRestore();
    }
    expect(requests).toHaveLength(1);
    const { url, init } = requests[0]!;
    const headers = new Headers(init.headers);
    expect([url, init.method, headers.get('authorization'), headers.get('content-type')]).toEqual([RESEND_ENDPOINT, 'POST', 'Bearer re_test_not_a_real_key', 'application/json']);
    const notification = job("kind = 'owner_notification'");
    expect(headers.get('idempotency-key')).toBe(notification.idempotency_key);
    const body = JSON.parse(String(init.body));
    expect(Object.keys(body).sort()).toEqual(['from', 'subject', 'text', 'to']);
    expect([body.from, body.to]).toEqual([MAIL_FROM, [TEST_OWNER]]);
    expect(notification).toMatchObject({ status: 'provider_accepted', provider_message_id: 'resend-message-id', attempts: 1 });
    expect(logLines.join('\n')).not.toContain('re_test_not_a_real_key');
  });
});

describe('owner notifications and quotation emails', () => {
  it('sends the owner notification without customer details and freezes its snapshot', async () => {
    const requestId = await storeRequest();
    const summary = await run();
    expect(summary).toMatchObject({ claimed: 1, outcomes: { accepted: 1 } });
    const [sent] = mock.inbox;
    expect(sent!.message.to).toBe(TEST_OWNER);
    const ref = (db.raw.prepare('SELECT ref FROM quote_requests WHERE id = ?').get(requestId) as { ref: string }).ref;
    expect(sent!.message.subject).toBe(`New quotation request ${ref}`);
    expect(sent!.message.text).toContain(`${OWNER_ORIGIN}/requests/${requestId}`);
    for (const value of Object.values(customer)) expect(JSON.stringify(sent!.message)).not.toContain(value);
    const row = job("kind = 'owner_notification'");
    expect(row).toMatchObject({ status: 'provider_accepted', to_address: TEST_OWNER, template_version: 'v1', provider_message_id: sent!.messageId, attempts: 1 });
    expect(row.payload_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(row.lease_id).toBeNull();
  });

  it('sends the approved quotation with the rebuilt link, records provider acceptance (not delivery), and stores no link', async () => {
    const { requestId, quoteId } = await approvedQuote();
    await run();
    const quotation = mock.inbox.find((entry) => entry.key.startsWith('bt-q-'))!;
    expect(quotation.key).toBe(`bt-q-${quoteId}-g1-s0`);
    expect(quotation.message.to).toBe(customer.email);
    expect(quotation.message.subject).toMatch(/^Your BuildTrack quotation BT-Q-\d{4}-0001$/);
    for (const part of [`Hello ${customer.name},`, 'Starter setup for two sites, with training.', '₱7,990.00 (PHP)', 'No payment is due']) expect(quotation.message.text).toContain(part);
    const token = /\/quote\/#t=(v1\.[A-Za-z0-9_-]{43})$/m.exec(quotation.message.text)?.[1];
    expect(quotation.message.text).toContain(`${PUBLIC_ORIGIN}/quote/#t=`);
    const quote = db.raw.prepare('SELECT * FROM quotes WHERE id = ?').get(quoteId) as Record<string, any>;
    expect(await sha256Hex(token!)).toBe(quote.token_hash);
    expect(quote.status).toBe('emailed'); // accepted by the provider; the owner page says it is not delivery
    expect(allText()).not.toContain(token!);
    expect(logLines.join('\n')).not.toContain(token!);
    const page = await (await owner(`/requests/${requestId}`)).text();
    expect(page).toContain('Accepted by the email provider. This does not confirm that it reached the inbox.');
  });

  it('queues at most one cap warning per UTC day, even across concurrent runs, without customer details', async () => {
    const now = Date.now();
    const today = new Date(now).toISOString().slice(0, 10);
    const yesterday = new Date(now - 24 * HOUR).toISOString().slice(0, 10);
    const older = new Date(now - 3 * 24 * HOUR).toISOString().slice(0, 10);
    for (const day of [today, yesterday, older]) {
      db.raw.prepare('INSERT INTO intake_daily (day, requests, notifications, cap_reached_at, created_at) VALUES (?, 200, 30, ?, ?)').run(day, now - 1000, now - 1000);
    }
    await Promise.all([run(now), run(now), run(now + MINUTE)]);
    await run(now + 2 * MINUTE);
    const warnings = db.raw.prepare("SELECT idempotency_key, status FROM email_jobs WHERE kind = 'owner_cap_warning' ORDER BY idempotency_key").all();
    expect(warnings).toEqual([
      { idempotency_key: `bt-cap-${yesterday}`, status: 'provider_accepted' },
      { idempotency_key: `bt-cap-${today}`, status: 'provider_accepted' },
    ]);
    expect(mock.inbox.filter((entry) => entry.key.startsWith('bt-cap-'))).toHaveLength(2);
    expect(mock.calls.filter((call) => call.key.startsWith('bt-cap-'))).toHaveLength(2);
    expect(mock.inbox[0]!.message.to).toBe(TEST_OWNER);
  });
});

describe('concurrency, crashes and uncertain outcomes', () => {
  it('two concurrent runners make exactly one provider call per job', async () => {
    const slow = createMockProvider(20);
    for (let i = 0; i < 4; i++) await storeRequest();
    const now = Date.now();
    await Promise.all([run(now, slow), run(now, slow), run(now, slow)]);
    expect(slow.calls).toHaveLength(4);
    expect(new Set(slow.calls.map((call) => call.key)).size).toBe(4);
    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM email_jobs WHERE status = 'provider_accepted' AND attempts = 1").get()).toEqual({ n: 4 });
  });

  it('a crashed runner’s lease expires; the retry reuses the key, so the provider sends once', async () => {
    await storeRequest();
    const now = Date.now();
    mock.script.push('accept_slow'); // accepted by the provider, then the runner never hears back
    const crashed = run(now); // left running: it stands for a runner that died
    await vi.waitFor(() => expect(job('1').status).toBe('sending'));
    const later = now + sendPolicy.leaseMs + 1;
    // The lease expired, so the job is due again as ambiguous. The provider still holds the
    // crashed call open under the same key and answers "in progress" (documented 409
    // concurrent_idempotent_requests): still ambiguous, retried later.
    expect(await run(later)).toMatchObject({ leasesRecovered: 1, outcomes: { ambiguous: 1 } });
    expect(job('1')).toMatchObject({ status: 'retry_wait', attempts: 2, ambiguous: 1, last_result: 'E_IDEMPOTENCY_IN_PROGRESS' });
    mock.release();
    await crashed; // the old runner wakes up: its lease is gone, so it changes nothing
    expect(job('1')).toMatchObject({ status: 'retry_wait', attempts: 2 });
    expect(logLines.some((line) => line.includes('E_LEASE_LOST'))).toBe(true);
    await run(later + retryDelay(2));
    expect(job('1')).toMatchObject({ status: 'provider_accepted', attempts: 3, ambiguous: 1 });
    expect(mock.inbox).toHaveLength(1); // one email, despite three attempts
    expect(new Set(mock.calls.map((call) => call.key)).size).toBe(1);
  });

  it('a timeout after possible acceptance is ambiguous and retried with the same key and payload', async () => {
    await storeRequest();
    const now = Date.now();
    mock.script.push('accept_then_timeout');
    await run(now);
    const first = job('1');
    expect(first).toMatchObject({ status: 'retry_wait', ambiguous: 1, attempts: 1, last_result: 'E_TIMEOUT', next_attempt_at: now + retryDelay(1) });
    expect(await run(now + 30 * 1000)).toMatchObject({ claimed: 0 }); // not due yet
    await run(now + retryDelay(1));
    expect(job('1')).toMatchObject({ status: 'provider_accepted', attempts: 2, payload_sha256: first.payload_sha256 });
    expect(mock.inbox).toHaveLength(1);
    expect(mock.calls.map((call) => call.key)).toEqual([first.idempotency_key, first.idempotency_key]);
  });

  it('a provider call that never answers is aborted at the timeout and treated as ambiguous', async () => {
    await storeRequest();
    const timeout = sendPolicy.timeoutMs;
    sendPolicy.timeoutMs = 50;
    try {
      mock.script.push('hang');
      await run();
    } finally {
      sendPolicy.timeoutMs = timeout;
    }
    expect(job('1')).toMatchObject({ status: 'retry_wait', ambiguous: 1, last_result: 'E_TIMEOUT' });
  });

  it('retries are bounded: they stop inside the 24-hour idempotency window and the owner is told the outcome is unknown', async () => {
    const { requestId } = await approvedQuote();
    const start = Date.now();
    let now = start;
    mock.script.push(...Array(100).fill('server_error'));
    for (let i = 0; i < 60; i++) {
      await run(now);
      const next = db.raw.prepare("SELECT MIN(next_attempt_at) AS t FROM email_jobs WHERE status IN ('queued', 'retry_wait')").get() as { t: number | null };
      if (next.t === null) break;
      now = next.t;
    }
    const quotation = job("kind = 'quotation'");
    expect(quotation.status).toBe('needs_owner');
    expect(quotation.last_result).toBe('E_WINDOW_CLOSED');
    expect(quotation.ambiguous).toBe(1);
    const lastCall = Math.max(...db.raw.prepare("SELECT updated_at FROM email_jobs WHERE kind = 'quotation'").all().map((r: any) => r.updated_at));
    expect(lastCall - quotation.first_attempt_at).toBeLessThanOrEqual(sendPolicy.windowMs);
    // 1, 5, 15, 30 minutes, then hourly, until 20 hours after the first attempt.
    expect(quotation.attempts).toBeGreaterThanOrEqual(20);
    expect(quotation.attempts).toBeLessThanOrEqual(25);
    const page = await (await owner(`/requests/${requestId}`)).text();
    expect(page).toContain('Outcome unknown');
    expect(page).toContain('Check the provider&#39;s dashboard before sending again.');
    expect(mock.inbox.filter((entry) => entry.key.startsWith('bt-q-'))).toHaveLength(0);
  });

  it('a definite rejection stops at once; rate limiting retries without being marked ambiguous', async () => {
    await storeRequest();
    await storeRequest();
    mock.script.push('reject', 'rate_limited');
    const now = Date.now();
    await run(now);
    const rows = db.raw.prepare('SELECT status, ambiguous, attempts, last_result FROM email_jobs ORDER BY last_result').all();
    expect(rows).toEqual([
      { status: 'retry_wait', ambiguous: 0, attempts: 1, last_result: 'E_RATE_LIMITED' },
      { status: 'needs_owner', ambiguous: 0, attempts: 1, last_result: 'E_REJECTED_422' },
    ]);
  });
});

describe('immutable snapshots and payloads', () => {
  it('the database refuses changes to an approved snapshot and to a job’s frozen snapshot', async () => {
    const { quoteId } = await approvedQuote();
    await run();
    expect(() => db.raw.prepare("UPDATE quotes SET snap_email = 'attacker@example.test' WHERE id = ?").run(quoteId)).toThrow(/immutable/);
    expect(() => db.raw.prepare("UPDATE quotes SET snap_amount_centavos = 1 WHERE id = ?").run(quoteId)).toThrow(/immutable/);
    expect(() => db.raw.prepare("UPDATE email_jobs SET to_address = 'attacker@example.test' WHERE kind = 'quotation'").run()).toThrow(/immutable/);
    expect(() => db.raw.prepare("UPDATE email_jobs SET idempotency_key = 'other' WHERE kind = 'quotation'").run()).toThrow(/immutable/);
    expect(() => db.raw.prepare("UPDATE email_jobs SET payload_sha256 = 'x' WHERE kind = 'quotation'").run()).toThrow(/immutable/);
  });

  it('a retry whose content would differ is not sent; the owner is asked instead', async () => {
    const { quoteId } = await approvedQuote();
    mock.script.push('accept', 'server_error'); // notification accepted; quotation attempt fails
    const now = Date.now();
    await run(now);
    env = { ...env, PUBLIC_ORIGIN: 'https://moved.example.test' }; // the link base changed between attempts
    await run(now + retryDelay(1));
    expect(job(`quote_id = '${quoteId}'`)).toMatchObject({ status: 'needs_owner', last_result: 'E_PAYLOAD_CHANGED' });
    expect(mock.calls.filter((call) => call.key.startsWith('bt-q-'))).toHaveLength(1);
  });

  it('a link that no longer matches the approved hash (changed key) is never sent', async () => {
    const { quoteId } = await approvedQuote();
    env = { ...env, QUOTE_LINK_KEY_V1: randomKey() };
    await run();
    expect(job(`quote_id = '${quoteId}'`)).toMatchObject({ status: 'needs_owner', last_result: 'E_LINK_MISMATCH', payload_sha256: null });
    expect(mock.calls.filter((call) => call.key.startsWith('bt-q-'))).toHaveLength(0);
  });

  it('an expired quotation is not sent', async () => {
    const { quoteId } = await approvedQuote();
    const expires = (db.raw.prepare('SELECT expires_at FROM quotes WHERE id = ?').get(quoteId) as { expires_at: number }).expires_at;
    await run(expires + 1);
    expect(job(`quote_id = '${quoteId}'`)).toMatchObject({ status: 'needs_owner', last_result: 'E_QUOTE_EXPIRED' });
  });
});

describe('explicit owner resend outside the window', () => {
  async function stoppedAmbiguous() {
    const ids = await approvedQuote();
    mock.script.push('accept', 'accept_then_timeout');
    const now = Date.now();
    await run(now);
    db.raw.prepare("UPDATE email_jobs SET status = 'needs_owner', last_result = 'E_WINDOW_CLOSED' WHERE kind = 'quotation'").run();
    return ids;
  }

  it('is offered only for a stopped job, warns about duplicates, and needs a confirmed POST', async () => {
    const { requestId, quoteId } = await stoppedAmbiguous();
    const before = allText();
    const page = await (await owner(`/requests/${requestId}/resend`)).text();
    expect(allText()).toBe(before); // GET changes nothing
    expect(page).toContain('The customer may receive two copies.');
    const fields = formOf(page);
    expect((await owner(`/requests/${requestId}/resend`, { method: 'POST', body: new URLSearchParams(fields).toString() })).status).toBe(303);
    // The same token again: it was bound to the job that is no longer the latest, so it is refused.
    expect((await owner(`/requests/${requestId}/resend`, { method: 'POST', body: new URLSearchParams(fields).toString() })).status).toBe(403);
    const jobs = db.raw.prepare("SELECT idempotency_key, status FROM email_jobs WHERE kind = 'quotation' ORDER BY resend_seq").all();
    expect(jobs).toEqual([
      { idempotency_key: `bt-q-${quoteId}-g1-s0`, status: 'needs_owner' },
      { idempotency_key: `bt-q-${quoteId}-g1-s1`, status: 'queued' },
    ]);
    await run(Date.now() + MINUTE);
    expect(job(`idempotency_key = 'bt-q-${quoteId}-g1-s1'`).status).toBe('provider_accepted');
    // A new key: the provider cannot de-duplicate it, which is why the page warned.
    expect(mock.inbox.filter((entry) => entry.key.startsWith('bt-q-'))).toHaveLength(2);
    expect((await owner(`/requests/${requestId}/resend`)).status).toBe(303); // no longer offered
  });

  it('refuses a resend from another origin, with a forged token, or while the job is still retrying', async () => {
    const { requestId } = await stoppedAmbiguous();
    const fields = formOf(await (await owner(`/requests/${requestId}/resend`)).text());
    const crossSite = await handleOwner(
      new Request(`${OWNER_ORIGIN}/requests/${requestId}/resend`, {
        method: 'POST',
        body: new URLSearchParams(fields).toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://attacker.example.test', 'Cf-Access-Jwt-Assertion': await access.sign() },
      }),
      env as OwnerEnv,
      keys,
    );
    expect(crossSite.status).toBe(403);
    expect((await owner(`/requests/${requestId}/resend`, { method: 'POST', body: new URLSearchParams({ ...fields, form_token: 'forged' }).toString() })).status).toBe(403);
    db.raw.prepare("UPDATE email_jobs SET status = 'retry_wait' WHERE kind = 'quotation'").run();
    expect((await owner(`/requests/${requestId}/resend`, { method: 'POST', body: new URLSearchParams(fields).toString() })).status).toBe(409);
    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM email_jobs WHERE kind = 'quotation'").get()).toEqual({ n: 1 });
  });
});

describe('redaction', () => {
  it('logs and stored results hold fixed codes only: no addresses, names, subjects, links or keys', async () => {
    await approvedQuote();
    mock.script.push('accept_then_timeout', 'server_error', 'reject');
    const now = Date.now();
    await run(now);
    await run(now + HOUR);
    const output = logLines.join('\n');
    const sentText = JSON.stringify(mock.inbox);
    const token = /#t=(v1\.[A-Za-z0-9_-]{43})/.exec(sentText)?.[1];
    for (const value of [...Object.values(customer), TEST_OWNER, 'quotes@mail.example.test', 'BuildTrack quotation', 'New quotation request', env.QUOTE_LINK_KEY_V1!, env.OWNER_FORM_KEY!]) {
      expect(output).not.toContain(value);
    }
    if (token) expect(output).not.toContain(token);
    for (const row of db.raw.prepare('SELECT last_result FROM email_jobs WHERE last_result IS NOT NULL').all() as { last_result: string }[]) {
      expect(row.last_result).toMatch(/^(E_[A-Z0-9_]+|OK_ACCEPTED)$/);
    }
  });
});

describe('Resend response classification (documented contract; fetch stubbed)', () => {
  it.each([
    [200, { id: 'abc' }, 'accepted'],
    [200, {}, 'ambiguous'],
    [200, null, 'ambiguous'],
    [409, { name: 'invalid_idempotent_request' }, 'rejected'],
    [409, { name: 'concurrent_idempotent_requests' }, 'ambiguous'],
    [409, {}, 'ambiguous'],
    [429, { name: 'rate_limit_exceeded' }, 'rate_limited'],
    [429, { name: 'daily_quota_exceeded' }, 'rate_limited'],
    [500, { name: 'application_error' }, 'ambiguous'],
    [503, null, 'ambiguous'],
    [400, { name: 'validation_error' }, 'rejected'],
    [401, { name: 'missing_api_key' }, 'rejected'],
    [403, { name: 'validation_error' }, 'rejected'],
    [422, { name: 'missing_required_field' }, 'rejected'],
  ] as const)('%i %j -> %s', (status, body, outcome) => {
    expect(classifyResend(status, body, null).outcome).toBe(outcome);
  });

  it('reads retry-after (bounded) and maps network failures and aborts to ambiguous', async () => {
    expect(classifyResend(429, {}, '7')).toEqual({ outcome: 'rate_limited', code: 'E_RATE_LIMITED', retryAfterMs: 7000 });
    expect(classifyResend(429, {}, '999999')).toMatchObject({ retryAfterMs: 3600 * 1000 });
    expect(classifyResend(429, {}, 'soon')).toMatchObject({ retryAfterMs: null });
    const message = { from: MAIL_FROM, to: 'a@example.test', subject: 's', text: 't' };
    const failing = resendTransport('re_key', (async () => {
      throw new TypeError('network');
    }) as unknown as typeof fetch);
    expect(await failing.send(message, 'k', new AbortController().signal)).toEqual({ outcome: 'ambiguous', code: 'E_NETWORK' });
    const aborted = new AbortController();
    aborted.abort();
    expect(await failing.send(message, 'k', aborted.signal)).toEqual({ outcome: 'ambiguous', code: 'E_TIMEOUT' });
    const unreadable = resendTransport('re_key', (async () => new Response('not json', { status: 200 })) as unknown as typeof fetch);
    expect(await unreadable.send(message, 'k', new AbortController().signal)).toEqual({ outcome: 'ambiguous', code: 'E_ACCEPTED_NO_ID' });
  });
});

describe('checkpoint 3 review repairs', () => {
  /** A runner with a controllable clock, a hook inside rendering (an await before the send), and an optional DB hook. */
  async function controlledRun(options: { start: number; duringRender?: (clock: { t: number }) => void; afterMark?: (clock: { t: number }) => void }) {
    const clock = { t: options.start };
    const link = (await currentLinkKey(env as Record<string, unknown>))!;
    const database = options.afterMark
      ? {
          prepare: (sql: string) => {
            const statement = db.prepare(sql);
            if (!sql.includes('send_intent_at = ?3')) return statement;
            return {
              bind: (...values: (string | number | null)[]) => {
                const bound = statement.bind(...values);
                return { ...bound, run: async () => { const result = await bound.run(); options.afterMark!(clock); return result; } };
              },
            };
          },
          batch: (statements: never[]) => db.batch(statements),
        }
      : db;
    const setup: SenderSetup = {
      db: database as unknown as SenderSetup['db'],
      transport: mock.transport,
      sender: { from: MAIL_FROM, ownerEmail: TEST_OWNER, ownerOrigin: OWNER_ORIGIN, publicOrigin: PUBLIC_ORIGIN },
      linkKey: async () => {
        options.duringRender?.(clock);
        return link;
      },
      clock: () => clock.t,
      quotationEmailsReady: true,
    };
    return runSender(setup);
  }
  const quotationJob = () => job("kind = 'quotation'");
  /** intent: a send intent was recorded; called: the transport was actually invoked. */
  const quotationAttempts = () =>
    db.raw
      .prepare(
        "SELECT a.attempt, a.send_intent_at IS NOT NULL AS intent, a.provider_called_at IS NOT NULL AS called, a.outcome FROM email_attempts a JOIN email_jobs j ON j.id = a.job_id WHERE j.kind = 'quotation' ORDER BY a.attempt",
      )
      .all();
  const quotationCalls = () => mock.calls.filter((call) => call.key.startsWith('bt-q-')).length;

  async function quotationAfterAmbiguousAttempt(): Promise<{ start: number; firstAttempt: number }> {
    await approvedQuote();
    mock.script.push('accept', 'server_error'); // notification accepted; first quotation attempt ambiguous
    const start = Date.now();
    await run(start);
    return { start, firstAttempt: quotationJob().first_attempt_at };
  }

  it('send boundary: the 20-hour deadline passing during an await stops the send', async () => {
    const { firstAttempt } = await quotationAfterAmbiguousAttempt();
    await controlledRun({ start: firstAttempt + sendPolicy.windowMs - 10, duringRender: (c) => (c.t = firstAttempt + sendPolicy.windowMs) });
    expect(quotationJob()).toMatchObject({ status: 'needs_owner', last_result: 'E_WINDOW_CLOSED' });
    expect(quotationCalls()).toBe(1);
    expect(quotationAttempts()).toEqual([
      { attempt: 1, intent: 1, called: 1, outcome: 'E_PROVIDER_5XX' },
      { attempt: 2, intent: 0, called: 0, outcome: 'E_WINDOW_CLOSED' },
    ]);
  });

  it('send boundary: the quotation expiring during an await stops the send', async () => {
    const { quoteId } = await approvedQuote();
    mock.script.push('accept');
    const expires = (db.raw.prepare('SELECT expires_at FROM quotes WHERE id = ?').get(quoteId) as { expires_at: number }).expires_at;
    await controlledRun({ start: expires - 5000, duringRender: (c) => (c.t = expires) });
    expect(quotationJob()).toMatchObject({ status: 'needs_owner', last_result: 'E_QUOTE_EXPIRED' });
    expect(quotationCalls()).toBe(0);
  });

  it('send boundary: a runner whose lease was taken over during an await does not send (a first attempt)', async () => {
    await approvedQuote();
    mock.script.push('accept');
    const summary = await controlledRun({
      start: Date.now(),
      duringRender: () => db.raw.prepare("UPDATE email_jobs SET lease_id = 'other-runner' WHERE kind = 'quotation'").run(),
    });
    expect(summary.outcomes.lease_lost).toBe(1);
    expect(quotationCalls()).toBe(0);
  });

  it('send boundary: on a retry (payload already frozen), only the lease-checked mark stops a taken-over runner', async () => {
    const { start } = await quotationAfterAmbiguousAttempt();
    const summary = await controlledRun({
      start: start + retryDelay(1),
      // Another runner recovered and re-claimed the job meanwhile.
      duringRender: () => db.raw.prepare("UPDATE email_jobs SET lease_id = 'other-runner' WHERE kind = 'quotation'").run(),
    });
    expect(summary.outcomes.lease_lost).toBe(1);
    expect(quotationCalls()).toBe(1); // only the first, earlier attempt
    expect(quotationJob()).toMatchObject({ status: 'sending', lease_id: 'other-runner' }); // untouched: the other runner owns it
    expect(quotationAttempts()).toEqual([
      { attempt: 1, intent: 1, called: 1, outcome: 'E_PROVIDER_5XX' },
      { attempt: 2, intent: 0, called: 0, outcome: null },
    ]);
  });

  it('send boundary: a lease that expired by the clock during an await stops the send; recovery adds no ambiguity (no intent)', async () => {
    await approvedQuote();
    mock.script.push('accept');
    const start = Date.now();
    await controlledRun({ start, duringRender: (c) => (c.t = start + sendPolicy.leaseMs + 1) });
    expect(quotationCalls()).toBe(0);
    expect(quotationJob()).toMatchObject({ status: 'sending' });
    // The next run recovers it. No send intent was recorded, so it is not ambiguous.
    expect(await run(start + sendPolicy.leaseMs + 2)).toMatchObject({ leasesRecovered: 1 });
    expect(quotationAttempts()).toEqual([
      { attempt: 1, intent: 0, called: 0, outcome: 'E_LEASE_EXPIRED_BEFORE_SEND' },
      { attempt: 2, intent: 1, called: 1, outcome: 'OK_ACCEPTED' },
    ]);
    expect(quotationJob()).toMatchObject({ status: 'provider_accepted', ambiguous: 0 });
  });

  it('skipped call after the intent: a deadline passing during the pre-send write closes the attempt, keeping earlier ambiguity', async () => {
    const { firstAttempt } = await quotationAfterAmbiguousAttempt();
    await controlledRun({ start: firstAttempt + sendPolicy.windowMs - 10, afterMark: (c) => (c.t = firstAttempt + sendPolicy.windowMs) });
    expect(quotationCalls()).toBe(1); // only the earlier, real attempt
    expect(quotationJob()).toMatchObject({ status: 'needs_owner', last_result: 'E_WINDOW_CLOSED', ambiguous: 1, lease_id: null });
    expect(quotationAttempts()[1]).toEqual({ attempt: 2, intent: 1, called: 0, outcome: 'E_WINDOW_CLOSED' });
  });

  it('skipped call after the intent: expiry during the pre-send write stops the job cleanly; later runs add no ambiguity', async () => {
    const { requestId, quoteId } = await approvedQuote();
    db.raw.prepare("UPDATE email_jobs SET status = 'cancelled' WHERE kind = 'owner_notification'").run();
    const expires = (db.raw.prepare('SELECT expires_at FROM quotes WHERE id = ?').get(quoteId) as { expires_at: number }).expires_at;
    await controlledRun({ start: expires - 5000, afterMark: (c) => (c.t = expires) });
    expect(quotationCalls()).toBe(0);
    expect(quotationJob()).toMatchObject({ status: 'needs_owner', last_result: 'E_QUOTE_EXPIRED', ambiguous: 0, lease_id: null });
    expect(quotationAttempts()).toEqual([{ attempt: 1, intent: 1, called: 0, outcome: 'E_QUOTE_EXPIRED' }]);
    expect(await run(expires + sendPolicy.leaseMs + 1)).toMatchObject({ leasesRecovered: 0, claimed: 0 });
    expect(quotationJob()).toMatchObject({ ambiguous: 0 });
    const page = (await (await owner(`/requests/${requestId}`)).text()).replace(/&#39;/g, "'");
    expect(page).toContain('Not sent: the email provider has not accepted the quotation email.');
    expect(page).not.toContain('Unknown whether');
  });

  it('skipped call after the intent: too little lease left reschedules without ambiguity; no false duplicate warning later', async () => {
    const { requestId } = await approvedQuote();
    db.raw.prepare("UPDATE email_jobs SET status = 'cancelled' WHERE kind = 'owner_notification'").run();
    const start = Date.now();
    const shortAt = start + sendPolicy.leaseMs - sendPolicy.timeoutMs;
    const summary = await controlledRun({ start, afterMark: (c) => (c.t = shortAt) });
    expect(summary.outcomes.skipped).toBe(1);
    expect(quotationCalls()).toBe(0);
    expect(quotationJob()).toMatchObject({ status: 'retry_wait', last_result: 'E_LEASE_TOO_SHORT', ambiguous: 0, lease_id: null, next_attempt_at: shortAt });
    expect(quotationAttempts()).toEqual([{ attempt: 1, intent: 1, called: 0, outcome: 'E_LEASE_TOO_SHORT' }]);
    // Not stranded: the next run tries again (here the provider definitely rejects it).
    mock.script.push('reject');
    expect(await run(shortAt + 1)).toMatchObject({ leasesRecovered: 0, outcomes: { rejected: 1 } });
    expect(quotationJob()).toMatchObject({ status: 'needs_owner', ambiguous: 0 });
    const resendPage = await (await owner(`/requests/${requestId}/resend`)).text();
    expect(resendPage).toContain('Send quotation');
    expect(resendPage).not.toContain('two copies');
  });

  it('skipped call after the intent: if ownership was lost meanwhile, the skip writes nothing over the newer runner', async () => {
    const { quoteId } = await approvedQuote();
    db.raw.prepare("UPDATE email_jobs SET status = 'cancelled' WHERE kind = 'owner_notification'").run();
    const expires = (db.raw.prepare('SELECT expires_at FROM quotes WHERE id = ?').get(quoteId) as { expires_at: number }).expires_at;
    await controlledRun({
      start: expires - 5000,
      afterMark: (c) => {
        c.t = expires;
        db.raw.prepare("UPDATE email_jobs SET lease_id = 'newer-runner' WHERE kind = 'quotation'").run();
      },
    });
    expect(quotationCalls()).toBe(0);
    expect(quotationJob()).toMatchObject({ status: 'sending', lease_id: 'newer-runner', last_result: null });
    expect(quotationAttempts()).toEqual([{ attempt: 1, intent: 1, called: 0, outcome: null }]);
  });

  it('a genuine crash after the intent stays conservative: recovery marks it ambiguous', async () => {
    await approvedQuote();
    db.raw.prepare("UPDATE email_jobs SET status = 'cancelled' WHERE kind = 'owner_notification'").run();
    mock.script.push('accept_slow'); // the call is made and never reported back (the runner "dies")
    const start = Date.now();
    const crashed = run(start);
    await vi.waitFor(() => expect(quotationCalls()).toBe(1));
    await run(start + sendPolicy.leaseMs + 1);
    expect(quotationAttempts()[0]).toEqual({ attempt: 1, intent: 1, called: 0, outcome: 'E_LEASE_EXPIRED' });
    expect(quotationJob()).toMatchObject({ ambiguous: 1 });
    mock.release();
    await crashed;
  });

  it('resend warning: an ambiguous first send keeps the warning after a new-key rejection', async () => {
    const { requestId } = await approvedQuote();
    mock.script.push('accept', 'accept_then_timeout');
    const now = Date.now();
    await run(now);
    db.raw.prepare("UPDATE email_jobs SET status = 'needs_owner', last_result = 'E_WINDOW_CLOSED' WHERE kind = 'quotation'").run();
    const first = formOf(await (await owner(`/requests/${requestId}/resend`)).text());
    expect((await owner(`/requests/${requestId}/resend`, { method: 'POST', body: new URLSearchParams(first).toString() })).status).toBe(303);
    mock.script.push('reject'); // the new key is definitely rejected (not ambiguous)
    await run(now + MINUTE);
    expect(db.raw.prepare("SELECT resend_seq, status, ambiguous FROM email_jobs WHERE kind = 'quotation' ORDER BY resend_seq").all()).toEqual([
      { resend_seq: 0, status: 'needs_owner', ambiguous: 1 },
      { resend_seq: 1, status: 'needs_owner', ambiguous: 0 },
    ]);
    const again = await (await owner(`/requests/${requestId}/resend`)).text();
    expect(again).toContain('The customer may receive two copies.');
    // Authorization still binds to the latest job: the first confirmation's token is refused.
    expect((await owner(`/requests/${requestId}/resend`, { method: 'POST', body: new URLSearchParams(first).toString() })).status).toBe(403);
    expect((await owner(`/requests/${requestId}/resend`, { method: 'POST', body: new URLSearchParams(formOf(again)).toString() })).status).toBe(303);
  });

  it('owner status: one consistent statement per state; never "not sent" when an attempt may have reached the provider', async () => {
    const { requestId } = await approvedQuote();
    const page = async () => (await (await owner(`/requests/${requestId}`)).text()).replace(/&#39;/g, "'");
    expect(await page()).toContain('No email has been sent yet: the quotation email is waiting in the queue.');
    const now = Date.now();
    mock.script.push('accept', 'rate_limited');
    await run(now);
    expect(await page()).toContain('Not sent: the email provider has not accepted the quotation email.');
    mock.script.push('accept_then_timeout');
    await run(now + HOUR);
    const unknown = await page();
    expect(unknown).toContain('Unknown whether the customer received the quotation email');
    expect(unknown).not.toContain('No email has been sent');
    expect(unknown).not.toContain('Not sent:');
    await run(now + 2 * HOUR);
    const accepted = await page();
    expect(accepted).toContain('That does not confirm that it reached the customer’s inbox.');
    expect(accepted).not.toMatch(/No email has been sent|Not sent:|delivered/i);
  });

  it('attempt history: every attempt is recorded, crashed ones included, with codes and times only; deleted with its job', async () => {
    await storeRequest();
    const now = Date.now();
    mock.script.push('accept_slow');
    const crashed = run(now);
    await vi.waitFor(() => expect(job('1').status).toBe('sending'));
    await run(now + sendPolicy.leaseMs + 1); // recovers; the provider still holds the key open
    mock.release();
    await crashed;
    await run(now + sendPolicy.leaseMs + 1 + retryDelay(2));
    const rows = db.raw.prepare('SELECT * FROM email_attempts ORDER BY attempt').all() as Record<string, unknown>[];
    // Attempt 1 crashed after its intent and never reported back: called is unknown (not recorded), outcome E_LEASE_EXPIRED.
    expect(rows.map((row) => [row.attempt, row.send_intent_at !== null, row.provider_called_at !== null, row.outcome])).toEqual([
      [1, true, false, 'E_LEASE_EXPIRED'],
      [2, true, true, 'E_IDEMPOTENCY_IN_PROGRESS'],
      [3, true, true, 'OK_ACCEPTED'],
    ]);
    expect(Object.keys(rows[0]!).sort()).toEqual(['attempt', 'finished_at', 'id', 'job_id', 'outcome', 'provider_called_at', 'send_intent_at', 'started_at']);
    const text = JSON.stringify(rows);
    for (const value of [TEST_OWNER, ...Object.values(customer), 'New quotation request', env.QUOTE_LINK_KEY_V1!]) expect(text).not.toContain(value);
    db.raw.prepare('DELETE FROM email_jobs').run();
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM email_attempts').get()).toEqual({ n: 0 });
  });

  it('customer-route readiness: by default quotation emails stay queued, even with full mail credentials', async () => {
    await approvedQuote();
    expect(await runScheduled(env, () => mock.transport, Date.now())).not.toBeNull(); // default: committed constant (off)
    expect(job("kind = 'quotation'")).toMatchObject({ status: 'queued', attempts: 0, first_attempt_at: null });
    expect(job("kind = 'owner_notification'")).toMatchObject({ status: 'provider_accepted' });
    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM email_attempts a JOIN email_jobs j ON j.id = a.job_id WHERE j.kind = 'quotation'").get()).toEqual({ n: 0 });
    // The deployable entry, fully configured for Resend (fetch stubbed): still no quotation request.
    const requests: string[] = [];
    const outbound = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      requests.push(String(init?.body));
      return Response.json({ id: 'x' });
    });
    try {
      await ownerWorker.scheduled({}, { ...env, EMAIL_MODE: 'resend', RESEND_API_KEY: 're_test_not_a_real_key' });
    } finally {
      outbound.mockRestore();
    }
    expect(requests).toEqual([]);
    expect(job("kind = 'quotation'")).toMatchObject({ status: 'queued', attempts: 0 });
  });
});
