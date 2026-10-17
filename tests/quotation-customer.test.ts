// Customer quotation API (worker/public/quote.ts) and /quote/ shell headers (worker/public/index.ts)
// on SIMULATED D1 (node:sqlite). Quotations are approved through the real owner handler; links
// are rebuilt with the test run's link key. No network, no email.

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import publicWorker from '../worker/public/index.ts';
import { handleQuote, quoteLimits, type QuoteHooks } from '../worker/public/quote.ts';
import { handleIntake } from '../worker/public/intake.ts';
import { handleOwner, type OwnerEnv } from '../worker/owner/handler.ts';
import { runScheduled, type SenderEnv } from '../worker/owner/scheduled.ts';
import { validOwnerOrigin } from '../worker/owner/handler.ts';
import { DEMO_CODE, demoCodeLabel, isDemoCode, linkMessages, type QuoteView } from '../src/lib/quotation/customer.ts';
import { setLogSink } from '../src/lib/quotation/log.ts';
import { sha256Hex } from '../src/lib/quotation/owner-form.ts';
import { classifyResponse, confirmText, linkUncertainText, parsePending, serializePending, settles, stillUnknownText, tokenFromFragment } from '../src/lib/quotation/quote-page.ts';
import { currentLinkKey, quoteLinkToken } from '../src/lib/quotation/quote-link.ts';
import { createTestAccess, TEST_AUD, TEST_OWNER, TEST_TEAM, type TestAccess } from './support/access-jwt.ts';
import { createMockProvider } from './support/mock-email.ts';
import { createTestDatabase, type TestDatabase } from './support/sqlite-d1.ts';

const PUBLIC_ORIGIN = 'https://buildtrack.example.test';
const OWNER_ORIGIN = 'https://buildtrack-owner.example.test';
const DAY = 24 * 60 * 60 * 1000;
const randomKey = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));

let access: TestAccess;
beforeAll(async () => {
  access = await createTestAccess();
});
let db: TestDatabase;
let env: SenderEnv & { INTAKE_HMAC_KEY: string; INTAKE_HMAC_KEY_VERSION: string };
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
  logLines = [];
  identities.clear();
  setLogSink((line) => logLines.push(line));
});
afterEach(() => setLogSink(() => {}));

