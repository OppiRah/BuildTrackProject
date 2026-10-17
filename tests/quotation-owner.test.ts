// The owner Worker (worker/owner/*) against the real migration SQL on node:sqlite
// (tests/support/sqlite-d1.ts): SIMULATED D1. No network, no email, no account. Access JWTs are
// signed with a key pair generated for this run (tests/support/access-jwt.ts).
// The same flows run on the real local Workers/D1 runtime in `npm run test:worker:owner`.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import ownerWorker from '../worker/owner/index.ts';
import { handleOwner, validOwnerOrigin, type OwnerEnv } from '../worker/owner/handler.ts';
import ownerTestWorker, { localLoopbackOrigin } from './worker/owner-test-worker.ts';
import { handleIntake, type IntakeEnv } from '../worker/public/intake.ts';
import { accessKeySource, verifyAccessJwt, type AccessKeySource } from '../src/lib/quotation/access-jwt.ts';
import { setLogSink } from '../src/lib/quotation/log.ts';
import {
  FORM_TOKEN_TTL_MS,
  formatAmount,
  importHmacKey,
  issueFormToken,
  parseAmount,
  sha256Hex,
  validateQuote,
  verifyFormToken,
} from '../src/lib/quotation/owner-form.ts';
import { currentLinkKey, quoteLinkToken } from '../src/lib/quotation/quote-link.ts';
import { createTestAccess, TEST_AUD, TEST_OWNER, TEST_TEAM, type TestAccess } from './support/access-jwt.ts';
import { createTestDatabase, type TestDatabase } from './support/sqlite-d1.ts';

const OWNER_ORIGIN = 'https://buildtrack-owner.example.test';
const PUBLIC_ORIGIN = 'https://buildtrack.example.test';
const DAY = 24 * 60 * 60 * 1000;
const randomKey = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));

let access: TestAccess;
let keys: AccessKeySource;
beforeAll(async () => {
  access = await createTestAccess();
  keys = async (kid) => (kid === access.kid ? access.publicJwk : null);
});

let db: TestDatabase;
let env: OwnerEnv;
let logLines: string[];
beforeEach(() => {
  db = createTestDatabase();
  env = {
    DB: db,
    WORKFLOW_ENABLED: 'on',
    OWNER_ORIGIN,
    OWNER_EMAIL: TEST_OWNER,
    ACCESS_TEAM_DOMAIN: TEST_TEAM,
    ACCESS_AUD: TEST_AUD,
    OWNER_FORM_KEY: randomKey(),
    QUOTE_LINK_KEY_CURRENT: '1',
    QUOTE_LINK_KEY_V1: randomKey(),
    EMAIL_MODE: 'resend', // the retained automatic mode; manual mode: quotation-manual.test.ts
  };
  logLines = [];
  setLogSink((line) => logLines.push(line));
});
afterEach(() => setLogSink(() => {}));

const sample = {
  service: '',
  plan: 'professional',
  name: 'Test Customer',
  email: 'customer@example.test',
  organization: 'Example Builders',
  phone: '',
  organization_type: 'contractors',
  project_need: 'Tracking cement across two sites',
  message: 'Fictional test request.',
  privacy_ack: 'yes',
};

/** Stores one request through the real public intake; returns its id and reference. */
async function storeRequest(values: Partial<typeof sample> = {}): Promise<{ id: string; ref: string }> {
  const intakeEnv: IntakeEnv = { DB: db, WORKFLOW_ENABLED: 'on', PUBLIC_ORIGIN, INTAKE_HMAC_KEY: randomKey(), INTAKE_HMAC_KEY_VERSION: '1', EMAIL_MODE: 'resend' };
  const response = await handleIntake(
    new Request(`${PUBLIC_ORIGIN}/api/quotation-requests`, {
      method: 'POST',
      body: JSON.stringify({ ...sample, ...values, submission_id: crypto.randomUUID() }),
      headers: { 'Content-Type': 'application/json', Origin: PUBLIC_ORIGIN, 'CF-Connecting-IP': `198.51.100.${Math.floor(Math.random() * 200)}` },
    }),
    intakeEnv,
  );
  const { reference } = (await response.json()) as { reference: string };
  const row = db.raw.prepare('SELECT id FROM quote_requests WHERE ref = ?').get(reference) as { id: string };
  return { id: row.id, ref: reference };
}

