// Manual email release mode (docs/PROPOSAL_QUOTATION_WORKFLOW.md §18, "Manual email release mode"):
// BuildTrack sends no email; the owner prepares the customer invitation on the owner page and sends
// it from their own email account. SIMULATED D1 (node:sqlite), real owner, public and customer code.

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { handleOwner, validOwnerOrigin, type OwnerEnv } from '../worker/owner/handler.ts';
import { runScheduled } from '../worker/owner/scheduled.ts';
import { handleIntake, type IntakeEnv } from '../worker/public/intake.ts';
import { handleQuote } from '../worker/public/quote.ts';
import { buildInvitation, mailtoHref, manualEmailMode } from '../src/lib/quotation/invitation.ts';
import { setLogSink } from '../src/lib/quotation/log.ts';
import { sha256Hex } from '../src/lib/quotation/owner-form.ts';
import { createTestAccess, TEST_AUD, TEST_OWNER, TEST_TEAM, type TestAccess } from './support/access-jwt.ts';
import { createMockProvider } from './support/mock-email.ts';
import { createTestDatabase, type TestDatabase } from './support/sqlite-d1.ts';

const OWNER_ORIGIN = 'https://buildtrack-owner.example.test';
const PUBLIC_ORIGIN = 'https://buildtrack.example.test';
const randomKey = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));

let access: TestAccess;
beforeAll(async () => {
  access = await createTestAccess();
});
const keys = async (kid: string) => (kid === access.kid ? access.publicJwk : null);

let db: TestDatabase;
let env: OwnerEnv & IntakeEnv & { INTAKE_HMAC_KEY: string; INTAKE_HMAC_KEY_VERSION: string; SENDING_ENABLED?: string; MAIL_FROM?: string };
let logLines: string[];
beforeEach(() => {
  db = createTestDatabase();
  // The release configuration: EMAIL_MODE "manual", no mail-provider settings at all.
  env = {
    DB: db,
    WORKFLOW_ENABLED: 'on',
    EMAIL_MODE: 'manual',
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
  };
  logLines = [];
  setLogSink((line) => logLines.push(line));
});

let ip = 0;
async function intake(name = 'Maria Santos', email = 'maria.santos@example.test', native = false) {
  const fields = {
    service: '', plan: 'professional', name, email, organization: 'Example Builders', phone: '', organization_type: 'contractors',
    project_need: 'Tracking cement across two sites', message: '', privacy_ack: 'yes',
  };
  return handleIntake(
    new Request(`${PUBLIC_ORIGIN}/api/quotation-requests`, {
      method: 'POST',
      body: native ? new URLSearchParams(fields).toString() : JSON.stringify({ ...fields, submission_id: crypto.randomUUID() }),
      headers: { 'Content-Type': native ? 'application/x-www-form-urlencoded' : 'application/json', Origin: PUBLIC_ORIGIN, 'CF-Connecting-IP': `198.51.100.${++ip % 250}` },
    }),
    env,
  );
}
async function storeRequest(name?: string, email?: string): Promise<string> {
  const { reference } = (await (await intake(name, email)).json()) as { reference: string };
  return (db.raw.prepare('SELECT id FROM quote_requests WHERE ref = ?').get(reference) as { id: string }).id;
}
async function owner(path: string, body?: Record<string, string>, headers: Record<string, string> = {}, ownerEnv: OwnerEnv = env) {
  return handleOwner(
    new Request(`${OWNER_ORIGIN}${path}`, {
      method: body ? 'POST' : 'GET',
      body: body ? new URLSearchParams(body).toString() : undefined,
      headers: { 'Cf-Access-Jwt-Assertion': await access.sign(), ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded', Origin: OWNER_ORIGIN } : {}), ...headers },
    }),
    ownerEnv,
    keys,
  );
}
const formOf = (html: string) => ({ form_token: /name="form_token" value="([^"]+)"/.exec(html)?.[1] ?? '', version: /name="version" value="(\d+)"/.exec(html)?.[1] ?? '' });
const decode = (html: string) => html.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
/** The prepared invitation as the owner page shows it (decoded from the HTML). */
async function prepared(requestId: string) {
  const html = await (await owner(`/requests/${requestId}`)).text();
  const field = (id: string) => {
    const m = new RegExp(`id="${id}"[^>]*value="([^"]*)"`).exec(html) ?? new RegExp(`<textarea id="${id}"[^>]*>([\\s\\S]*?)</textarea>`).exec(html);
    return m ? decode(m[1]!) : null;
  };
  const mailto = /<a class="button-link" href="([^"]+)">Prepare email<\/a>/.exec(html)?.[1];
  return { html, to: field('invitation-to'), subject: field('invitation-subject'), text: field('invitation-text'), link: field('invitation-link'), mailto: mailto ? decode(mailto) : null };
}
async function approve(requestId: string) {
  const detail = formOf(await (await owner(`/requests/${requestId}`)).text());
  expect((await owner(`/requests/${requestId}/draft`, { ...detail, scope: 'Starter setup for two sites & training (#1): 100% on-site?', amount: '7,990', validity_days: '14' })).status).toBe(303);
  const confirmPage = await (await owner(`/requests/${requestId}/confirm`)).text();
  const fields = formOf(confirmPage);
  expect((await owner(`/requests/${requestId}/approve`, fields)).status).toBe(303);
  return { confirmPage, fields, quoteId: (db.raw.prepare('SELECT id FROM quotes WHERE request_id = ?').get(requestId) as { id: string }).id };
}
const customer = (action: 'view' | 'accept', fields: Record<string, string>) =>
  handleQuote(
    new Request(`${PUBLIC_ORIGIN}/api/quote/${action}`, {
      method: 'POST',
      body: JSON.stringify(fields),
      headers: { 'Content-Type': 'application/json', Origin: PUBLIC_ORIGIN, 'CF-Connecting-IP': '203.0.113.9' },
    }),
    env,
    action,
  );