const customer = { name: 'Maria Test Customer', email: 'maria.customer@example.test' };
let ip = 0;
async function approvedQuote(): Promise<{ requestId: string; quoteId: string; token: string }> {
  const intake = await handleIntake(
    new Request(`${PUBLIC_ORIGIN}/api/quotation-requests`, {
      method: 'POST',
      body: JSON.stringify({
        service: '', plan: 'professional', ...customer, organization: 'Example Builders', phone: '', organization_type: 'contractors',
        project_need: 'Tracking cement across two sites', message: '', privacy_ack: 'yes', submission_id: crypto.randomUUID(),
      }),
      headers: { 'Content-Type': 'application/json', Origin: PUBLIC_ORIGIN, 'CF-Connecting-IP': `198.51.100.${++ip}` },
    }),
    env,
  );
  const { reference } = (await intake.json()) as { reference: string };
  const requestId = (db.raw.prepare('SELECT id FROM quote_requests WHERE ref = ?').get(reference) as { id: string }).id;
  const owner = async (path: string, body?: Record<string, string>) =>
    handleOwner(
      new Request(`${OWNER_ORIGIN}${path}`, {
        method: body ? 'POST' : 'GET',
        body: body ? new URLSearchParams(body).toString() : undefined,
        headers: { 'Cf-Access-Jwt-Assertion': await access.sign(), ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded', Origin: OWNER_ORIGIN } : {}) },
      }),
      env as OwnerEnv,
      async (kid) => (kid === access.kid ? access.publicJwk : null),
    );
  const form = (html: string) => ({ form_token: /name="form_token" value="([^"]+)"/.exec(html)![1]!, version: /name="version" value="(\d+)"/.exec(html)![1]! });
  const detail = form(await (await owner(`/requests/${requestId}`)).text());
  await owner(`/requests/${requestId}/draft`, { ...detail, scope: 'Starter setup for two sites, with training.', amount: '7,990.50', validity_days: '14' });
  await owner(`/requests/${requestId}/approve`, form(await (await owner(`/requests/${requestId}/confirm`)).text()));
  const quoteId = (db.raw.prepare("SELECT id FROM quotes WHERE request_id = ? AND status = 'approved'").get(requestId) as { id: string }).id;
  const token = await quoteLinkToken((await currentLinkKey(env as unknown as Record<string, unknown>))!, quoteId, 1);
  return { requestId, quoteId, token };
}

/**
 * One stable client identity per customer journey (here: per link), never rotated per request,
 * so the per-client hourly limit applies to tests exactly as it would to a customer.
 */
const identities = new Map<string, string>();
const identityFor = (token: string | undefined) => {
  const key = token ?? '';
  if (!identities.has(key)) identities.set(key, `203.0.113.${identities.size + 1}`);
  return identities.get(key)!;
};
/** The quotation's current version, read directly (checkout requests carry the version shown). */
async function currentVersion(token: string): Promise<string> {
  const row = db.raw.prepare('SELECT version FROM quotes WHERE token_hash = ?').get(await sha256Hex(token)) as { version: number } | undefined;
  return String(row?.version ?? 1);
}

async function call(
  action: 'view' | 'accept' | 'decline' | 'simulate',
  fields: Record<string, string>,
  headers: Record<string, string | null> = {},
  now: number | (() => number) = Date.now(),
  hooks: QuoteHooks = {},
) {
  // Checkout requests carry the displayed version; tests not about versions use the current one.
  if (action === 'simulate' && !('version' in fields) && fields.token) fields = { token: fields.token, version: await currentVersion(fields.token), ...fields };
  const merged: Record<string, string | null> = { 'Content-Type': 'application/json', Origin: PUBLIC_ORIGIN, 'Sec-Fetch-Site': 'same-origin', 'CF-Connecting-IP': identityFor(fields.token), ...headers };
  return handleQuote(
    new Request(`${PUBLIC_ORIGIN}/api/quote/${action}`, {
      method: 'POST',
      body: JSON.stringify(fields),
      headers: Object.fromEntries(Object.entries(merged).filter((e): e is [string, string] => e[1] !== null)),
    }),
    env,
    action,
    now,
    hooks,
  );
}
const body = async (response: Response) => (await response.json()) as any;
const quote = (id: string) => db.raw.prepare('SELECT * FROM quotes WHERE id = ?').get(id) as Record<string, any>;
const count = (sql: string) => (db.raw.prepare(`SELECT COUNT(*) AS n FROM ${sql}`).get() as { n: number }).n;
const state = () => JSON.stringify(['quotes', 'quote_events', 'simulated_checkouts', 'quote_links', 'email_jobs'].map((t) => db.raw.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()));

describe('viewing: the approved snapshot, consistent with the email; never a change', () => {
  it('shows exactly the approved scope, amount, validity, references and version, and the email carries the same', async () => {
    const { quoteId, token } = await approvedQuote();
    const before = state();
    const response = await call('view', { token });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    const { view } = await body(response);
    const q = quote(quoteId);
    expect(view).toEqual({
      status: 'open',
      reference: q.ref,
      requestReference: expect.stringMatching(/^BT-R-/),
      firstName: 'Maria',
      scope: q.snap_scope,
      amountCentavos: q.snap_amount_centavos,
      version: q.version,
      expiresAt: q.expires_at,
      simulations: [],
    });
    expect(JSON.stringify(view)).not.toContain(customer.email);
    for (let i = 0; i < 5; i++) await call('view', { token });
    expect(state()).toBe(before); // viewing never accepts or records anything
    // The email the customer received shows the same approved values and links to this token.
    const mock = createMockProvider();
    await runScheduled(env, () => mock.transport, Date.now(), validOwnerOrigin, { quotationEmailsReady: true });
    const email = mock.inbox.find((m) => m.key.startsWith('bt-q-'))!.message.text;
    expect(email).toContain(view.scope);
    expect(email).toContain('₱7,990.50');
    expect(email).toContain(view.reference);
    expect(email).toContain(`#t=${token}`);
    expect(quote(quoteId).status).toBe('emailed');
    expect((await body(await call('view', { token }))).view).toMatchObject({ status: 'open', version: view.version });
  });

  it('distinguishes invalid, expired, revoked and superseded links without revealing any quotation detail', async () => {
    const { quoteId, token } = await approvedQuote();
    const unknown = `v1.${'A'.repeat(43)}`;
    const problems = async (t: string, now = Date.now()) => {
      const r = await call('view', { token: t }, {}, now);
      return [r.status, (await body(r)).error];
    };
    expect(await problems(unknown)).toEqual([404, 'invalid']);
    expect(await problems(token, quote(quoteId).expires_at)).toEqual([410, 'expired']);
    // A newer link generation (the future "new link & resend" action), simulated directly.
    const link = (await currentLinkKey(env as unknown as Record<string, unknown>))!;
    const newer = await quoteLinkToken(link, quoteId, 2);
    db.raw.prepare('INSERT INTO quote_links (token_hash, quote_id, link_generation, link_key_version, created_at) VALUES (?, ?, 2, 1, ?)').run(await sha256Hex(newer), quoteId, Date.now());
    db.raw.prepare('UPDATE quotes SET link_generation = 2, token_hash = ? WHERE id = ?').run(await sha256Hex(newer), quoteId);
    expect(await problems(token)).toEqual([410, 'superseded']);
    expect((await call('view', { token: newer })).status).toBe(200);
    db.raw.prepare('UPDATE quote_links SET revoked_at = ? WHERE link_generation = 2').run(Date.now());
    expect(await problems(newer)).toEqual([410, 'revoked']);
    for (const kind of ['invalid', 'expired', 'revoked', 'superseded'] as const) {
      expect(linkMessages[kind]).not.toMatch(/BT-|₱|Maria/);
    }
  });

  it('a link keeps working after the current key version changes (verification is by stored hash)', async () => {
    const { token } = await approvedQuote();
    env = { ...env, QUOTE_LINK_KEY_CURRENT: '2', QUOTE_LINK_KEY_V2: randomKey() };
    expect((await call('view', { token })).status).toBe(200);
  });
});

describe('protection: POST JSON from the exact public origin only', () => {
  it.each([
    ['no Origin', { Origin: null }, 403],
    ['another Origin', { Origin: 'https://attacker.example.test' }, 403],
    ['the owner origin', { Origin: OWNER_ORIGIN }, 403],
    ['cross-site metadata', { 'Sec-Fetch-Site': 'cross-site' }, 403],
    ['a simple form post (text/plain)', { 'Content-Type': 'text/plain' }, 415],
    ['a form-encoded post', { 'Content-Type': 'application/x-www-form-urlencoded' }, 415],
  ] as const)('refuses %s and changes nothing', async (_label, headers, status) => {
    const { quoteId, token } = await approvedQuote();
    const view = (await body(await call('view', { token }))).view;
    const before = state();
    expect((await call('accept', { token, version: String(view.version) }, headers)).status).toBe(status);
    expect(state()).toBe(before);
    expect(quote(quoteId).status).toBe('approved');
  });

  it('refuses other methods, malformed bodies, extra fields (including any demo code) and bad tokens', async () => {
    const { token } = await approvedQuote();
    const get = await handleQuote(new Request(`${PUBLIC_ORIGIN}/api/quote/view`), env, 'view');
    expect([get.status, get.headers.get('allow')]).toEqual([405, 'POST']);
    expect((await call('view', { token, extra: 'x' })).status).toBe(400);
    expect((await call('view', { token: 'not-a-token' })).status).toBe(400);
    expect((await call('simulate', { token, method: 'card', outcome: 'success', attempt_id: crypto.randomUUID(), demo_code: DEMO_CODE })).status).toBe(400);
    expect((await call('accept', { token, version: '0' })).status).toBe(400);
  });

  it('limits each client to 30 requests an hour; refusals change nothing', async () => {
    const { token } = await approvedQuote();
    const statuses: number[] = [];
    for (let i = 0; i < quoteLimits.perClientPerHour + 2; i++) statuses.push((await call('view', { token }, { 'CF-Connecting-IP': '198.51.100.200' })).status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(quoteLimits.perClientPerHour);
    expect(statuses.slice(-2)).toEqual([429, 429]);
  });
});

describe('acceptance: explicit, version-checked, atomic and idempotent', () => {
  it('accepts only the version shown; a stale version changes nothing', async () => {
    const { quoteId, token } = await approvedQuote();
    const { version } = (await body(await call('view', { token }))).view;
    const stale = await call('accept', { token, version: String(version - 1) });
    expect([stale.status, (await body(stale)).error]).toEqual([409, 'changed']);
    expect(quote(quoteId).status).toBe('approved');
    const accepted = await call('accept', { token, version: String(version) });
    expect(accepted.status).toBe(200);
    expect((await body(accepted)).view).toMatchObject({ status: 'accepted', version: version + 1 });
    expect(quote(quoteId)).toMatchObject({ status: 'accepted' });
    expect(db.raw.prepare("SELECT actor, event FROM quote_events WHERE event = 'accepted'").all()).toEqual([{ actor: 'customer', event: 'accepted' }]);
  });

  it('concurrent and repeated acceptances: every request succeeds, exactly one acceptance is recorded', async () => {
    const { quoteId, token } = await approvedQuote();
    const { version } = (await body(await call('view', { token }))).view;
    const responses = await Promise.all(Array.from({ length: 6 }, () => call('accept', { token, version: String(version) })));
    expect(responses.map((r) => r.status)).toEqual(Array(6).fill(200));
    const bodies = await Promise.all(responses.map(body));
    expect(bodies.filter((b) => b.repeated === false)).toHaveLength(1);
    expect(count("quote_events WHERE event = 'accepted'")).toBe(1);
    expect(quote(quoteId).accepted_at).toBeTypeOf('number');
    // Declining afterwards is refused; the acceptance stands.
    const decline = await call('decline', { token, version: String(version) });
    expect([decline.status, (await body(decline)).error]).toEqual([409, 'decided']);
    expect(quote(quoteId).status).toBe('accepted');
  });

  it('declining works the same way, and blocks a later acceptance', async () => {
    const { quoteId, token } = await approvedQuote();
    const { version } = (await body(await call('view', { token }))).view;
    expect((await call('decline', { token, version: String(version) })).status).toBe(200);
    expect((await call('decline', { token, version: String(version) })).status).toBe(200); // repeat: same result
    expect((await call('accept', { token, version: String(version) })).status).toBe(409);
    expect(quote(quoteId).status).toBe('declined');
    expect(count("quote_events WHERE event = 'declined'")).toBe(1);
  });

  it('an expired or superseded link cannot accept', async () => {
    const { quoteId, token } = await approvedQuote();
    const { version } = (await body(await call('view', { token }))).view;
    expect((await call('accept', { token, version: String(version) }, {}, quote(quoteId).expires_at + 1)).status).toBe(410);
    expect(quote(quoteId).status).toBe('approved');
  });

  it('an email job still pending when the customer accepts is cancelled, not sent', async () => {
    const { quoteId, token } = await approvedQuote();
    const { version } = (await body(await call('view', { token }))).view;
    await call('accept', { token, version: String(version) });
    const mock = createMockProvider();
    await runScheduled(env, () => mock.transport, Date.now(), validOwnerOrigin, { quotationEmailsReady: true });
    expect(db.raw.prepare("SELECT status, last_result FROM email_jobs WHERE kind = 'quotation' AND quote_id = ?").get(quoteId)).toEqual({ status: 'cancelled', last_result: 'E_QUOTE_NOT_OPEN' });
    expect(mock.calls.filter((c) => c.key.startsWith('bt-q-'))).toHaveLength(0);
  });
});

describe('simulated checkout: accepted quotations only; labelled simulated; never "paid"', () => {
  it('refuses before acceptance; records simulated outcomes after it without changing the quotation', async () => {
    const { quoteId, token } = await approvedQuote();
    const attempt = crypto.randomUUID();
    const early = await call('simulate', { token, method: 'card', outcome: 'success', attempt_id: attempt });
    expect([early.status, (await body(early)).error]).toEqual([409, 'not_accepted']);
    expect(count('simulated_checkouts')).toBe(0);
    const { version } = (await body(await call('view', { token }))).view;
    await call('accept', { token, version: String(version) });
    const before = quote(quoteId);
    const result = await body(await call('simulate', { token, method: 'card', outcome: 'success', attempt_id: attempt }));
    expect(result).toMatchObject({ simulated: true, method: 'card', outcome: 'success' });
    expect(result.view.simulations).toEqual([{ method: 'card', outcome: 'success', at: expect.any(Number) }]);
    expect(quote(quoteId)).toEqual(before); // status stays accepted: there is no "paid"
    expect(db.raw.prepare('SELECT method, outcome, simulated FROM simulated_checkouts').all()).toEqual([{ method: 'card', outcome: 'success', simulated: 1 }]);
    expect(Object.keys(db.raw.prepare('SELECT * FROM simulated_checkouts').get() as object).sort()).toEqual(['attempt_id', 'created_at', 'id', 'method', 'outcome', 'quote_id', 'simulated']);
  });

  it('is idempotent per attempt (repeats and concurrent repeats record one row) and bounded per quotation', async () => {
    const { token } = await approvedQuote();
    const { version } = (await body(await call('view', { token }))).view;
    await call('accept', { token, version: String(version) });
    const attempt = crypto.randomUUID();
    const answers = await Promise.all(Array.from({ length: 5 }, () => call('simulate', { token, method: 'bank', outcome: 'failure', attempt_id: attempt }).then(body)));
    expect(new Set(answers.map((a) => `${a.method}/${a.outcome}`))).toEqual(new Set(['bank/failure']));
    // The same attempt id with a different method or outcome is a conflict: 409, nothing recorded or changed.
    const before = state();
    for (const fields of [{ method: 'card', outcome: 'failure' }, { method: 'bank', outcome: 'success' }]) {
      const conflict = await call('simulate', { token, ...fields, attempt_id: attempt });
      expect([conflict.status, (await body(conflict)).error]).toEqual([409, 'conflict']);
    }
    expect(state()).toBe(before);
    // The same attempt with the same payload returns the original result.
    expect(await body(await call('simulate', { token, method: 'bank', outcome: 'failure', attempt_id: attempt }))).toMatchObject({ simulated: true, method: 'bank', outcome: 'failure' });
    expect(count('simulated_checkouts')).toBe(1);
    for (let i = 1; i < quoteLimits.simulationsPerQuote; i++) await call('simulate', { token, method: 'card', outcome: 'cancelled', attempt_id: crypto.randomUUID() });
    const over = await call('simulate', { token, method: 'card', outcome: 'cancelled', attempt_id: crypto.randomUUID() });
    expect([over.status, (await body(over)).error]).toEqual([409, 'limit']);
    expect(count('simulated_checkouts')).toBe(quoteLimits.simulationsPerQuote);
  });

  it('refuses unknown methods and outcomes', async () => {
    const { token } = await approvedQuote();
    for (const fields of [{ method: 'crypto', outcome: 'success' }, { method: 'card', outcome: 'paid' }]) {
      expect((await call('simulate', { token, ...fields, attempt_id: crypto.randomUUID() })).status).toBe(400);
    }
  });
});

describe('privacy, logging and the /quote/ shell', () => {
  it('logs fixed codes only: no token, name, email or reference', async () => {
    const { quoteId, token } = await approvedQuote();
    const { version } = (await body(await call('view', { token }))).view;
    await call('accept', { token, version: String(version) });
    await call('view', { token: `v1.${'B'.repeat(43)}` });
    const output = logLines.join('\n');
    for (const value of [token, customer.name, customer.email, 'Maria', quote(quoteId).ref, quoteId]) expect(output).not.toContain(value);
  });

  it('serves /quote/ private and uncached, with a same-origin CSP that allows exactly its inline scripts', async () => {
    const script = 'console.log("x")';
    const assets = { fetch: async () => new Response(`<!doctype html><script type="module">${script}</script><script type="module" src="/_astro/a.js"></script>`, { headers: { 'Content-Type': 'text/html; charset=utf-8', ETag: '"x"' } }) };
    const response = await publicWorker.fetch(new Request(`${PUBLIC_ORIGIN}/quote/`), { ...env, ASSETS: assets });
    const hash = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(script)))));
    expect(Object.fromEntries(['cache-control', 'referrer-policy', 'x-robots-tag', 'x-frame-options', 'etag'].map((h) => [h, response.headers.get(h)]))).toEqual({
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      'x-robots-tag': 'noindex',
      'x-frame-options': 'DENY',
      etag: null,
    });
    const csp = response.headers.get('content-security-policy')!;
    expect(csp).toContain(`script-src 'self' 'sha256-${hash}'`);
    for (const part of ["default-src 'self'", "connect-src 'self'", "frame-ancestors 'none'", "form-action 'none'"]) expect(csp).toContain(part);
    expect(csp).not.toMatch(/https?:/);
    expect((await publicWorker.fetch(new Request(`${PUBLIC_ORIGIN}/api/quote/pay`, { method: 'POST' }), { ...env, ASSETS: assets })).status).toBe(404);
  });

  it('page helpers: only an exact #t=<token> fragment is used; the demo code is a local, exact check', () => {
    const token = `v1.${'C'.repeat(43)}`;
    expect(tokenFromFragment(`#t=${token}`)).toBe(token);
    for (const hash of ['', '#', `#t=${token}&x=1`, '#t=v1.short', `#x=${token}`, `#t=${token}#`]) expect(tokenFromFragment(hash), hash).toBeNull();
    expect(demoCodeLabel).toBe('Demo code — enter 12345678');
    expect([isDemoCode('12345678'), isDemoCode(' 12345678'), isDemoCode('1234567'), isDemoCode('')]).toEqual([true, false, false, false]);
    const view: QuoteView = { status: 'open', reference: 'BT-Q-2026-0001', requestReference: 'BT-R-2026-0001', firstName: 'Maria', scope: 's', amountCentavos: 799050, version: 2, expiresAt: Date.now() + DAY, simulations: [] };
    expect(confirmText(view, 'accept').question).toBe('Accept quotation BT-Q-2026-0001 for ₱7,990.50? BuildTrack is an academic project; no payment is due.');
  });
});