async function owner(path: string, init: RequestInit & { jwt?: string | null } = {}, now = Date.now()): Promise<Response> {
  const jwt = init.jwt === undefined ? await access.sign() : init.jwt;
  const headers = new Headers(init.headers);
  if (jwt) headers.set('Cf-Access-Jwt-Assertion', jwt);
  return handleOwner(new Request(`${OWNER_ORIGIN}${path}`, { ...init, headers }), env, keys, now);
}
function post(path: string, fields: Record<string, string>, headers: Record<string, string> = {}, now?: number) {
  return owner(
    path,
    { method: 'POST', body: new URLSearchParams(fields).toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: OWNER_ORIGIN, 'Sec-Fetch-Site': 'same-origin', ...headers } },
    now,
  );
}
const tokenIn = (html: string) => /name="form_token" value="([^"]+)"/.exec(html)?.[1] ?? '';
const versionIn = (html: string) => /name="version" value="(\d+)"/.exec(html)?.[1] ?? '';
const count = (table: string) => (db.raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
const tables = ['quote_requests', 'quotes', 'quote_events', 'email_jobs', 'used_form_tokens', 'quote_ref_sequences'];
const snapshot = () => JSON.stringify(tables.map((table) => db.raw.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));
const draftValues = { scope: 'Starter setup for two sites, with training.', amount: '7,990.50', validity_days: '14' };

/** Saves a first draft and returns the confirmation page's form fields. */
async function draftAndConfirm(requestId: string): Promise<{ form_token: string; version: string }> {
  const detail = await (await owner(`/requests/${requestId}`)).text();
  const saved = await post(`/requests/${requestId}/draft`, { form_token: tokenIn(detail), version: versionIn(detail), ...draftValues });
  expect(saved.status).toBe(303);
  const confirm = await (await owner(`/requests/${requestId}/confirm`)).text();
  return { form_token: tokenIn(confirm), version: versionIn(confirm) };
}

describe('Access JWT verification', () => {
  const config = { teamDomain: TEST_TEAM, audience: TEST_AUD, ownerEmail: TEST_OWNER };

  it('accepts only an RS256 token from the team, for the AUD, unexpired, for the owner email', async () => {
    expect(await verifyAccessJwt(await access.sign(), config, keys)).toBe(TEST_OWNER);
    expect(await verifyAccessJwt(await access.sign({ email: 'OWNER@example.test' }), config, keys)).toBe(TEST_OWNER);
    const now = Math.floor(Date.now() / 1000);
    for (const claims of [
      { aud: ['other-aud'] },
      { iss: 'https://other-team.cloudflareaccess.com' },
      { exp: now - 1 },
      { exp: undefined },
      { nbf: now + 600 },
      { email: 'someone-else@example.test' },
      { email: undefined }, // service tokens carry no email
    ]) {
      expect(await verifyAccessJwt(await access.sign(claims), config, keys), JSON.stringify(claims)).toBeNull();
    }
  });

  it('refuses forged signatures, other algorithms, unknown keys and malformed tokens', async () => {
    const other = await createTestAccess(access.kid); // same key id, different key
    expect(await verifyAccessJwt(await other.sign(), config, keys)).toBeNull();
    const [head, body] = (await access.sign()).split('.');
    const unsigned = `${btoa(JSON.stringify({ alg: 'none', kid: access.kid })).replace(/=+$/, '')}.${body}.`;
    expect(await verifyAccessJwt(unsigned, config, keys)).toBeNull();
    expect(await verifyAccessJwt(await access.sign({}, { alg: 'HS256' }), config, keys)).toBeNull();
    expect(await verifyAccessJwt(await access.sign({}, { kid: 'unknown' }), config, keys)).toBeNull();
    const tampered = `${head}.${btoa(JSON.stringify({ email: TEST_OWNER })).replace(/=+$/, '')}.${(await access.sign()).split('.')[2]}`;
    expect(await verifyAccessJwt(tampered, config, keys)).toBeNull();
    for (const token of [null, '', 'a.b', 'a.b.c.d', 'x'.repeat(9000), '!!!.!!!.!!!']) expect(await verifyAccessJwt(token, config, keys)).toBeNull();
    expect(await verifyAccessJwt(await access.sign(), { ...config, teamDomain: 'evil.example.test' }, keys)).toBeNull();
  });

  it('fetches signing keys only from the team domain, and none for an invalid domain', async () => {
    const fetcher = vi.fn(async () => Response.json({ keys: [access.publicJwk] }));
    const team = `cache-${crypto.randomUUID().slice(0, 8)}.cloudflareaccess.com`;
    const source = accessKeySource(team, fetcher as unknown as typeof fetch);
    expect(await source(access.kid)).toEqual(access.publicJwk);
    expect(await source(access.kid)).toEqual(access.publicJwk);
    expect(fetcher.mock.calls).toEqual([[`https://${team}/cdn-cgi/access/certs`]]); // cached
    expect(await accessKeySource('cloudflareaccess.com.evil.test', fetcher as unknown as typeof fetch)(access.kid)).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('the deployed entry trusts only the team domain’s published keys, not local test keys', async () => {
    const requested: string[] = [];
    const stub = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      requested.push(String(input));
      return Response.json({ keys: [] }); // the real team does not publish the test key
    });
    const team = `entry-${crypto.randomUUID().slice(0, 8)}.cloudflareaccess.com`;
    try {
      // A token valid in every claim for this team, signed with the local test key.
      const response = await ownerWorker.fetch(
        new Request(`${OWNER_ORIGIN}/`, { headers: { 'Cf-Access-Jwt-Assertion': await access.sign({ iss: `https://${team}` }) } }),
        { ...env, ACCESS_TEAM_DOMAIN: team },
      );
      expect(response.status).toBe(404);
      expect(requested).toHaveLength(1);
      expect(requested[0]).toMatch(/^https:\/\/entry-[0-9a-f]{8}\.cloudflareaccess\.com\/cdn-cgi\/access\/certs$/);
    } finally {
      stub.mockRestore();
    }
  });
});

describe('owner form tokens and values', () => {
  const binding = { owner: TEST_OWNER, action: 'approve' as const, target: crypto.randomUUID(), version: 3 };

  it('verify only for the exact owner, action, target and version, before expiry, with the same key', async () => {
    const key = (await importHmacKey(randomKey()))!;
    const now = Date.now();
    const token = await issueFormToken(key, binding, now);
    expect(await verifyFormToken(key, token, binding, now)).toBe(now + FORM_TOKEN_TTL_MS);
    for (const change of [{ owner: 'x@example.test' }, { action: 'save' as const }, { target: crypto.randomUUID() }, { version: 4 }]) {
      expect(await verifyFormToken(key, token, { ...binding, ...change }, now)).toBeNull();
    }
    expect(await verifyFormToken(key, token, binding, now + FORM_TOKEN_TTL_MS)).toBeNull();
    expect(await verifyFormToken((await importHmacKey(randomKey()))!, token, binding, now)).toBeNull();
    const [nonce, expires, mac] = token.split('.');
    expect(await verifyFormToken(key, `${nonce}.${Number(expires) + 1}.${mac}`, binding, now)).toBeNull();
    expect(await verifyFormToken(key, 'garbage', binding, now)).toBeNull();
    expect(await importHmacKey(btoa('short'))).toBeNull();
  });

  it('parses and formats peso amounts in centavos within ₱1–₱10,000,000', () => {
    expect([parseAmount('7990'), parseAmount('7,990.5'), parseAmount(' 10,000,000.00 '), parseAmount('1')]).toEqual([799000, 799050, 1000000000, 100]);
    for (const bad of ['', '7.999', '1,23', '-5', '1e3', '₱5', '7 990', '0x10']) expect(parseAmount(bad), bad).toBeNull();
    expect(formatAmount(799050)).toBe('₱7,990.50');
    expect('errors' in validateQuote({ scope: 'Ten chars!', amount: '0.99', validity_days: '14' })).toBe(true);
    expect('errors' in validateQuote({ scope: 'Ten chars!', amount: '10,000,000.01', validity_days: '14' })).toBe(true);
    expect(validateQuote({ scope: ' Ten chars!\r\n ', amount: '1', validity_days: '30' })).toEqual({ values: { scope: 'Ten chars!', amountCentavos: 100, validityDays: 30 } });
  });

  it('counts scope length in characters (as SQLite does) and refuses control characters', () => {
    expect(validateQuote({ scope: '🏗'.repeat(9), amount: '1', validity_days: '1' })).toHaveProperty('errors.scope');
    expect(validateQuote({ scope: '🏗'.repeat(2000), amount: '1', validity_days: '1' })).toHaveProperty('values');
    expect(validateQuote({ scope: 'Scope with \u0007 bell', amount: '1', validity_days: '1' })).toHaveProperty('errors.scope');
    for (const days of ['0', '31', '1.5', '', 'x']) expect(validateQuote({ scope: 'Ten chars!', amount: '1', validity_days: days }), days).toHaveProperty('errors.validity_days');
  });

  it('derives the same customer-link token for the same inputs and a new one per generation', async () => {
    const link = (await currentLinkKey({ QUOTE_LINK_KEY_CURRENT: '1', QUOTE_LINK_KEY_V1: randomKey() }))!;
    const id = crypto.randomUUID();
    const first = await quoteLinkToken(link, id, 1);
    expect(first).toMatch(/^v1\.[A-Za-z0-9_-]{43}$/);
    expect(await quoteLinkToken(link, id, 1)).toBe(first);
    expect(await quoteLinkToken(link, id, 2)).not.toBe(first);
    expect(await currentLinkKey({ QUOTE_LINK_KEY_CURRENT: '2', QUOTE_LINK_KEY_V1: randomKey() })).toBeNull();
    await expect(quoteLinkToken(link, 'not-a-uuid', 1)).rejects.toThrow();
  });
});

describe('owner Worker: access, configuration and methods', () => {
  it('answers 404 without, or with a forged or other-owner, Access JWT, on every path', async () => {
    const forged = await (await createTestAccess(access.kid)).sign();
    for (const path of ['/', `/requests/${crypto.randomUUID()}`, '/nonexistent']) {
      for (const jwt of [null, 'not.a.jwt', forged, await access.sign({ email: 'intruder@example.test' })]) {
        expect((await owner(path, { jwt })).status).toBe(404);
      }
    }
    expect((await post(`/requests/${crypto.randomUUID()}/approve`, { form_token: 'x', version: '1' }, { 'Cf-Access-Jwt-Assertion': '' })).status).toBe(404);
    expect(logLines.every((line) => JSON.parse(line).event === 'owner_denied')).toBe(true);
  });

  it.each(['WORKFLOW_ENABLED', 'DB', 'OWNER_ORIGIN', 'OWNER_EMAIL', 'ACCESS_TEAM_DOMAIN', 'ACCESS_AUD', 'OWNER_FORM_KEY', 'QUOTE_LINK_KEY_V1'] as const)(
    'fails closed with 503 when %s is missing',
    async (name) => {
      env = { ...env, [name]: undefined };
      expect((await owner('/')).status).toBe(503);
    },
  );

  const invalidOrigins = [
    'null',
    'not a url',
    'buildtrack-owner.example.test',
    'https://buildtrack-owner.example.test/',
    'https://buildtrack-owner.example.test/owner',
    'https://buildtrack-owner.example.test?x=1',
    'https://buildtrack-owner.example.test#top',
    'https://user:pass@buildtrack-owner.example.test',
    'HTTPS://Buildtrack-Owner.example.test',
    'https://buildtrack-owner.example.test:443',
    'https://buildtrack-owner.example.test ',
    'http://buildtrack-owner.example.test',
    'http://192.168.1.5:8788',
    'ftp://buildtrack-owner.example.test',
    'file:///owner',
    'javascript:alert(1)',
    'data:text/html,x',
  ];

  it('the deployed rule accepts only a canonical HTTPS origin; loopback HTTP only in the test wrapper', () => {
    const loopback = ['http://127.0.0.1:8788', 'http://[::1]:8788', 'http://localhost:8788'];
    for (const value of ['https://buildtrack-owner.example.test', 'https://buildtrack-owner.example.test:8443']) {
      expect([validOwnerOrigin(value), localLoopbackOrigin(value)], value).toEqual([true, true]);
    }
    for (const value of loopback) expect([validOwnerOrigin(value), localLoopbackOrigin(value)], value).toEqual([false, true]);
    for (const value of [...invalidOrigins, '', undefined]) expect([validOwnerOrigin(value), localLoopbackOrigin(value)], String(value)).toEqual([false, false]);
  });

  it.each(['http://localhost:8788', 'http://127.0.0.1:8788', 'http://[::1]:8788'])(
    'with OWNER_ORIGIN %s, public HTTPS GET and POST get 503 before any key lookup or database access',
    async (value) => {
      const { id } = await storeRequest();
      const { form_token, version } = await draftAndConfirm(id);
      let calls = 0;
      const counted = { prepare: (sql: string) => (calls++, db.prepare(sql)), batch: (statements: never[]) => (calls++, db.batch(statements)) };
      const keyLookups = vi.fn(keys);
      const outbound = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ keys: [access.publicJwk] }));
      const configured = { ...env, OWNER_ORIGIN: value, DB: counted as unknown as OwnerEnv['DB'] };
      const before = snapshot();
      try {
        const jwt = await access.sign();
        const requests = (origin: string) => [
          new Request(`${OWNER_ORIGIN}/`, { headers: { 'Cf-Access-Jwt-Assertion': jwt } }),
          new Request(`${OWNER_ORIGIN}/requests/${id}/confirm`, { headers: { 'Cf-Access-Jwt-Assertion': jwt } }),
          ...['approve', 'draft'].map(
            (action) =>
              new Request(`${OWNER_ORIGIN}/requests/${id}/${action}`, {
                method: 'POST',
                body: new URLSearchParams(action === 'approve' ? { form_token, version } : { form_token, version, ...draftValues }).toString(),
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: origin, 'Sec-Fetch-Site': 'same-origin', 'Cf-Access-Jwt-Assertion': jwt },
              }),
          ),
        ];
        for (const origin of [value, OWNER_ORIGIN]) {
          for (const request of requests(origin)) expect((await handleOwner(request, configured, keyLookups)).status, `${request.method} ${request.url}`).toBe(503);
          // The deployable entry, with the real key source: no certs fetch either.
          for (const request of requests(origin)) expect((await ownerWorker.fetch(request, configured)).status, `entry ${request.method} ${request.url}`).toBe(503);
        }
        expect(keyLookups).not.toHaveBeenCalled();
        expect(outbound).not.toHaveBeenCalled();
        expect(calls).toBe(0);
        expect(snapshot()).toBe(before);
      } finally {
        outbound.mockRestore();
      }
    },
  );

  it('the test wrapper still serves loopback HTTP for local tests, with every other check intact', async () => {
    const { id } = await storeRequest();
    const local = 'http://127.0.0.1:8788';
    const wrapperEnv = { ...env, OWNER_ORIGIN: local, TEST_ACCESS_JWKS: JSON.stringify({ keys: [access.publicJwk] }) };
    const call = async (path: string, init: RequestInit = {}, jwt: string | null = null) => {
      const headers = new Headers(init.headers);
      if (jwt) headers.set('Cf-Access-Jwt-Assertion', jwt);
      return ownerTestWorker.fetch(new Request(`${local}${path}`, { ...init, headers }), wrapperEnv);
    };
    const jwt = await access.sign();
    expect((await call('/')).status).toBe(404);
    const detail = await (await call(`/requests/${id}`, {}, jwt)).text();
    const form = (fields: Record<string, string>, origin = local) => ({
      method: 'POST',
      body: new URLSearchParams(fields).toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: origin },
    });
    const fields = { form_token: tokenIn(detail), version: versionIn(detail), ...draftValues };
    expect((await call(`/requests/${id}/draft`, form(fields, OWNER_ORIGIN), jwt)).status).toBe(403); // exact Origin still required
    expect((await call(`/requests/${id}/draft`, form({ ...fields, form_token: 'forged' }), jwt)).status).toBe(403);
    expect((await call(`/requests/${id}/draft`, form(fields), jwt)).status).toBe(303);
    // The wrapper serves nothing unless addressed to 127.0.0.1.
    expect((await ownerTestWorker.fetch(new Request(`${OWNER_ORIGIN}/`, { headers: { 'Cf-Access-Jwt-Assertion': jwt } }), wrapperEnv)).status).toBe(404);
  });

  it.each(invalidOrigins)('answers 503 to GET and POST with zero database access when OWNER_ORIGIN is %j', async (value) => {
    const { id } = await storeRequest();
    const { form_token, version } = await draftAndConfirm(id);
    let calls = 0;
    const counted = { prepare: (sql: string) => (calls++, db.prepare(sql)), batch: (statements: never[]) => (calls++, db.batch(statements)) };
    env = { ...env, OWNER_ORIGIN: value, DB: counted as unknown as OwnerEnv['DB'] };
    const before = snapshot();
    for (const path of ['/', `/requests/${id}`, `/requests/${id}/confirm`]) expect((await owner(path)).status, path).toBe(503);
    // The browser would send the configured value back as Origin; even an exact match is refused.
    for (const origin of [value, OWNER_ORIGIN]) {
      expect((await post(`/requests/${id}/approve`, { form_token, version }, { Origin: origin })).status).toBe(503);
      expect((await post(`/requests/${id}/draft`, { form_token, version, ...draftValues }, { Origin: origin })).status).toBe(503);
    }
    expect(calls).toBe(0);
    expect(snapshot()).toBe(before);
  });

  it('keeps the exact-Origin check, the JWT and the form token with another valid HTTPS origin', async () => {
    const { id } = await storeRequest();
    const { form_token, version } = await draftAndConfirm(id);
    const other = 'https://owner-preview.example.test';
    env = { ...env, OWNER_ORIGIN: other };
    expect((await post(`/requests/${id}/approve`, { form_token, version })).status).toBe(403); // the old origin no longer matches
    expect((await owner('/', { jwt: null })).status).toBe(404);
    expect((await post(`/requests/${id}/approve`, { form_token: 'forged', version }, { Origin: other })).status).toBe(403);
    expect((await post(`/requests/${id}/approve`, { form_token, version }, { Origin: other })).status).toBe(303);
  });

  it('sends no-store, a same-origin referrer policy, noindex, no framing and a self-only CSP, and no CORS', async () => {
    const response = await owner('/');
    expect(response.status).toBe(200);
    expect(Object.fromEntries(['cache-control', 'referrer-policy', 'x-robots-tag', 'x-frame-options', 'access-control-allow-origin'].map((h) => [h, response.headers.get(h)]))).toEqual({
      'cache-control': 'no-store',
      'referrer-policy': 'same-origin', // under no-referrer, Chromium sent Origin: null on native form submissions
      'x-robots-tag': 'noindex',
      'x-frame-options': 'DENY',
      'access-control-allow-origin': null,
    });
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
  });

  it('allows only GET/HEAD on pages and only POST on actions', async () => {
    const { id } = await storeRequest();
    expect((await owner(`/requests/${id}/draft`)).status).toBe(405);
    expect((await owner(`/requests/${id}/approve`)).headers.get('allow')).toBe('POST');
    expect((await owner('/', { method: 'POST' })).status).toBe(405);
    expect((await owner(`/requests/${id}`, { method: 'DELETE' })).status).toBe(405);
    expect((await owner(`/requests/${id}`, { method: 'HEAD' })).status).toBe(200);
  });

  it('changes no rows on any GET, including pages that issue form tokens', async () => {
    const { id } = await storeRequest();
    const second = await storeRequest();
    await draftAndConfirm(second.id);
    const before = snapshot();
    for (const path of ['/', `/requests/${id}`, `/requests/${id}/confirm`, `/requests/${second.id}`, `/requests/${second.id}/confirm`, `/requests/${id}/draft`, `/requests/${id}/approve`]) {
      await owner(path);
    }
    expect(snapshot()).toBe(before);
  });

  it('escapes every stored value on the list and request pages', async () => {
    const { id } = await storeRequest();
    db.raw.prepare("UPDATE quote_requests SET name = '<script>alert(1)</script>', message = '\"><img src=x onerror=alert(1)>' WHERE id = ?").run(id);
    const list = await (await owner('/')).text();
    const detail = await (await owner(`/requests/${id}`)).text();
    for (const html of [list, detail]) expect(html).not.toMatch(/<script>alert|<img src=x/);
    expect(detail).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});