const tokenOf = (link: string) => link.split('#t=')[1]!;
const count = (sql: string, ...params: (string | number)[]) => (db.raw.prepare(`SELECT COUNT(*) AS n FROM ${sql}`).get(...params) as { n: number }).n;
const quote = (id: string) => db.raw.prepare('SELECT * FROM quotes WHERE id = ?').get(id) as Record<string, any>;
const everything = () =>
  JSON.stringify(['quote_requests', 'quotes', 'quote_links', 'quote_events', 'email_jobs', 'email_attempts', 'simulated_checkouts', 'used_form_tokens'].map((t) => db.raw.prepare(`SELECT * FROM ${t}`).all()));

describe('manual email mode is the release mode', () => {
  it('is selected by anything except "resend", including no setting at all', () => {
    for (const mode of [undefined, '', 'manual', 'off', 'mock']) expect(manualEmailMode({ EMAIL_MODE: mode })).toBe(true);
    expect(manualEmailMode({ EMAIL_MODE: 'resend' })).toBe(false);
  });

  it('intake stores the request and creates no email job; the confirmation explains manual review and no payment', async () => {
    const response = await intake();
    expect(response.status).toBe(201);
    expect(count('quote_requests')).toBe(1);
    expect(count('email_jobs')).toBe(0);
    expect((db.raw.prepare('SELECT notifications FROM intake_daily').get() as { notifications: number }).notifications).toBe(0);
    const page = await (await intake('Native Customer', 'native@example.test', true)).text();
    expect(page).toContain('Your request is stored, and BuildTrack will review it.');
    expect(page).toContain('Invitations are written and sent manually');
    expect(page).toContain('Submitting a request creates no payment, booking or subscription.');
    expect(page).not.toMatch(/\/quote\/|#t=/); // never a customer link on a public page
    expect(count('email_jobs')).toBe(0);
  });

  it('the owner list is the inbox: it says so and promises no notification email', async () => {
    await storeRequest();
    const list = await (await owner('/')).text();
    expect(list).toContain('This page is the request inbox: check it for new requests.');
    expect(list).toContain('BuildTrack sends no notification emails');
  });
});

describe('approval in manual mode', () => {
  it('atomically approves and records the customer link, with no email job and no provider settings', async () => {
    const requestId = await storeRequest();
    const { confirmPage, quoteId } = await approve(requestId);
    expect(confirmPage).toContain('BuildTrack sends no email');
    expect(confirmPage).toContain('>Approve quotation</button>');
    expect(confirmPage).not.toContain('queue');
    expect(quote(quoteId)).toMatchObject({ status: 'approved', link_generation: 1, manual_sent_generation: null });
    expect(count('quote_links WHERE quote_id = ? AND link_generation = 1', quoteId)).toBe(1);
    expect(count('email_jobs')).toBe(0);
    expect(count("quote_events WHERE event = 'approved'")).toBe(1);
  });

  it('a repeated approval (second click, replayed token, concurrent pages) changes nothing', async () => {
    const requestId = await storeRequest();
    const detail = formOf(await (await owner(`/requests/${requestId}`)).text());
    await owner(`/requests/${requestId}/draft`, { ...detail, scope: 'Starter setup for two sites, with training.', amount: '7,990', validity_days: '14' });
    const pages = await Promise.all([1, 2].map(async () => formOf(await (await owner(`/requests/${requestId}/confirm`)).text())));
    const statuses = await Promise.all(pages.map((fields) => owner(`/requests/${requestId}/approve`, fields).then((r) => r.status)));
    expect(statuses.sort()).toEqual([303, 409]);
    expect((await owner(`/requests/${requestId}/approve`, pages[0]!)).status).not.toBe(303);
    expect([count('quote_links'), count('email_jobs'), count("quote_events WHERE event = 'approved'")]).toEqual([1, 0, 1]);
  });
});

describe('the prepared invitation', () => {
  it('rebuilds the exact approved link (hash-verified) only in the authenticated, no-store owner page', async () => {
    const requestId = await storeRequest();
    const { quoteId } = await approve(requestId);
    const response = await owner(`/requests/${requestId}`);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-security-policy')).toContain("script-src 'self'");
    const inv = await prepared(requestId);
    expect(inv.link).toMatch(new RegExp(`^${PUBLIC_ORIGIN}/quote/#t=v1\\.[A-Za-z0-9_-]{43}$`));
    expect(await sha256Hex(tokenOf(inv.link!))).toBe(quote(quoteId).token_hash);
    // The link works for the customer.
    expect((await customer('view', { token: tokenOf(inv.link!) })).status).toBe(200);
    // It appears nowhere in the database or the logs.
    expect(everything()).not.toContain(tokenOf(inv.link!));
    expect(logLines.join('\n')).not.toContain(tokenOf(inv.link!));
    // Without the owner's Access token: nothing (404), and no link.
    const anonymous = await handleOwner(new Request(`${OWNER_ORIGIN}/requests/${requestId}`), env, keys);
    expect(anonymous.status).toBe(404);
    expect(await anonymous.text()).not.toContain('#t=');
  });

  it('subject, text and link are complete; the mailto is correctly encoded (CRLF, no "+"), with an academic disclaimer', async () => {
    const requestId = await storeRequest('María O’Brien-Santos', 'maria+quotes@example.test');
    await approve(requestId);
    const inv = await prepared(requestId);
    expect(inv.to).toBe('maria+quotes@example.test');
    expect(inv.subject).toMatch(/^Your BuildTrack quotation BT-Q-\d{4}-\d{4}$/);
    for (const part of ['Hello María O’Brien-Santos,', 'Starter setup for two sites & training (#1): 100% on-site?', 'Amount: ₱7,990.00 (PHP)', inv.link!, 'BuildTrack is an academic project. No payment is due']) {
      expect(inv.text).toContain(part);
    }
    const url = new URL(inv.mailto!);
    expect(url.protocol).toBe('mailto:');
    expect(decodeURIComponent(url.pathname)).toBe('maria+quotes@example.test');
    expect(url.pathname).toBe('maria%2Bquotes@example.test'); // "+" in the address is encoded, "@" kept
    const raw = inv.mailto!.split('?')[1]!;
    expect(raw).not.toMatch(/\+/); // spaces are %20, never "+"
    const params = Object.fromEntries(raw.split('&').map((pair) => pair.split('=').map(decodeURIComponent) as [string, string]));
    expect(Object.keys(params)).toEqual(['subject', 'body']);
    expect(params.subject).toBe(inv.subject);
    expect(params.body).toBe(inv.text!.replace(/\n/g, '\r\n'));
    // The wording never claims that anything was sent or delivered by opening or copying.
    expect(inv.html).toContain('BuildTrack does not send this email.');
    expect(inv.html).toContain('Opening or copying it does not send or deliver anything.');
    expect(inv.html).toContain('>Copy email text</button>');
    expect(inv.html).toContain('>Copy quotation link</button>');
    expect(inv.html).toContain('Nothing has been sent.');
    expect(inv.html).not.toMatch(/waiting in the queue|queued|Send the quotation email again/);
  });

  it('mailtoHref and buildInvitation encode reserved characters, line breaks and non-ASCII exactly', () => {
    const href = mailtoHref('a&b?c#d%e@example.test', 'Quote #1 & more?', 'Line 1\nLine 2 ₱ 100%');
    expect(href).toBe('mailto:a%26b%3Fc%23d%25e@example.test?subject=Quote%20%231%20%26%20more%3F&body=Line%201%0D%0ALine%202%20%E2%82%B1%20100%25');
    const inv = buildInvitation(PUBLIC_ORIGIN, { quoteRef: 'BT-Q-2026-0001', requestRef: 'BT-R-2026-0001', name: 'A', email: 'a@example.test', scope: 'S', amountCentavos: 100, expiresAt: 0 }, 'v1.x');
    expect(inv.link).toBe(`${PUBLIC_ORIGIN}/quote/#t=v1.x`);
    expect(inv.text).toContain(inv.link);
  });

  it('serves the copy script only behind Access, and the page works without it (plain fields)', async () => {
    const script = await owner('/owner.js');
    expect([script.status, script.headers.get('content-type'), script.headers.get('cache-control')]).toEqual([200, 'text/javascript; charset=utf-8', 'no-store']);
    expect(await script.text()).toContain('navigator.clipboard.writeText');
    expect((await handleOwner(new Request(`${OWNER_ORIGIN}/owner.js`), env, keys)).status).toBe(404);
    const requestId = await storeRequest();
    await approve(requestId);
    const html = (await prepared(requestId)).html;
    expect(html).toMatch(/<button type="button" data-copy="invitation-text"[^>]* hidden>/); // shown only by the script
    expect(html).toContain('<textarea id="invitation-text" readonly');
  });

  it('cannot be prepared without PUBLIC_ORIGIN, or with a changed link key: it says why and shows no link', async () => {
    const requestId = await storeRequest();
    await approve(requestId);
    const noOrigin = await (await owner(`/requests/${requestId}`, undefined, {}, { ...env, PUBLIC_ORIGIN: undefined })).text();
    expect(noOrigin).toContain('PUBLIC_ORIGIN) is not configured');
    expect(noOrigin).not.toContain('#t=');
    const changedKey = await (await owner(`/requests/${requestId}`, undefined, {}, { ...env, QUOTE_LINK_KEY_V1: randomKey() })).text();
    expect(changedKey).toContain('does not match the approved link');
    expect(changedKey).not.toContain('#t=');
  });
});

describe('Mark as manually sent', () => {
  it('is the owner’s confirmed, single-use record; it never changes customer access or the quotation version', async () => {
    const requestId = await storeRequest();
    const { quoteId } = await approve(requestId);
    const before = quote(quoteId);
    const token = tokenOf((await prepared(requestId)).link!);
    const confirmPage = await (await owner(`/requests/${requestId}/mark-sent`)).text();
    expect(confirmPage).toContain('It does not confirm that the email was delivered or read');
    const fields = formOf(confirmPage);
    // Cross-site, forged or unauthenticated attempts change nothing.
    const snapshot = everything();
    expect((await owner(`/requests/${requestId}/mark-sent`, fields, { Origin: 'https://attacker.example.test' })).status).toBe(403);
    expect((await owner(`/requests/${requestId}/mark-sent`, { ...fields, form_token: 'forged' })).status).toBe(403);
    expect((await owner(`/requests/${requestId}/mark-sent`, fields, { 'Cf-Access-Jwt-Assertion': 'x.y.z' })).status).toBe(404);
    expect(everything()).toBe(snapshot);
    // The owner marks it.
    expect((await owner(`/requests/${requestId}/mark-sent`, fields)).status).toBe(303);
    const after = quote(quoteId);
    expect([after.manual_sent_generation, after.version, after.status]).toEqual([1, before.version, 'approved']);
    expect((await prepared(requestId)).html).toContain('Marked sent by owner on');
    expect((await prepared(requestId)).html).not.toContain('/mark-sent');
    // Repeating the same form changes nothing; the customer link is unaffected throughout.
    expect((await owner(`/requests/${requestId}/mark-sent`, fields)).status).not.toBe(303);
    expect((await customer('view', { token })).status).toBe(200);
  });

  it('two confirmation pages for the same link: the first marks it, the second changes nothing (409)', async () => {
    const requestId = await storeRequest();
    const { quoteId } = await approve(requestId);
    const pages = await Promise.all([1, 2].map(async () => formOf(await (await owner(`/requests/${requestId}/mark-sent`)).text())));
    expect((await owner(`/requests/${requestId}/mark-sent`, pages[0]!)).status).toBe(303);
    const marked = quote(quoteId).manual_sent_at;
    expect((await owner(`/requests/${requestId}/mark-sent`, pages[1]!, {}, env)).status).toBe(409);
    expect(quote(quoteId).manual_sent_at).toBe(marked);
  });

  it('customer access never depends on it: an unmarked invitation link can be accepted', async () => {
    const requestId = await storeRequest();
    await approve(requestId);
    const token = tokenOf((await prepared(requestId)).link!);
    const { version } = ((await (await customer('view', { token })).json()) as { view: { version: number } }).view;
    expect((await customer('accept', { token, version: String(version) })).status).toBe(200);
  });
});

describe('revocation and replacement links in manual mode', () => {
  it('revoke: the link stops working and no invitation is offered; a new link gives a fresh, different invitation; old links stay refused', async () => {
    const requestId = await storeRequest();
    const { quoteId } = await approve(requestId);
    const first = (await prepared(requestId)).link!;
    const markFields = formOf(await (await owner(`/requests/${requestId}/mark-sent`)).text());
    await owner(`/requests/${requestId}/mark-sent`, markFields);
    const revokePage = await (await owner(`/requests/${requestId}/revoke`)).text();
    expect(revokePage).toContain('BuildTrack cannot recall an invitation you already sent');
    expect((await owner(`/requests/${requestId}/revoke`, formOf(revokePage))).status).toBe(303);
    expect(((await (await customer('view', { token: tokenOf(first) })).json()) as { error: string }).error).toBe('revoked');
    const revoked = await prepared(requestId);
    expect(revoked.html).toContain('The customer’s link was revoked.');
    expect(revoked.link).toBeNull();
    const newLinkPage = await (await owner(`/requests/${requestId}/new-link`)).text();
    expect(newLinkPage).toContain('BuildTrack sends nothing');
    expect(newLinkPage).toContain('>Create new link</button>');
    expect((await owner(`/requests/${requestId}/new-link`, formOf(newLinkPage))).status).toBe(303);
    const second = await prepared(requestId);
    expect(second.link).not.toBe(first);
    expect(await sha256Hex(tokenOf(second.link!))).toBe(quote(quoteId).token_hash);
    expect((await customer('view', { token: tokenOf(second.link!) })).status).toBe(200);
    expect((await customer('view', { token: tokenOf(first) })).status).toBe(410);
    // The new generation is unmarked: the earlier "sent" record does not carry over to it.
    expect(second.html).toContain('Not marked as sent.');
    expect(second.html).toContain('/mark-sent');
    expect(count('email_jobs')).toBe(0);
  });

  it('replacing an unrevoked link: the earlier invitation’s link says superseded', async () => {
    const requestId = await storeRequest();
    await approve(requestId);
    const first = (await prepared(requestId)).link!;
    await owner(`/requests/${requestId}/new-link`, formOf(await (await owner(`/requests/${requestId}/new-link`)).text()));
    const second = (await prepared(requestId)).link!;
    expect(((await (await customer('view', { token: tokenOf(first) })).json()) as { error: string }).error).toBe('superseded');
    expect((await customer('view', { token: tokenOf(second) })).status).toBe(200);
  });

  it('dismiss and delete still work; deleting makes the prepared link invalid', async () => {
    const plain = await storeRequest('Plain Request', 'plain@example.test');
    expect((await owner(`/requests/${plain}/dismiss`, formOf(await (await owner(`/requests/${plain}/dismiss`)).text()))).status).toBe(303);
    const requestId = await storeRequest();
    await approve(requestId);
    const link = (await prepared(requestId)).link!;
    const deletePage = await (await owner(`/requests/${requestId}/delete`)).text();
    expect(deletePage).toContain('invitations you sent from your own email account');
    expect((await owner(`/requests/${requestId}/delete`, formOf(deletePage))).status).toBe(303);
    expect(((await (await customer('view', { token: tokenOf(link) })).json()) as { error: string }).error).toBe('invalid');
  });
});

describe('Codex findings on the manual release (2026-10-17)', () => {
  /** A legacy automatic-mode quotation job for an approved quotation, inserted directly. */
  function legacyJob(requestId: string, quoteId: string, id: string, fields: { status: string; ambiguous?: number; leaseUntil?: number | null; intent?: boolean }) {
    const now = Date.now();
    const lease = fields.leaseUntil === undefined || fields.leaseUntil === null ? null : `lease-${id}`;
    db.raw
      .prepare(
        `INSERT INTO email_jobs (id, kind, request_id, quote_id, link_generation, resend_seq, idempotency_key, status, attempts, ambiguous, first_attempt_at,
           next_attempt_at, lease_id, lease_until, created_at, updated_at)
         VALUES (?, 'quotation', ?, ?, 1, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, requestId, quoteId, Number(db.raw.prepare('SELECT COUNT(*) AS n FROM email_jobs').get()!.n), `bt-q-${id}`, fields.status, fields.ambiguous ?? 0, now, now, lease, fields.leaseUntil ?? null, now, now);
    if (lease) db.raw.prepare('INSERT INTO email_attempts (id, job_id, attempt, started_at, send_intent_at) VALUES (?, ?, 1, ?, ?)').run(lease, id, now, fields.intent ? now : null);
  }
  const jobRow = (id: string) => db.raw.prepare('SELECT status, ambiguous, last_result, lease_id, lease_until FROM email_jobs WHERE id = ?').get(id) as Record<string, unknown>;
  const attemptOf = (id: string) => db.raw.prepare('SELECT finished_at IS NOT NULL AS finished, outcome FROM email_attempts WHERE job_id = ?').get(id) as Record<string, unknown>;

  it('A: a cancelled job with an earlier ambiguous attempt is not described as "not sent"', async () => {
    const requestId = await storeRequest();
    const { quoteId } = await approve(requestId);
    legacyJob(requestId, quoteId, 'ambiguous-cancelled', { status: 'cancelled', ambiguous: 1 });
    legacyJob(requestId, quoteId, 'plain-cancelled', { status: 'cancelled' });
    const history = (await prepared(requestId)).html.split('<h3>Automatic email records (history)</h3>')[1]!;
    expect(history).toContain('Further attempts cancelled (1 attempt). An earlier attempt may already have reached the email provider; whether it was sent is unknown.');
    expect(history.match(/Cancelled; not sent\./g)).toHaveLength(1); // only the job with no ambiguity
  });

  it('B: expired sending leases are retired without sending (send-intent rules kept); a live lease is untouched; nothing says "Being sent now"', async () => {
    const requestId = await storeRequest();
    const { quoteId } = await approve(requestId);
    const now = Date.now();
    legacyJob(requestId, quoteId, 'expired-intent', { status: 'sending', leaseUntil: now - 60_000, intent: true });
    legacyJob(requestId, quoteId, 'expired-no-intent', { status: 'sending', leaseUntil: now - 60_000 });
    legacyJob(requestId, quoteId, 'live', { status: 'sending', leaseUntil: now + 60_000, intent: true });
    // Before the scheduled run: the expired ones are not "being sent".
    const before = (await prepared(requestId)).html;
    expect(before.match(/Being sent now/g)).toHaveLength(1); // the live lease only
    expect(before.match(/Stopped \(1 attempt\): the last attempt did not finish and may or may not have reached the email provider\./g)).toHaveLength(2);
    const mock = createMockProvider();
    expect(await runScheduled({ ...env, SENDING_ENABLED: 'on', MAIL_FROM: 'BuildTrack <quotes@mail.example.test>' }, () => mock.transport, now, validOwnerOrigin, { quotationEmailsReady: true })).toBeNull();
    expect(mock.calls).toHaveLength(0);
    expect(jobRow('expired-intent')).toEqual({ status: 'cancelled', ambiguous: 1, last_result: 'E_MANUAL_MODE', lease_id: null, lease_until: null });
    expect(attemptOf('expired-intent')).toEqual({ finished: 1, outcome: 'E_LEASE_EXPIRED' });
    expect(jobRow('expired-no-intent')).toEqual({ status: 'cancelled', ambiguous: 0, last_result: 'E_MANUAL_MODE', lease_id: null, lease_until: null });
    expect(attemptOf('expired-no-intent')).toEqual({ finished: 1, outcome: 'E_LEASE_EXPIRED_BEFORE_SEND' });
    expect(jobRow('live')).toMatchObject({ status: 'sending', lease_id: 'lease-live' });
    expect(attemptOf('live')).toEqual({ finished: 0, outcome: null });
    const after = (await prepared(requestId)).html;
    expect(after).toContain('Further attempts cancelled (1 attempt). An earlier attempt may already have reached the email provider');
    // Once the live lease expires too, the next run retires it the same way.
    await runScheduled(env, () => mock.transport, now + 120_000, validOwnerOrigin);
    expect(jobRow('live')).toMatchObject({ status: 'cancelled', ambiguous: 1 });
    expect(mock.calls).toHaveLength(0);
  });

  it('C: a manual request never inherits the notification-cap flag from automatic-mode counters', async () => {
    const day = new Date().toISOString().slice(0, 10);
    db.raw.prepare('INSERT INTO intake_daily (day, requests, notifications, created_at) VALUES (?, 0, 30, ?)').run(day, Date.now());
    const requestId = await storeRequest();
    expect((db.raw.prepare('SELECT flagged FROM quote_requests WHERE id = ?').get(requestId) as { flagged: number }).flagged).toBe(0);
    expect(await (await owner('/')).text()).not.toContain('owner notification skipped');
  });
});

describe('truthful email status and no accidental provider sending', () => {
  it('the scheduled run sends nothing in manual mode, even with a transport and mail settings, and cancels legacy waiting jobs as history', async () => {
    const requestId = await storeRequest();
    const { quoteId } = await approve(requestId);
    // A legacy job from automatic mode (e.g. before the switch), still waiting.
    const now = Date.now();
    db.raw
      .prepare(
        `INSERT INTO email_jobs (id, kind, request_id, quote_id, link_generation, resend_seq, idempotency_key, status, next_attempt_at, created_at, updated_at)
         VALUES ('legacy', 'quotation', ?, ?, 1, 0, 'bt-q-legacy', 'queued', ?, ?, ?)`,
      )
      .run(requestId, quoteId, now, now, now);
    const mock = createMockProvider();
    const summary = await runScheduled({ ...env, SENDING_ENABLED: 'on', MAIL_FROM: 'BuildTrack <quotes@mail.example.test>' }, () => mock.transport, now, validOwnerOrigin, {
      quotationEmailsReady: true,
    });
    expect(summary).toBeNull();
    expect(mock.calls).toHaveLength(0);
    expect(db.raw.prepare("SELECT status, last_result FROM email_jobs WHERE id = 'legacy'").get()).toEqual({ status: 'cancelled', last_result: 'E_MANUAL_MODE' });
    const page = (await prepared(requestId)).html;
    expect(page).toContain('Automatic email records (history)');
    expect(page).toContain('None of these will be sent.');
    expect(page).not.toContain('/resend');
    // A resend cannot be started in manual mode.
    expect((await owner(`/requests/${requestId}/resend`)).status).toBe(303);
  });
});