describe('authorization is re-checked inside each write (changes between validation and write)', () => {
  type Change = (ids: { quoteId: string; token: string }, clock: { t: number }) => Promise<void> | void;
  const changes: [string, Change, number, string][] = [
    ['the link revoked', ({ quoteId }) => void db.raw.prepare('UPDATE quote_links SET revoked_at = 1 WHERE quote_id = ?').run(quoteId), 410, 'revoked'],
    ['the quotation revoked', ({ quoteId }) => void db.raw.prepare("UPDATE quotes SET revoked_at = 1 WHERE id = ?").run(quoteId), 410, 'revoked'],
    ['the quotation expired', ({ quoteId }, clock) => void (clock.t = quote(quoteId).expires_at), 410, 'expired'],
    [
      'a newer link issued',
      async ({ quoteId }) => {
        const newer = `v1.${'N'.repeat(43)}`;
        db.raw.prepare('INSERT INTO quote_links (token_hash, quote_id, link_generation, link_key_version, created_at) VALUES (?, ?, 2, 1, 0)').run(await sha256Hex(newer), quoteId);
        db.raw.prepare('UPDATE quotes SET link_generation = 2, token_hash = ? WHERE id = ?').run(await sha256Hex(newer), quoteId);
      },
      410,
      'superseded',
    ],
  ];

  it.each(changes)('accept: %s → no acceptance and no event', async (_label, change, status, error) => {
    const ids = await approvedQuote();
    const { version } = (await body(await call('view', { token: ids.token }))).view;
    const clock = { t: Date.now() };
    const response = await call('accept', { token: ids.token, version: String(version) }, {}, () => clock.t, { beforeWrite: async () => change(ids, clock) });
    expect([response.status, (await body(response)).error]).toEqual([status, error]);
    expect(quote(ids.quoteId).status).toBe('approved');
    expect(quote(ids.quoteId).accepted_at).toBeNull();
    expect(count("quote_events WHERE event IN ('accepted', 'declined')")).toBe(0);
  });

  it.each(changes)('decline: %s → no decision and no event', async (_label, change, status) => {
    const ids = await approvedQuote();
    const { version } = (await body(await call('view', { token: ids.token }))).view;
    const clock = { t: Date.now() };
    const response = await call('decline', { token: ids.token, version: String(version) }, {}, () => clock.t, { beforeWrite: async () => change(ids, clock) });
    expect(response.status).toBe(status);
    expect(quote(ids.quoteId).status).toBe('approved');
    expect(count("quote_events WHERE event IN ('accepted', 'declined')")).toBe(0);
  });

  it.each(changes)('simulated checkout: %s → no simulated row', async (_label, change, status, error) => {
    const ids = await approvedQuote();
    const { version } = (await body(await call('view', { token: ids.token }))).view;
    await call('accept', { token: ids.token, version: String(version) });
    const clock = { t: Date.now() };
    const response = await call('simulate', { token: ids.token, method: 'card', outcome: 'success', attempt_id: crypto.randomUUID() }, {}, () => clock.t, {
      beforeWrite: async () => change(ids, clock),
    });
    expect([response.status, (await body(response)).error]).toEqual([status, error]);
    expect(count('simulated_checkouts')).toBe(0);
  });

  it('accept: a concurrent decline between validation and write leaves only the decline', async () => {
    const ids = await approvedQuote();
    const { version } = (await body(await call('view', { token: ids.token }))).view;
    const response = await call('accept', { token: ids.token, version: String(version) }, {}, Date.now(), {
      beforeWrite: async () => void (await call('decline', { token: ids.token, version: String(version) })),
    });
    expect([response.status, (await body(response)).error]).toEqual([409, 'decided']);
    expect(quote(ids.quoteId).status).toBe('declined');
    expect(db.raw.prepare("SELECT event FROM quote_events WHERE actor = 'customer'").all()).toEqual([{ event: 'declined' }]);
  });
});

