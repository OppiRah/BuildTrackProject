// Turnstile challenge-gated intake (prepared, DISABLED by default) on SIMULATED D1, with a MOCKED
// Siteverify (an injected fetch; no request ever leaves the process).

import { beforeEach, describe, expect, it } from 'vitest';
import { handleIntake, type IntakeEnv } from '../worker/public/intake.ts';
import { maxBodyBytes, parseIntake, TURNSTILE_FIELD } from '../src/lib/quotation/intake.ts';
import { SITEVERIFY_URL, TURNSTILE_ACTION, verifyTurnstile } from '../src/lib/quotation/turnstile.ts';
import { createTestDatabase, type TestDatabase } from './support/sqlite-d1.ts';

const ORIGIN = 'https://buildtrack.example.test';
const HOST = 'buildtrack.example.test';
const randomKey = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
const valid = {
  service: '', plan: 'starter', name: 'Test Customer', email: 'customer@example.test', organization: 'Example Builders', phone: '',
  organization_type: 'contractors', project_need: 'Tracking cement across two sites', message: '', privacy_ack: 'yes',
};

/** A mocked Siteverify: records calls; `answer` decides the reply per call. */
function mockSiteverify(answer: (form: URLSearchParams, call: number) => Response | Promise<Response> | 'throw') {
  const calls: URLSearchParams[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    expect(url).toBe(SITEVERIFY_URL);
    const form = new URLSearchParams(String(init.body));
    calls.push(form);
    const reply = await answer(form, calls.length);
    if (reply === 'throw') throw new TypeError('network');
    return reply;
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}
const ok = (extra: Record<string, unknown> = {}) => Response.json({ success: true, hostname: HOST, action: TURNSTILE_ACTION, 'error-codes': [], ...extra });

let db: TestDatabase;
let env: IntakeEnv;
let dbCalls: number;
beforeEach(() => {
  db = createTestDatabase();
  dbCalls = 0;
  const counted = {
    prepare: (sql: string) => (dbCalls++, db.prepare(sql)),
    batch: (statements: never[]) => (dbCalls++, db.batch(statements)),
  };
  env = {
    DB: counted as unknown as IntakeEnv['DB'],
    WORKFLOW_ENABLED: 'on',
    PUBLIC_ORIGIN: ORIGIN,
    INTAKE_HMAC_KEY: randomKey(),
    INTAKE_HMAC_KEY_VERSION: '1',
    TURNSTILE_ENABLED: 'on',
    TURNSTILE_SECRET_KEY: 'test-secret-not-real',
  };
});
const post = (body: Record<string, string>, fetcher?: typeof fetch, type = 'application/json') =>
  handleIntake(
    new Request(`${ORIGIN}/api/quotation-requests`, {
      method: 'POST',
      body: type === 'application/json' ? JSON.stringify(body) : new URLSearchParams(body).toString(),
      headers: { 'Content-Type': type, Origin: ORIGIN, 'CF-Connecting-IP': '198.51.100.7' },
    }),
    env,
    Date.now(),
    { turnstileFetch: fetcher },
  );
const stored = () => (db.raw.prepare('SELECT COUNT(*) AS n FROM quote_requests').get() as { n: number }).n;

describe('Siteverify client (documented contract, mocked)', () => {
  it('accepts only success for the expected hostname and action, sending secret, response, remoteip and a UUID idempotency key', async () => {
    const { fetcher, calls } = mockSiteverify(() => ok());
    expect(await verifyTurnstile({ secret: 's', token: 't0k', remoteip: '198.51.100.7', expectedHostname: HOST, fetcher })).toEqual({ ok: true });
    expect([calls[0]!.get('secret'), calls[0]!.get('response'), calls[0]!.get('remoteip')]).toEqual(['s', 't0k', '198.51.100.7']);
    expect(calls[0]!.get('idempotency_key')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it.each([
    ['another hostname', () => ok({ hostname: 'evil.example.test' }), 'E_TS_HOSTNAME'],
    ['another action', () => ok({ action: 'login' }), 'E_TS_ACTION'],
    ['a replayed or expired token', () => Response.json({ success: false, 'error-codes': ['timeout-or-duplicate'] }), 'E_TS_EXPIRED_OR_REUSED'],
    ['an invalid token', () => Response.json({ success: false, 'error-codes': ['invalid-input-response'] }), 'E_TS_REJECTED'],
  ] as const)('refuses %s', async (_label, answer, code) => {
    const { fetcher } = mockSiteverify(answer);
    expect(await verifyTurnstile({ secret: 's', token: 't', remoteip: null, expectedHostname: HOST, fetcher })).toEqual({ ok: false, code });
  });

  it('retries a failed call once with the SAME idempotency key; then fails closed', async () => {
    const flaky = mockSiteverify((_f, n) => (n === 1 ? 'throw' : ok()));
    expect(await verifyTurnstile({ secret: 's', token: 't', remoteip: null, expectedHostname: HOST, fetcher: flaky.fetcher })).toEqual({ ok: true });
    expect(flaky.calls).toHaveLength(2);
    expect(flaky.calls[0]!.get('idempotency_key')).toBe(flaky.calls[1]!.get('idempotency_key'));
    for (const failing of [() => 'throw' as const, () => new Response('x', { status: 503 }), () => Response.json({ success: false, 'error-codes': ['internal-error'] })]) {
      const down = mockSiteverify(failing);
      expect(await verifyTurnstile({ secret: 's', token: 't', remoteip: null, expectedHostname: HOST, fetcher: down.fetcher })).toEqual({ ok: false, code: 'E_TS_UNAVAILABLE' });
      expect(down.calls).toHaveLength(2);
    }
  });

  it('refuses a missing or oversized token without calling Siteverify', async () => {
    const { fetcher, calls } = mockSiteverify(() => ok());
    for (const token of [null, '', 'x'.repeat(2049), 'has space']) {
      expect(await verifyTurnstile({ secret: 's', token, remoteip: null, expectedHostname: HOST, fetcher })).toEqual({ ok: false, code: 'E_TS_MISSING' });
    }
    expect(calls).toHaveLength(0);
  });
});

describe('challenge-gated intake (Turnstile mode; disabled by default)', () => {
  it('with a valid token: verified first, then stored as usual', async () => {
    const { fetcher, calls } = mockSiteverify(() => ok());
    const response = await post({ ...valid, submission_id: crypto.randomUUID(), [TURNSTILE_FIELD]: 'good-token' }, fetcher);
    expect(response.status).toBe(201);
    expect(calls).toHaveLength(1);
    expect(stored()).toBe(1);
  });

  it.each([
    ['no token', undefined, (): Response | 'throw' => ok(), 400],
    ['a rejected token', 'bad', (): Response | 'throw' => Response.json({ success: false, 'error-codes': ['invalid-input-response'] }), 400],
    ['a replayed token', 'used', (): Response | 'throw' => Response.json({ success: false, 'error-codes': ['timeout-or-duplicate'] }), 400],
    ['another hostname', 'x', (): Response | 'throw' => ok({ hostname: 'evil.example.test' }), 400],
    ['Siteverify unreachable', 'x', (): Response | 'throw' => 'throw', 503],
  ] as const)('%s: refused before any database access', async (_label, token, answer, status) => {
    const { fetcher } = mockSiteverify(answer);
    const body: Record<string, string> = { ...valid, submission_id: crypto.randomUUID() };
    if (token !== undefined) body[TURNSTILE_FIELD] = token;
    const response = await post(body, fetcher);
    expect(response.status).toBe(status);
    expect(dbCalls).toBe(0);
    expect(stored()).toBe(0);
    expect(JSON.stringify(await response.json())).toMatch(/Nothing was stored/);
  });

  it('a no-JS post is refused with phone guidance, before reading the body or the database', async () => {
    const { fetcher, calls } = mockSiteverify(() => ok());
    const response = await post({ ...valid, request_type: 'quotation', _gotcha: '' }, fetcher, 'application/x-www-form-urlencoded');
    expect(response.status).toBe(400);
    const html = await response.text();
    expect(html).toContain('This form needs JavaScript');
    expect(html).toMatch(/call BuildTrack at \d+/);
    expect([calls.length, dbCalls, stored()]).toEqual([0, 0, 0]);
  });

  it('enabled but unconfigured: fails closed (503) and checks nothing', async () => {
    env = { ...env, TURNSTILE_SECRET_KEY: undefined };
    const { fetcher, calls } = mockSiteverify(() => ok());
    expect((await post({ ...valid, submission_id: crypto.randomUUID(), [TURNSTILE_FIELD]: 't' }, fetcher)).status).toBe(503);
    expect([calls.length, dbCalls]).toEqual([0, 0]);
  });

  it('submission idempotency is separate from verification: a retry with the same submission id needs a new token', async () => {
    const submission_id = crypto.randomUUID();
    const used = new Set<string>();
    const { fetcher, calls } = mockSiteverify((form) => {
      const token = form.get('response')!;
      if (used.has(token)) return Response.json({ success: false, 'error-codes': ['timeout-or-duplicate'] });
      used.add(token);
      return ok();
    });
    expect((await post({ ...valid, submission_id, [TURNSTILE_FIELD]: 'first' }, fetcher)).status).toBe(201);
    expect((await post({ ...valid, submission_id, [TURNSTILE_FIELD]: 'first' }, fetcher)).status).toBe(400); // replayed token
    const retry = await post({ ...valid, submission_id, [TURNSTILE_FIELD]: 'second' }, fetcher);
    expect(retry.status).toBe(200); // the identical submission, recognised; nothing new stored
    expect(stored()).toBe(1);
    expect(new Set(calls.map((c) => c.get('idempotency_key'))).size).toBe(3); // one key per verification
  });

  it('with Turnstile off (the default) the field is not part of the contract and nothing is verified', async () => {
    env = { ...env, TURNSTILE_ENABLED: undefined };
    const { fetcher, calls } = mockSiteverify(() => ok());
    expect((await post({ ...valid, submission_id: crypto.randomUUID(), [TURNSTILE_FIELD]: 't' }, fetcher)).status).toBe(400);
    expect((await post({ ...valid, submission_id: crypto.randomUUID() }, fetcher)).status).toBe(201);
    expect(calls).toHaveLength(0);
    expect(parseIntake('js', JSON.stringify({ ...valid, submission_id: crypto.randomUUID(), [TURNSTILE_FIELD]: 't' }))).toEqual({ ok: false });
    expect(maxBodyBytes('js', true)).toBeGreaterThan(maxBodyBytes('js') + 2048 * 12);
  });
});