describe('owner Worker: drafts, confirmation and approval', () => {
  it('saves a first draft with a BT-Q reference, prefilled from the proposed plan price, then confirms exact details', async () => {
    const { id, ref } = await storeRequest();
    const detail = await (await owner(`/requests/${id}`)).text();
    expect(detail).toContain(ref);
    expect(detail).toContain('value="7990"');
    expect(detail).toContain('Prefilled from the proposed Professional price (₱7,990.00 per month)');
    expect(versionIn(detail)).toBe('0');
    const saved = await post(`/requests/${id}/draft`, { form_token: tokenIn(detail), version: '0', ...draftValues });
    expect(saved.status).toBe(303);
    expect(saved.headers.get('location')).toBe(`/requests/${id}/confirm`);
    const quote = db.raw.prepare('SELECT * FROM quotes').get() as Record<string, unknown>;
    expect(quote).toMatchObject({ request_id: id, status: 'draft', version: 1, amount_centavos: 799050, validity_days: 14, token_hash: null });
    expect(quote.ref).toMatch(/^BT-Q-\d{4}-0001$/);
    expect(db.raw.prepare('SELECT status FROM quote_requests WHERE id = ?').get(id)).toEqual({ status: 'quoted' });
    expect(count('email_jobs')).toBe(1); // only the intake's owner notification
    const confirm = await (await owner(`/requests/${id}/confirm`)).text();
    for (const part of ['Test Customer &lt;customer@example.test&gt;', 'Starter setup for two sites, with training.', '₱7,990.50', '14 days after approval', 'Approve and queue email', `href="/requests/${id}"`]) {
      expect(confirm).toContain(part);
    }
  });

  it('approves once: freezes the snapshot, records the link hash and expiry, and queues one quotation email job', async () => {
    const { id } = await storeRequest();
    const { form_token: token, version } = await draftAndConfirm(id);
    const now = Date.now();
    const approved = await post(`/requests/${id}/approve`, { form_token: token, version }, {}, now);
    expect(approved.status).toBe(303);
    expect(approved.headers.get('location')).toBe(`/requests/${id}`);
    const quote = db.raw.prepare('SELECT * FROM quotes').get() as Record<string, any>;
    expect(quote).toMatchObject({
      status: 'approved',
      version: 2,
      link_key_version: 1,
      link_generation: 1,
      approved_at: now,
      approved_by: TEST_OWNER,
      expires_at: now + 14 * DAY,
      snap_name: 'Test Customer',
      snap_email: 'customer@example.test',
      snap_scope: draftValues.scope,
      snap_amount_centavos: 799050,
      snap_validity_days: 14,
    });
    const link = (await currentLinkKey(env as Record<string, unknown>))!;
    expect(quote.token_hash).toBe(await sha256Hex(await quoteLinkToken(link, quote.id, 1)));
    const jobs = db.raw.prepare("SELECT * FROM email_jobs WHERE kind = 'quotation'").all() as Record<string, unknown>[];
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ quote_id: quote.id, request_id: id, status: 'queued', attempts: 0, idempotency_key: `bt-q-${quote.id}-g1-s0` });
    expect(db.raw.prepare('SELECT event, version FROM quote_events ORDER BY version').all()).toEqual([
      { event: 'created', version: 1 },
      { event: 'approved', version: 2 },
    ]);
    const page = await (await owner(`/requests/${id}`)).text();
    expect(page).toContain('No email has been sent');
    expect(page).not.toContain('name="form_token"');
  });

  it('a second click, a replayed token or a stale confirmation page changes nothing', async () => {
    const { id } = await storeRequest();
    const { form_token: token, version } = await draftAndConfirm(id);
    expect((await post(`/requests/${id}/approve`, { form_token: token, version })).status).toBe(303);
    const after = snapshot();
    expect((await post(`/requests/${id}/approve`, { form_token: token, version })).status).toBe(409);
    expect(snapshot()).toBe(after);

    // Stale: the draft changed after the confirmation page was shown.
    const other = await storeRequest();
    const stale = await draftAndConfirm(other.id);
    const detail = await (await owner(`/requests/${other.id}`)).text();
    expect((await post(`/requests/${other.id}/draft`, { form_token: tokenIn(detail), version: versionIn(detail), ...draftValues, amount: '9000' })).status).toBe(303);
    expect((await post(`/requests/${other.id}/approve`, stale)).status).toBe(409); // genuine token, but the draft has moved on
    expect((await post(`/requests/${other.id}/approve`, { ...stale, version: String(Number(stale.version) + 1) })).status).toBe(403);
    expect(count("email_jobs WHERE kind = 'quotation'")).toBe(1);
  });

  it('two concurrent approvals with separate confirmation pages create exactly one job', async () => {
    const { id } = await storeRequest();
    const first = await draftAndConfirm(id);
    const second = { form_token: tokenIn(await (await owner(`/requests/${id}/confirm`)).text()), version: first.version };
    const statuses = await Promise.all([first, second].map((fields) => post(`/requests/${id}/approve`, fields).then((r) => r.status)));
    expect(statuses.sort()).toEqual([303, 409]);
    expect(count("email_jobs WHERE kind = 'quotation'")).toBe(1);
    expect(count("quote_events WHERE event = 'approved'")).toBe(1);
  });

  it('two concurrent saves of the same draft version: one wins, the other changes nothing', async () => {
    const { id } = await storeRequest();
    await draftAndConfirm(id);
    const pages = await Promise.all([1, 2].map(() => owner(`/requests/${id}`).then((r) => r.text())));
    const statuses = await Promise.all(
      pages.map((html, i) => post(`/requests/${id}/draft`, { form_token: tokenIn(html), version: versionIn(html), ...draftValues, amount: String(5000 + i) }).then((r) => r.status)),
    );
    expect(statuses.sort()).toEqual([303, 409]);
    expect(db.raw.prepare('SELECT version FROM quotes').get()).toEqual({ version: 2 });
  });

  it('a resubmitted first-draft form cannot create a second quotation', async () => {
    const { id } = await storeRequest();
    const detail = await (await owner(`/requests/${id}`)).text();
    const fields = { form_token: tokenIn(detail), version: '0', ...draftValues };
    expect((await post(`/requests/${id}/draft`, fields)).status).toBe(303);
    expect((await post(`/requests/${id}/draft`, fields)).status).toBe(403);
    expect(count('quotes')).toBe(1);
  });

  it('shows field errors without saving and keeps the owner’s input', async () => {
    const { id } = await storeRequest();
    const detail = await (await owner(`/requests/${id}`)).text();
    const before = snapshot();
    const invalid = await post(`/requests/${id}/draft`, { form_token: tokenIn(detail), version: '0', scope: 'short', amount: '0.50', validity_days: '45' });
    expect(invalid.status).toBe(422);
    const html = await invalid.text();
    expect(html).toContain('Nothing was saved');
    for (const field of ['scope', 'amount', 'validity_days']) expect(html).toContain(`href="#${field}"`);
    expect(html).toContain('>short</textarea>');
    expect(snapshot()).toBe(before);
    expect((await post(`/requests/${id}/draft`, { form_token: tokenIn(html), version: '0', ...draftValues })).status).toBe(303);
  });
});