describe('checkpoint 4 second review: checkout version binding and stored-attempt authorization', () => {
  async function acceptedQuote() {
    const ids = await approvedQuote();
    const { version } = (await body(await call('view', { token: ids.token }))).view;
    await call('accept', { token: ids.token, version: String(version) });
    return { ...ids, version: String(version + 1) };
  }
  const bumpVersion = (quoteId: string): void => void db.raw.prepare('UPDATE quotes SET version = version + 1 WHERE id = ?').run(quoteId);

  it('checkout requests must carry the displayed version; a missing version is refused', async () => {
    const { token } = await acceptedQuote();
    const response = await handleQuote(
      new Request(`${PUBLIC_ORIGIN}/api/quote/simulate`, {
        method: 'POST',
        body: JSON.stringify({ token, method: 'card', outcome: 'success', attempt_id: crypto.randomUUID() }),
        headers: { 'Content-Type': 'application/json', Origin: PUBLIC_ORIGIN, 'CF-Connecting-IP': identityFor(token) },
      }),
      env,
      'simulate',
    );
    expect(response.status).toBe(400);
    expect(count('simulated_checkouts')).toBe(0);
  });

  it('a stale displayed version is refused without a row; the answer carries the current view, not the stale one', async () => {
    const { quoteId, token, version } = await acceptedQuote();
    bumpVersion(quoteId);
    const response = await call('simulate', { token, version, method: 'card', outcome: 'success', attempt_id: crypto.randomUUID() });
    const answer = await body(response);
    expect([response.status, answer.error, answer.view.version]).toEqual([409, 'changed', Number(version) + 1]);
    expect(count('simulated_checkouts')).toBe(0);
  });

  it('a version change between the check and the write records nothing', async () => {
    const { quoteId, token, version } = await acceptedQuote();
    const response = await call('simulate', { token, version, method: 'card', outcome: 'success', attempt_id: crypto.randomUUID() }, {}, Date.now(), {
      beforeWrite: async () => void bumpVersion(quoteId),
    });
    expect([response.status, (await body(response)).error]).toEqual([409, 'changed']);
    expect(count('simulated_checkouts')).toBe(0);
  });

  it.each([
    ['the link revoked', (q: string): void => void db.raw.prepare('UPDATE quote_links SET revoked_at = 1 WHERE quote_id = ?').run(q), 410, 'revoked'],
    ['the quotation revoked', (q: string): void => void db.raw.prepare('UPDATE quotes SET revoked_at = 1 WHERE id = ?').run(q), 410, 'revoked'],
    ['the version changed', (q: string): void => void bumpVersion(q), 409, 'changed'],
  ] as const)('a stored attempt is not returned once %s (even if it happens mid-request)', async (_label, change, status, error) => {
    const { quoteId, token, version } = await acceptedQuote();
    const attempt = crypto.randomUUID();
    expect((await call('simulate', { token, version, method: 'card', outcome: 'success', attempt_id: attempt })).status).toBe(200);
    const repeat = await call('simulate', { token, version, method: 'card', outcome: 'success', attempt_id: attempt }, {}, Date.now(), {
      beforeWrite: async () => change(quoteId),
    });
    const answer = await body(repeat);
    expect([repeat.status, answer.error]).toEqual([status, error]);
    expect(JSON.stringify(answer)).not.toContain('"simulated":true');
    expect(count('simulated_checkouts')).toBe(1);
  });

  it('a stored attempt is not returned after the quotation expired during the request', async () => {
    const { quoteId, token, version } = await acceptedQuote();
    const attempt = crypto.randomUUID();
    await call('simulate', { token, version, method: 'bank', outcome: 'failure', attempt_id: attempt });
    const clock = { t: Date.now() };
    const repeat = await call('simulate', { token, version, method: 'bank', outcome: 'failure', attempt_id: attempt }, {}, () => clock.t, {
      beforeWrite: async () => void (clock.t = quote(quoteId).expires_at),
    });
    expect([repeat.status, (await body(repeat)).error]).toEqual([410, 'expired']);
  });

  it('valid idempotency is kept: the same attempt, still authorized, returns its original result', async () => {
    const { token, version } = await acceptedQuote();
    const attempt = crypto.randomUUID();
    const first = await body(await call('simulate', { token, version, method: 'bank', outcome: 'cancelled', attempt_id: attempt }));
    const again = await body(await call('simulate', { token, version, method: 'bank', outcome: 'cancelled', attempt_id: attempt }));
    expect([again.simulated, again.method, again.outcome]).toEqual([true, 'bank', 'cancelled']);
    expect(again.view).toEqual(first.view);
    expect(count('simulated_checkouts')).toBe(1);
  });
});

describe('checkpoint 4 second review: stable identities and the per-client limit', () => {
  it('a normal journey (views, reloads, retries, decision, checkout) stays well under the limit with one identity', async () => {
    const { token } = await approvedQuote();
    const who = { 'CF-Connecting-IP': '198.51.100.77' };
    const statuses: number[] = [];
    const record = async (r: Promise<Response>) => statuses.push((await r).status);
    for (let i = 0; i < 4; i++) await record(call('view', { token }, who)); // open, reload, reload, return
    const { version } = (await body(await call('view', { token }, who))).view;
    await record(call('accept', { token, version: String(version) }, who));
    await record(call('accept', { token, version: String(version) }, who)); // "Check again" after a lost answer
    const attempt = crypto.randomUUID();
    for (let i = 0; i < 2; i++) await record(call('simulate', { token, method: 'card', outcome: 'success', attempt_id: attempt }, who));
    await record(call('view', { token }, who));
    expect(statuses.every((s) => s === 200)).toBe(true);
    expect(statuses.length + 1).toBeLessThan(quoteLimits.perClientPerHour);
  });

  it('the test helper keeps one identity per journey: all of a journey’s requests share one rate-limit bucket', async () => {
    const { token } = await approvedQuote();
    const { version } = (await body(await call('view', { token }))).view;
    await call('view', { token });
    await call('accept', { token, version: String(version) });
    await call('simulate', { token, method: 'card', outcome: 'success', attempt_id: crypto.randomUUID() });
    const buckets = db.raw.prepare("SELECT key_hash, count FROM client_counters WHERE bucket LIKE 'qh:%'").all() as { count: number }[];
    expect(buckets).toHaveLength(1);
    expect(buckets[0]!.count).toBe(4);
  });

  it('deliberate exhaustion by one identity gets 429 with guidance; another customer is unaffected', async () => {
    const { token } = await approvedQuote();
    const who = { 'CF-Connecting-IP': '198.51.100.78' };
    for (let i = 0; i < quoteLimits.perClientPerHour; i++) expect((await call('view', { token }, who)).status).toBe(200);
    const refused = await call('view', { token }, who);
    expect([refused.status, refused.headers.get('retry-after')]).toEqual([429, '3600']);
    expect((await body(refused)).message).toBe('Too many requests from this connection. Please wait an hour and try again.');
    expect((await call('view', { token }, { 'CF-Connecting-IP': '198.51.100.79' })).status).toBe(200);
  });
});