describe('owner Worker: cross-site and malformed submissions change nothing', () => {
  it.each([
    ['a missing Origin', { Origin: '' }],
    ['another Origin', { Origin: 'https://attacker.example.test' }],
    ['the public site’s Origin', { Origin: PUBLIC_ORIGIN }],
    ['cross-site fetch metadata', { 'Sec-Fetch-Site': 'cross-site' }],
  ])('refuses %s with 403', async (_label, headers) => {
    const { id } = await storeRequest();
    const { form_token: token, version } = await draftAndConfirm(id);
    const before = snapshot();
    const response = await post(`/requests/${id}/approve`, { form_token: token, version }, headers as Record<string, string>);
    expect(response.status).toBe(403);
    expect(snapshot()).toBe(before);
    // The token is still unused, so the genuine page still works.
    expect((await post(`/requests/${id}/approve`, { form_token: token, version })).status).toBe(303);
  });

  it('refuses other media types, extra or missing fields, and tokens for another quotation or key', async () => {
    const { id } = await storeRequest();
    const { form_token: token, version } = await draftAndConfirm(id);
    const other = await storeRequest();
    const otherConfirm = await draftAndConfirm(other.id);
    const before = snapshot();
    expect((await post(`/requests/${id}/approve`, { form_token: token, version }, { 'Content-Type': 'text/plain' })).status).toBe(415);
    expect((await post(`/requests/${id}/approve`, { form_token: token, version, extra: '1' })).status).toBe(400);
    expect((await post(`/requests/${id}/approve`, { form_token: token })).status).toBe(400);
    expect((await post(`/requests/${id}/approve`, { form_token: otherConfirm.form_token, version })).status).toBe(403);
    const foreignKey = (await importHmacKey(randomKey()))!;
    const quoteId = (db.raw.prepare('SELECT id FROM quotes WHERE request_id = ?').get(id) as { id: string }).id;
    const forged = await issueFormToken(foreignKey, { owner: TEST_OWNER, action: 'approve', target: quoteId, version: Number(version) }, Date.now());
    expect((await post(`/requests/${id}/approve`, { form_token: forged, version })).status).toBe(403);
    const ownKey = (await importHmacKey(env.OWNER_FORM_KEY))!;
    const expired = await issueFormToken(ownKey, { owner: TEST_OWNER, action: 'approve', target: quoteId, version: Number(version) }, Date.now() - FORM_TOKEN_TTL_MS - 1);
    expect((await post(`/requests/${id}/approve`, { form_token: expired, version })).status).toBe(403);
    expect(snapshot()).toBe(before);
  });

  it('logs only fixed codes: no names, emails, tokens or form values', async () => {
    const { id } = await storeRequest();
    const { form_token: token, version } = await draftAndConfirm(id);
    await post(`/requests/${id}/approve`, { form_token: token, version });
    await post(`/requests/${id}/approve`, { form_token: token, version });
    const output = logLines.join('\n');
    for (const value of ['Test Customer', 'customer@example.test', TEST_OWNER, token, 'Starter setup', '7,990', id]) expect(output).not.toContain(value);
    expect(output).toContain('"event":"owner_changed"');
  });
});