describe('checkpoint 4 second review: only fully recognised answers count (page classifier)', () => {
  const view: QuoteView = { status: 'accepted', reference: 'BT-Q-2026-0001', requestReference: 'BT-R-2026-0001', firstName: 'Maria', scope: 's', amountCentavos: 1, version: 3, expiresAt: Date.now() + DAY, simulations: [] };
  const accept = { action: 'accept' as const, fields: { token: 't', version: '2' } };
  const simulate = { action: 'simulate' as const, fields: { token: 't', version: '3', method: 'card', outcome: 'success', attempt_id: 'a' } };

  it.each([
    ['an unreadable body', null],
    ['an empty object', {}],
    ['a view of the wrong shape', { view: { status: 'accepted' }, repeated: false }],
    ['a view still open', { view: { ...view, status: 'open' }, repeated: false }],
    ['a view without "repeated"', { view }],
    ['a view of another quotation', { view: { ...view, reference: 'BT-Q-2026-0002' }, repeated: false }],
  ])('acceptance answered 200 with %s is uncertain', (_label, body) => {
    expect(classifyResponse(accept, 200, body, 'BT-Q-2026-0001')).toEqual({ kind: 'uncertain' });
  });

  it.each([
    ['another outcome', { simulated: true, method: 'card', outcome: 'failure', view }],
    ['another method', { simulated: true, method: 'bank', outcome: 'success', view }],
    ['no "simulated"', { method: 'card', outcome: 'success', view }],
    ['no view', { simulated: true, method: 'card', outcome: 'success' }],
  ])('a simulated result answered 200 with %s is uncertain', (_label, body) => {
    expect(classifyResponse(simulate, 200, body, 'BT-Q-2026-0001')).toEqual({ kind: 'uncertain' });
  });

  it('recognises complete answers, link problems and definite refusals; unknown statuses stay uncertain', () => {
    expect(classifyResponse(accept, 200, { view, repeated: true }, 'BT-Q-2026-0001')).toMatchObject({ kind: 'view' });
    expect(classifyResponse(simulate, 200, { simulated: true, method: 'card', outcome: 'success', view }, 'BT-Q-2026-0001')).toMatchObject({ kind: 'simulated', outcome: 'success' });
    expect(classifyResponse(accept, 410, { error: 'expired', message: 'm' }, null)).toEqual({ kind: 'problem', message: 'm' });
    expect(classifyResponse(accept, 429, { error: 'rate_limited', message: 'm' }, null)).toEqual({ kind: 'notice', message: 'm', view: null, error: 'rate_limited' });
    for (const [status, body] of [[500, { error: 'server_error' }], [502, null], [418, { error: 'x', message: 'm' }], [410, { error: 'gone' }]] as const) {
      expect(classifyResponse(accept, status, body, null), String(status)).toEqual({ kind: 'uncertain' });
    }
  });
});

describe('test-only plumbing stays out of production', () => {
  it('no Worker or site module imports from tests/, and the deployable public entry passes no hooks', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
    const files = (dir: string): string[] =>
      readdirSync(join(root, dir)).flatMap((name) => {
        const path = join(dir, name);
        return statSync(join(root, path)).isDirectory() ? files(path) : /\.(ts|astro)$/.test(name) ? [path] : [];
      });
    const production = [...files('worker'), ...files('src')];
    expect(production.filter((path) => /from ['"][^'"]*tests\//.test(readFileSync(join(root, path), 'utf8')))).toEqual([]);
    const entry = readFileSync(join(root, 'worker', 'public', 'index.ts'), 'utf8');
    expect(entry).toMatch(/handleQuote\(request, env, quote\[1\] as [^)]*\)/);
    expect(entry).not.toMatch(/beforeWrite|hooks/);
  });
});

describe('checkpoint 4 third review: response data comes only from the authorized snapshot', () => {
  type Ids = { quoteId: string; token: string };
  const supersede = async ({ quoteId }: Ids) => {
    // A newer link generation, with history recorded under it.
    const newer = `v1.${'S'.repeat(43)}`;
    db.raw.prepare('INSERT INTO quote_links (token_hash, quote_id, link_generation, link_key_version, created_at) VALUES (?, ?, 2, 1, 0)').run(await sha256Hex(newer), quoteId);
    db.raw.prepare('UPDATE quotes SET link_generation = 2, token_hash = ? WHERE id = ?').run(await sha256Hex(newer), quoteId);
    db.raw.prepare("INSERT INTO simulated_checkouts (id, quote_id, attempt_id, method, outcome, created_at) VALUES (?, ?, ?, 'bank', 'success', 1)").run(crypto.randomUUID(), quoteId, crypto.randomUUID());
  };
  const changes: [string, (ids: Ids, clock: { t: number }) => Promise<void> | void, number, string][] = [
    ['the link revoked', ({ quoteId }) => void db.raw.prepare('UPDATE quote_links SET revoked_at = 1 WHERE quote_id = ?').run(quoteId), 410, 'revoked'],
    ['a newer link generation (with newer history)', supersede, 410, 'superseded'],
    ['the quotation expired', ({ quoteId }, clock) => void (clock.t = quote(quoteId).expires_at), 410, 'expired'],
  ];
  async function accepted() {
    const ids = await approvedQuote();
    const { version } = (await body(await call('view', { token: ids.token }))).view;
    await call('accept', { token: ids.token, version: String(version) });
    return { ...ids, version, accepted: String(version + 1) };
  }
  const noData = (answer: Record<string, unknown>) => {
    const text = JSON.stringify(answer);
    expect(text).not.toContain('Starter setup');
    expect(text).not.toContain('"simulations"');
    expect(text).not.toContain('"simulated":true');
  };

  it.each(changes)('view: %s just before the response read → refusal, no quotation data', async (_label, change, status, error) => {
    const ids = await accepted();
    await call('simulate', { token: ids.token, method: 'card', outcome: 'success', attempt_id: crypto.randomUUID() });
    const clock = { t: Date.now() };
    const response = await call('view', { token: ids.token }, {}, () => clock.t, { beforeRead: async () => change(ids, clock) });
    const answer = await body(response);
    expect([response.status, answer.error]).toEqual([status, error]);
    noData(answer);
  });

  it.each(changes)('repeated acceptance: %s just before the response read → refusal, no quotation data', async (_label, change, status, error) => {
    const ids = await accepted();
    const clock = { t: Date.now() };
    const response = await call('accept', { token: ids.token, version: String(ids.version) }, {}, () => clock.t, { beforeRead: async () => change(ids, clock) });
    const answer = await body(response);
    expect([response.status, answer.error]).toEqual([status, error]);
    noData(answer);
  });

  it.each(changes)('stored checkout attempt: %s just before the response read → refusal, no stored result or history', async (_label, change, status, error) => {
    const ids = await accepted();
    const attempt = crypto.randomUUID();
    await call('simulate', { token: ids.token, version: ids.accepted, method: 'card', outcome: 'success', attempt_id: attempt });
    const clock = { t: Date.now() };
    const response = await call('simulate', { token: ids.token, version: ids.accepted, method: 'card', outcome: 'success', attempt_id: attempt }, {}, () => clock.t, {
      beforeRead: async () => change(ids, clock),
    });
    const answer = await body(response);
    expect([response.status, answer.error]).toEqual([status, error]);
    noData(answer);
  });

  it('a version change just before the response read: no stored result; the conflict view is the current, authorized one', async () => {
    const ids = await accepted();
    const attempt = crypto.randomUUID();
    await call('simulate', { token: ids.token, version: ids.accepted, method: 'card', outcome: 'success', attempt_id: attempt });
    const response = await call('simulate', { token: ids.token, version: ids.accepted, method: 'card', outcome: 'success', attempt_id: attempt }, {}, Date.now(), {
      beforeRead: async () => void db.raw.prepare('UPDATE quotes SET version = version + 1 WHERE id = ?').run(ids.quoteId),
    });
    const answer = await body(response);
    expect([response.status, answer.error, answer.view.version]).toEqual([409, 'changed', Number(ids.accepted) + 1]);
    expect(JSON.stringify(answer)).not.toContain('"simulated":true');
  });
});

describe('checkpoint 4 third review: a refused "Check again" keeps the outcome unknown', () => {
  const view: QuoteView = { status: 'declined', reference: 'BT-Q-2026-0001', requestReference: 'BT-R-2026-0001', firstName: 'M', scope: 's', amountCentavos: 1, version: 3, expiresAt: Date.now() + DAY, simulations: [] };
  const notice = (error: string, withView = false) => ({ kind: 'notice' as const, message: 'm', view: withView ? view : null, error });

  it.each([
    ['429 rate limit', notice('rate_limited')],
    ['409 changed (with view)', notice('changed', true)],
    ['409 not accepted', notice('not_accepted')],
    ['409 limit', notice('limit')],
    ['400 bad request', notice('bad_request')],
    ['a link problem', { kind: 'problem' as const, message: 'm' }],
  ])('on a retry, %s settles nothing (for every action)', (_label, answer) => {
    for (const action of ['accept', 'decline', 'simulate'] as const) expect(settles(action, answer, true), action).toBe(false);
  });

  it('on a retry, only a recognised result, or the opposite decision already made, settles it', () => {
    expect(settles('accept', { kind: 'view', view, message: null }, true)).toBe(true);
    expect(settles('simulate', { kind: 'simulated', view, outcome: 'success' }, true)).toBe(true);
    expect(settles('accept', notice('decided', true), true)).toBe(true);
    expect(settles('simulate', notice('decided', true), true)).toBe(false);
  });

  it('on a first request, refusals that can follow a write keep the outcome unknown', () => {
    expect(settles('simulate', notice('changed', true), false)).toBe(false);
    expect(settles('simulate', notice('not_accepted'), false)).toBe(false);
    expect(settles('accept', notice('changed'), false)).toBe(false); // a conflict without a view
    expect(settles('accept', notice('changed', true), false)).toBe(true); // this request certainly made no decision
    expect(settles('accept', notice('rate_limited'), false)).toBe(true); // refused before any write
  });

  it('the wording separates "this check was refused" from "the action did not happen", with the wait', () => {
    const text = stillUnknownText('simulate', 'Too many requests from this connection. Please wait an hour and try again.', 3600);
    expect(text).toContain('This check could not be completed');
    expect(text).toContain('That does not mean your simulated result was not recorded; whether it was is still unknown.');
    expect(text).toContain('check again in about 60 minutes');
  });
});

describe('checkpoint 4 fourth review: a link problem after a decision or checkout keeps the outcome unknown', () => {
  it('a link problem settles nothing for accept, decline or checkout, on the first answer or a retry', () => {
    for (const action of ['accept', 'decline', 'simulate'] as const) {
      for (const isRetry of [false, true]) expect(settles(action, { kind: 'problem', message: 'm' }, isRetry), `${action} ${isRetry}`).toBe(false);
    }
    expect(settles('view', { kind: 'problem', message: 'm' }, false)).toBe(true); // loading a link: nothing pending
  });

  it('the wording says the action may have been recorded, that the link may prevent confirmation, and how to reach BuildTrack', () => {
    const text = linkUncertainText('accept');
    expect(text).toContain('Your acceptance may or may not have been recorded before this link stopped working.');
    expect(text).toContain('Select Check again to repeat the same request');
    expect(text).toContain('contact BuildTrack using the phone number shown below');
  });
});

describe('reload repair: the stored pending action is validated as untrusted input', () => {
  const token = `v1.${'P'.repeat(43)}`;
  const simulate = { token, version: '3', method: 'card', outcome: 'success', attempt_id: crypto.randomUUID() };

  it('round-trips exactly the request fields, and nothing else', () => {
    const raw = serializePending({ action: 'simulate', fields: simulate });
    expect(parsePending(raw, token)).toEqual({ action: 'simulate', fields: simulate });
    expect(parsePending(serializePending({ action: 'accept', fields: { token, version: '2' } }), token)).toEqual({ action: 'accept', fields: { token, version: '2' } });
    expect(raw).not.toMatch(/12345678|scope|amount|name|email/i);
  });

  it.each([
    ['nothing stored', null],
    ['not JSON', '{oops'],
    ['another link', serializePending({ action: 'accept', fields: { token: `v1.${'Q'.repeat(43)}`, version: '2' } })],
    ['an unknown action', JSON.stringify({ v: 1, action: 'pay', fields: { token, version: '2' } })],
    ['a prototype key as action', JSON.stringify({ v: 1, action: 'constructor', fields: { token, version: '2' } })],
    ['an extra field (e.g. a demo code)', JSON.stringify({ v: 1, action: 'accept', fields: { token, version: '2', code: '12345678' } })],
    ['a missing field', JSON.stringify({ v: 1, action: 'simulate', fields: { ...simulate, attempt_id: undefined } })],
    ['a bad version', JSON.stringify({ v: 1, action: 'accept', fields: { token, version: '0' } })],
    ['a bad method', JSON.stringify({ v: 1, action: 'simulate', fields: { ...simulate, method: 'crypto' } })],
    ['a bad attempt id', JSON.stringify({ v: 1, action: 'simulate', fields: { ...simulate, attempt_id: 'x' } })],
    ['a future format', JSON.stringify({ v: 2, action: 'accept', fields: { token, version: '2' } })],
    ['oversized', 'x'.repeat(2000)],
  ])('rejects %s', (_label, raw) => {
    expect(parsePending(raw, token)).toBeNull();
  });
});
