// The public Worker's quotation intake (worker/public/*) against the real migration SQL on
// node:sqlite (tests/support/sqlite-d1.ts): SIMULATED D1. No network, no email, no account.
// The same behaviours are exercised on the real local Workers/D1 runtime by `npm run test:worker`.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import worker, { runCleanup } from '../worker/public/index.ts';
import { handleIntake, type IntakeEnv } from '../worker/public/intake.ts';
import { limits } from '../worker/public/store.ts';
import { fieldMaxChars, maxBodyBytes, parseIntake } from '../src/lib/quotation/intake.ts';
import { setLogSink } from '../src/lib/quotation/log.ts';
import { createTestDatabase, type TestDatabase } from './support/sqlite-d1.ts';

const ORIGIN = 'https://buildtrack.example.test';
const NOW = Date.UTC(2026, 9, 16, 9, 30);
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const randomKey = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
const KEY = randomKey();

const valid = {
  service: '',
  plan: 'professional',
  name: '  Test Customer  ',
  email: 'customer@example.test',
  organization: 'Example Builders',
  phone: '0917 000 0000',
  organization_type: 'contractors',
  project_need: 'Tracking cement across two sites',
  message: 'Fictional test request.',
  privacy_ack: 'yes',
};

let db: TestDatabase;
let env: IntakeEnv;
let logLines: string[];

beforeEach(() => {
  db = createTestDatabase();
  // The retained automatic mode (owner notification jobs); manual mode: quotation-manual.test.ts.
  env = { DB: db, WORKFLOW_ENABLED: 'on', PUBLIC_ORIGIN: ORIGIN, INTAKE_HMAC_KEY: KEY, INTAKE_HMAC_KEY_VERSION: '1', EMAIL_MODE: 'resend' };
  logLines = [];
  setLogSink((line) => logLines.push(line));
});
afterEach(() => setLogSink(() => {}));

let ipCounter = 0;
const nextIp = () => {
  ipCounter++;
  return `10.${(ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${ipCounter & 255}`;
};
function post(body: BodyInit, contentType: string, headers: Record<string, string | null> = {}): Request {
  const merged: Record<string, string | null> = {
    'Content-Type': contentType,
    Origin: ORIGIN,
    'Sec-Fetch-Site': 'same-origin',
    'CF-Connecting-IP': nextIp(),
    ...headers,
  };
  return new Request(`${ORIGIN}/api/quotation-requests`, {
    method: 'POST',
    body,
    headers: Object.fromEntries(Object.entries(merged).filter((entry): entry is [string, string] => entry[1] !== null)),
  });
}
const postJson = (data: Record<string, unknown>, headers?: Record<string, string | null>) =>
  post(JSON.stringify(data), 'application/json', headers);
const postNative = (data: Record<string, string>, headers?: Record<string, string | null>) =>
  post(new URLSearchParams(data).toString(), 'application/x-www-form-urlencoded', headers);
const uuid = () => crypto.randomUUID();
const count = (from: string) => (db.raw.prepare(`SELECT COUNT(*) AS n FROM ${from}`).get() as { n: number }).n;
const counterValues = () =>
  (db.raw.prepare('SELECT count FROM client_counters ORDER BY bucket').all() as { count: number }[]).map((row) => row.count);

describe('fails closed', () => {
  it.each([
    ['workflow off', { WORKFLOW_ENABLED: 'off' }],
    ['workflow unset', { WORKFLOW_ENABLED: undefined }],
    ['no public origin', { PUBLIC_ORIGIN: undefined }],
    ['no database', { DB: undefined }],
    ['no intake key', { INTAKE_HMAC_KEY: undefined }],
    ['a key shorter than 32 bytes', { INTAKE_HMAC_KEY: btoa('short key') }],
    ['a key that is not base64', { INTAKE_HMAC_KEY: '***not base64***' }],
    ['no key version', { INTAKE_HMAC_KEY_VERSION: undefined }],
  ])('answers 503 and stores nothing with %s', async (_label, override) => {
    const response = await handleIntake(postJson({ ...valid, submission_id: uuid() }), { ...env, ...override }, NOW);
    expect(response.status).toBe(503);
    expect(count('quote_requests')).toBe(0);
  });
});

describe('request checks', () => {
  it('accepts only POST', async () => {
    expect((await handleIntake(new Request(`${ORIGIN}/api/quotation-requests`), env, NOW)).status).toBe(405);
  });

  it.each([
    ['a missing Origin', { Origin: null }],
    ['Origin "null"', { Origin: 'null' }],
    ['another origin', { Origin: 'https://attacker.example.test' }],
    ['a look-alike origin', { Origin: `${ORIGIN}.attacker.example.test` }],
    ['cross-site fetch metadata', { 'Sec-Fetch-Site': 'cross-site' }],
    ['same-site (not same-origin) metadata', { 'Sec-Fetch-Site': 'same-site' }],
  ])('rejects %s with 403 and explains how to retry', async (_label, headers) => {
    const json = await handleIntake(postJson({ ...valid, submission_id: uuid() }, headers), env, NOW);
    expect(json.status).toBe(403);
    expect((await json.json()).message).toMatch(/did not come from the BuildTrack quotation form/);
    const native = await handleIntake(postNative(valid, headers), env, NOW);
    expect(native.status).toBe(403);
    const html = await native.text();
    expect(html).toContain('href="/contact/quotation/"');
    expect(html).toContain('href="tel:+639510519642"');
    expect(count('quote_requests')).toBe(0);
  });

  it('rejects other content types with 415', async () => {
    expect((await handleIntake(post(JSON.stringify(valid), 'text/plain'), env, NOW)).status).toBe(415);
  });
});

describe('body size', () => {
  const cjk = (field: keyof typeof fieldMaxChars) => '建'.repeat(fieldMaxChars[field]);
  const worstValues = {
    ...valid,
    name: cjk('name'),
    organization: cjk('organization'),
    project_need: cjk('project_need'),
    message: cjk('message'),
    email: `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}`, // 254 characters
    service: 'materials-inventory',
    organization_type: 'real-estate-developers',
  };

  it('derives caps that admit the worst valid native and JSON payloads', async () => {
    const native = new URLSearchParams({ ...worstValues, request_type: 'quotation', _gotcha: '' }).toString();
    expect(native.length).toBeGreaterThan(8192); // The checkpoint-1 cap refused this.
    expect(native.length).toBeLessThanOrEqual(maxBodyBytes('native'));
    expect((await handleIntake(post(native, 'application/x-www-form-urlencoded'), env, NOW)).status).toBe(200);

    // A JSON encoder that escapes every non-ASCII character as \uXXXX.
    const escaped = JSON.stringify({ ...worstValues, submission_id: uuid() }).replace(
      /[^\x20-\x7e]/g,
      (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`,
    );
    expect(escaped.length).toBeLessThanOrEqual(maxBodyBytes('js'));
    expect((await handleIntake(post(escaped, 'application/json'), env, NOW)).status).toBe(201);
    expect((db.raw.prepare("SELECT message FROM quote_requests WHERE source = 'js'").get() as { message: string }).message).toBe(cjk('message'));
  });

  it('counts a CRLF line break once, as the form does, and stores LF', async () => {
    const message = `${'\r\n'.repeat(1000)}${'a'.repeat(1000)}`; // 2000 characters after normalization
    expect((await handleIntake(postNative({ ...valid, message }), env, NOW)).status).toBe(200);
    expect((db.raw.prepare('SELECT message FROM quote_requests').get() as { message: string }).message).not.toContain('\r');
  });

  it('refuses bodies over the cap while streaming, with a useful message', async () => {
    const limit = maxBodyBytes('js');
    const declared = await handleIntake(post('x'.repeat(limit + 1), 'application/json'), env, NOW);
    expect(declared.status).toBe(413);
    expect((await declared.json()).message).toMatch(/larger than any request the form can send/);
    const streamed = new Request(`${ORIGIN}/api/quotation-requests`, {
      method: 'POST',
      body: new ReadableStream({
        start(controller) {
          for (let i = 0; i <= limit / 1000; i++) controller.enqueue(new TextEncoder().encode('x'.repeat(1000)));
          controller.close();
        },
      }),
      // @ts-expect-error Node's fetch needs duplex for a streamed request body.
      duplex: 'half',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    });
    expect((await handleIntake(streamed, env, NOW)).status).toBe(413);
    const nativePage = await handleIntake(post('x'.repeat(maxBodyBytes('native') + 1), 'application/x-www-form-urlencoded'), env, NOW);
    expect(nativePage.status).toBe(413);
    expect(await nativePage.text()).toContain('Shorten your message');
  });

  it('rejects a field longer than its limit even when trimming would shorten it', async () => {
    const response = await handleIntake(postJson({ ...valid, name: `A${' '.repeat(200)}B`, submission_id: uuid() }), env, NOW);
    expect(response.status).toBe(422);
    expect((await response.json()).errors).toEqual({ name: 'Use 100 characters or fewer for your name.' });
  });
});

describe('body contract', () => {
  const sid = '6f1c2a9e-4b7d-4e8a-9c3f-1a2b3c4d5e6f';
  const inner = JSON.stringify({ ...valid, submission_id: sid }).slice(1, -1);
  it.each([
    ['invalid JSON', '{'],
    ['an array', '[]'],
    ['trailing content', `{${inner}} {}`],
    ['a repeated JSON key', `{"name":"First Name",${inner}}`],
    ['a nested value', `{${inner},"phone":{"x":"1"}}`],
    ['a number value', `{${inner.replace('"plan":"professional"', '"plan":3')}}`],
    ['an unknown field', `{${inner},"admin":"yes"}`],
    ['another request type', `{${inner},"request_type":"demo"}`],
    ['a missing submission id', JSON.stringify(valid)],
    ['a malformed submission id', JSON.stringify({ ...valid, submission_id: 'abc' })],
    ['a control character', JSON.stringify({ ...valid, message: 'a\u0007b', submission_id: sid })],
    ['an unpaired surrogate', `{${inner.replace('Fictional', '\\ud800Fictional')}}`],
  ])('rejects %s with 400', async (_label, body) => {
    expect((await handleIntake(post(body, 'application/json'), env, NOW)).status).toBe(400);
    expect(count('quote_requests')).toBe(0);
  });

  it('rejects repeated native fields and a native submission id', async () => {
    const repeated = new URLSearchParams(valid);
    repeated.append('name', 'Second Name');
    expect((await handleIntake(post(repeated.toString(), 'application/x-www-form-urlencoded'), env, NOW)).status).toBe(400);
    expect((await handleIntake(postNative({ ...valid, submission_id: uuid() }), env, NOW)).status).toBe(400);
  });

  it('returns field errors without echoing submitted values', async () => {
    const response = await handleIntake(
      postJson({ ...valid, email: 'not-an-email<script>', plan: 'gold', privacy_ack: '', submission_id: uuid() }),
      env,
      NOW,
    );
    expect(response.status).toBe(422);
    const text = await response.text();
    expect(Object.keys(JSON.parse(text).errors).sort()).toEqual(['email', 'plan', 'privacy_ack']);
    expect(text).not.toContain('not-an-email');
  });

  it('lists native errors on an escaped page', async () => {
    const response = await handleIntake(postNative({ ...valid, name: 'x', email: '"><b>' }), env, NOW);
    expect(response.status).toBe(400);
    const html = await response.text();
    expect(html).toContain('Enter at least 2 characters for your name.');
    expect(html).not.toContain('"><b>');
  });
});

describe('client identity and rate limits', () => {
  it('refuses requests without a usable CF-Connecting-IP instead of sharing one bucket', async () => {
    for (const ip of [null, '', 'unknown', '1.2.3.4, 5.6.7.8', '999.1.1.1']) {
      const response = await handleIntake(postJson({ ...valid, submission_id: uuid() }, { 'CF-Connecting-IP': ip }), env, NOW);
      expect(response.status).toBe(503);
      expect((await response.json()).error).toBe('unidentified');
    }
    expect(count('quote_requests') + count('client_counters')).toBe(0);
  });

  it('limits an IPv6 /64 as one client, and separate /64s separately', async () => {
    const statuses = [];
    for (let i = 1; i <= 6; i++) {
      statuses.push((await handleIntake(postJson({ ...valid, submission_id: uuid() }, { 'CF-Connecting-IP': `2001:db8:1:1::${i}` }), env, NOW + i)).status);
    }
    expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);
    expect((await handleIntake(postJson({ ...valid, submission_id: uuid() }, { 'CF-Connecting-IP': '2001:db8:1:2::1' }), env, NOW)).status).toBe(201);
  });

  it('treats an IPv4-mapped IPv6 address as the IPv4 client', async () => {
    const mapped = { 'CF-Connecting-IP': '::ffff:198.51.100.9' };
    const plain = { 'CF-Connecting-IP': '198.51.100.9' };
    for (let i = 0; i < limits.perHour; i++) await handleIntake(postJson({ ...valid, submission_id: uuid() }, i % 2 ? mapped : plain), env, NOW);
    expect((await handleIntake(postJson({ ...valid, submission_id: uuid() }, mapped), env, NOW)).status).toBe(429);
  });

  it('allows 5 new requests per client per hour and 20 per day; refused requests leave the counters unchanged', async () => {
    const client = { 'CF-Connecting-IP': '198.51.100.7' };
    for (let i = 0; i < limits.perHour; i++) {
      expect((await handleIntake(postJson({ ...valid, submission_id: uuid() }, client), env, NOW + i)).status).toBe(201);
    }
    const refused = await handleIntake(postJson({ ...valid, submission_id: uuid() }, client), env, NOW + 10);
    expect(refused.status).toBe(429);
    expect(refused.headers.get('Retry-After')).toBe('3600');
    expect(counterValues()).toEqual([5, 5]);
    let accepted = limits.perHour;
    for (let hour = 1; hour <= 4; hour++) {
      for (let i = 0; i < limits.perHour; i++) {
        if ((await handleIntake(postJson({ ...valid, submission_id: uuid() }, client), env, NOW + hour * HOUR + i)).status === 201) accepted++;
      }
    }
    expect(accepted).toBe(limits.perDay);
  });

  it('enforces the per-client limit under concurrency', async () => {
    const client = { 'CF-Connecting-IP': '198.51.100.8' };
    const statuses = await Promise.all(
      Array.from({ length: 10 }, () => handleIntake(postJson({ ...valid, submission_id: uuid() }, client), env, NOW).then((r) => r.status)),
    );
    expect(statuses.filter((status) => status === 201)).toHaveLength(limits.perHour);
    expect(statuses.filter((status) => status === 429)).toHaveLength(10 - limits.perHour);
    expect(counterValues()).toEqual([limits.perHour, limits.perHour]);
  });

  it('stores only keyed hashes of client identities, different for each UTC day', async () => {
    const client = { 'CF-Connecting-IP': '198.51.100.23' };
    await handleIntake(postJson({ ...valid, submission_id: uuid() }, client), env, NOW);
    await handleIntake(postJson({ ...valid, submission_id: uuid() }, client), env, NOW + DAY);
    expect(db.raw.prepare('SELECT DISTINCT key_hash FROM client_counters').all()).toHaveLength(2);
    expect(JSON.stringify(db.raw.prepare('SELECT * FROM client_counters').all())).not.toContain('198.51.100.23');
  });
});

describe('global daily cap', () => {
  it('stores at most requestsPerDay new requests per UTC day, also under concurrency', async () => {
    for (let i = 0; i < limits.requestsPerDay - 2; i++) {
      expect((await handleIntake(postJson({ ...valid, submission_id: uuid() }), env, NOW + i)).status).toBe(201);
    }
    const statuses = await Promise.all(
      Array.from({ length: 6 }, () => handleIntake(postJson({ ...valid, submission_id: uuid() }), env, NOW + 1000).then((r) => r.status)),
    );
    expect(statuses.filter((status) => status === 201)).toHaveLength(2);
    expect(statuses.filter((status) => status === 503)).toHaveLength(4);
    expect(count('quote_requests')).toBe(limits.requestsPerDay);
    expect(counterValues().every((value) => value <= 1)).toBe(true); // Losers of the race were refunded.
    const before = count('client_counters');
    const after = await handleIntake(postJson({ ...valid, submission_id: uuid() }), env, NOW + 2000);
    expect(after.status).toBe(503);
    expect((await after.json()).message).toMatch(/most quotation requests it can take today/);
    expect(count('client_counters')).toBe(before); // Refused before any counter write.
    expect((await handleIntake(postJson({ ...valid, submission_id: uuid() }), env, NOW + DAY)).status).toBe(201);
  });

  it('flags requests beyond the notification cap instead of queueing jobs', async () => {
    for (let i = 0; i < limits.notificationsPerDay + 2; i++) {
      await handleIntake(postJson({ ...valid, submission_id: uuid() }), env, NOW + i);
    }
    expect(count('email_jobs')).toBe(limits.notificationsPerDay);
    expect(count('quote_requests WHERE flagged = 1')).toBe(2);
  });
});

describe('idempotency and de-duplication', () => {
  it('answers an identical JSON retry with the same reference without using quota, even at the limit', async () => {
    const client = { 'CF-Connecting-IP': '198.51.100.30' };
    const submission_id = uuid();
    const reference = (await (await handleIntake(postJson({ ...valid, submission_id }, client), env, NOW)).json()).reference;
    for (let i = 0; i < limits.perHour - 1; i++) await handleIntake(postJson({ ...valid, submission_id: uuid() }, client), env, NOW + i);
    expect(counterValues()).toEqual([5, 5]);
    const retry = await handleIntake(postJson({ ...valid, submission_id }, client), env, NOW + 100);
    expect(retry.status).toBe(200);
    expect((await retry.json()).reference).toBe(reference);
    expect(counterValues()).toEqual([5, 5]);
  });

  it('rejects a changed payload under an existing submission id and keeps the original', async () => {
    const submission_id = uuid();
    await handleIntake(postJson({ ...valid, submission_id }), env, NOW);
    const changed = await handleIntake(postJson({ ...valid, phone: '0918 111 1111', submission_id }), env, NOW + 1);
    expect(changed.status).toBe(409);
    const body = await changed.json();
    expect(body.reference).toBeUndefined();
    expect(body.message).toMatch(/already received with different details/);
    expect(db.raw.prepare('SELECT phone FROM quote_requests').all()).toEqual([{ phone: '0917 000 0000' }]);
  });

  it('stores one row for concurrent identical submissions and refunds the losers', async () => {
    const client = { 'CF-Connecting-IP': '198.51.100.31' };
    const submission_id = uuid();
    const replies = await Promise.all(
      Array.from({ length: 8 }, () =>
        handleIntake(postJson({ ...valid, submission_id }, client), env, NOW).then(async (r) => [r.status, (await r.json()).reference] as const),
      ),
    );
    expect(new Set(replies.map(([, reference]) => reference)).size).toBe(1);
    expect(replies.filter(([status]) => status === 201)).toHaveLength(1);
    expect(count('quote_requests')).toBe(1);
    expect(count('email_jobs')).toBe(1);
    expect(counterValues()).toEqual([1, 1]);
  });

  it('treats an identical no-JS resubmission from the same client as a duplicate without revealing the reference', async () => {
    const client = { 'CF-Connecting-IP': '198.51.100.40' };
    expect(await (await handleIntake(postNative(valid, client), env, NOW)).text()).toContain('BT-R-2026-0001');
    const again = await handleIntake(postNative(valid, client), env, NOW + 5 * 60 * 1000);
    expect(again.status).toBe(200);
    const html = await again.text();
    expect(html).toContain('This request was already received');
    expect(html).not.toMatch(/BT-R-\d{4}-\d{4}/);
    expect(count('quote_requests')).toBe(1);
    expect(counterValues()).toEqual([1, 1]);
  });

  it('stores a corrected no-JS request as new, and never matches another client', async () => {
    const client = { 'CF-Connecting-IP': '198.51.100.41' };
    await handleIntake(postNative(valid, client), env, NOW);
    expect(await (await handleIntake(postNative({ ...valid, phone: '0918 222 2222' }, client), env, NOW + 1000)).text()).toContain('BT-R-2026-0002');
    expect(await (await handleIntake(postNative(valid, { 'CF-Connecting-IP': '198.51.100.42' }), env, NOW + 2000)).text()).toContain('BT-R-2026-0003');
    expect(await (await handleIntake(postNative(valid, client), env, NOW + limits.nativeDedupeMs + 1)).text()).toContain('BT-R-2026-0004');
  });

  it('refuses a retry whose stored hash used an older key version, without claiming the details changed', async () => {
    const submission_id = uuid();
    await handleIntake(postJson({ ...valid, submission_id }), env, NOW);
    const rotated = { ...env, INTAKE_HMAC_KEY: randomKey(), INTAKE_HMAC_KEY_VERSION: '2' };
    const retry = await handleIntake(postJson({ ...valid, submission_id }), rotated, NOW + 1);
    expect(retry.status).toBe(409);
    const body = await retry.json();
    expect(body.reference).toBeUndefined();
    expect(body.error).toBe('retry_expired');
    expect(body.message).toMatch(/request checks were updated/);
    expect(body.message).not.toMatch(/different details/);
  });
});

describe('storage', () => {
  it('stores a JSON request trimmed and queues one owner notification in the same batch', async () => {
    const response = await handleIntake(postJson({ ...valid, request_type: 'quotation', submission_id: uuid() }), env, NOW);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ status: 'received', reference: 'BT-R-2026-0001' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    const row = db.raw.prepare('SELECT * FROM quote_requests').get() as Record<string, unknown>;
    expect(row).toMatchObject({ ref: 'BT-R-2026-0001', source: 'js', name: 'Test Customer', hash_key_version: '1', dedupe_key: null, created_at: NOW });
    expect(String(row.payload_hash)).toMatch(/^[0-9a-f]{64}$/);
    expect(db.raw.prepare('SELECT kind, status, attempts, idempotency_key FROM email_jobs').get()).toEqual({
      kind: 'owner_notification',
      status: 'queued',
      attempts: 0,
      idempotency_key: `bt-r-${row.id}-n0`,
    });
  });

  it('numbers new requests sequentially per year', async () => {
    await handleIntake(postJson({ ...valid, submission_id: uuid() }), env, NOW);
    expect((await (await handleIntake(postJson({ ...valid, submission_id: uuid() }), env, NOW + 1)).json()).reference).toBe('BT-R-2026-0002');
    expect((await (await handleIntake(postJson({ ...valid, submission_id: uuid() }), env, Date.UTC(2027, 0, 2))).json()).reference).toBe('BT-R-2027-0001');
  });

  it('treats a filled honeypot as accepted but stores, counts and queues nothing', async () => {
    expect(await (await handleIntake(postJson({ ...valid, _gotcha: 'bot', submission_id: uuid() }), env, NOW)).json()).toEqual({
      status: 'received',
      reference: null,
    });
    expect((await handleIntake(postNative({ ...valid, _gotcha: 'bot' }), env, NOW)).status).toBe(200);
    expect(count('quote_requests') + count('email_jobs') + count('client_counters')).toBe(0);
  });

  it('answers 500 with a generic message when storage fails', async () => {
    db.breakAll();
    const response = await handleIntake(postJson({ ...valid, submission_id: uuid() }), env, NOW);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'server_error' });
  });
});

describe('codex findings (2026-10-16): regressions', () => {
  const formBody = (pairs: string) => post(pairs, 'application/x-www-form-urlencoded');
  const nativeBase = new URLSearchParams(valid).toString();

  it.each([
    ['a malformed escape', `${nativeBase}&message=%ZZ`],
    ['a truncated escape', `${nativeBase}&message=abc%4`],
    ['a lone UTF-8 lead byte', nativeBase.replace('name=', 'name=A%C3B')],
    ['an overlong UTF-8 encoding', nativeBase.replace('name=', 'name=%C0%AFAb')],
    ['a percent-encoded unpaired surrogate', nativeBase.replace('name=', 'name=%ED%A0%80Ab')],
    ['raw non-ASCII in the body', nativeBase.replace('name=', 'name=José')],
    ['a pair without "="', `${nativeBase}&message`],
    ['a duplicate field hidden by encoding', `${nativeBase}&na%6De=Other`],
  ])('rejects a no-JS body with %s before any database access', async (_label, body) => {
    db.breakAll(); // Any database access would now answer 500.
    expect((await handleIntake(formBody(body), env, NOW)).status).toBe(400);
  });

  it('keeps valid percent-encoded Unicode, "+" as space and "%2B" as plus', async () => {
    const body = nativeBase.replace('name=', 'name=%E5%BB%BA+%2B+Jos%C3%A9');
    expect((await handleIntake(formBody(body), env, NOW)).status).toBe(200);
    expect((db.raw.prepare('SELECT name FROM quote_requests').get() as { name: string }).name).toBe('建 + José  Test Customer');
  });

  it('keeps a leading BOM in no-JS field names and values instead of stripping it', () => {
    const parsed = parseIntake('native', nativeBase.replace('name=', 'name=%EF%BB%BFTest'));
    expect(parsed.ok && parsed.intake.values.name).toBe('﻿Test  Test Customer  ');
    expect(parseIntake('js', JSON.stringify({ ...valid, name: '﻿Test', submission_id: uuid() }))).toMatchObject({
      intake: { values: { name: '﻿Test' } },
    });
    const full = `${nativeBase}&request_type=quotation&_gotcha=`;
    expect(parseIntake('native', full).ok).toBe(true);
    for (const field of ['name', 'privacy_ack', 'request_type', '_gotcha']) {
      expect(parseIntake('native', full.replace(`${field}=`, `%EF%BB%BF${field}=`))).toEqual({ ok: false });
    }
  });

  it('rejects a no-JS or JSON body that starts with a BOM before any database access', async () => {
    db.breakAll();
    const bom = [0xef, 0xbb, 0xbf];
    const withBom = (text: string) => new Uint8Array([...bom, ...new TextEncoder().encode(text)]);
    expect((await handleIntake(post(withBom(nativeBase), 'application/x-www-form-urlencoded'), env, NOW)).status).toBe(400);
    expect((await handleIntake(post(withBom(JSON.stringify({ ...valid, submission_id: uuid() })), 'application/json'), env, NOW)).status).toBe(400);
  });

  it.each([['no'], ['false'], ['YES'], ['yes '], ['﻿yes'], ['on'], ['x'.repeat(5000)]])(
    'requires the privacy acknowledgment to be exactly "yes" before any database access (got %s)',
    async (value) => {
      db.breakAll();
      const json = await handleIntake(postJson({ ...valid, privacy_ack: value, submission_id: uuid() }), env, NOW);
      expect(json.status).toBe(422);
      expect(Object.keys((await json.json()).errors)).toEqual(['privacy_ack']);
      expect((await handleIntake(postNative({ ...valid, privacy_ack: value }), env, NOW)).status).toBe(400);
    },
  );

  it('repeats the reference only to the client that submitted it; others get a reference-free acknowledgment', async () => {
    const submission_id = uuid();
    const owner = { 'CF-Connecting-IP': '198.51.100.90' };
    const reference = (await (await handleIntake(postJson({ ...valid, submission_id }, owner), env, NOW)).json()).reference;
    const other = await handleIntake(postJson({ ...valid, submission_id }, { 'CF-Connecting-IP': '198.51.100.91' }), env, NOW + 1);
    expect(other.status).toBe(200);
    expect(await other.json()).toEqual({ status: 'received', reference: null });
    expect(count('quote_requests')).toBe(1);
    expect(count('client_counters')).toBe(2); // Only the original client's day and hour rows: no quota for the other.
    // The same client after the UTC day boundary still gets its reference (identity hash is not per day).
    const nextDay = await handleIntake(postJson({ ...valid, submission_id }, owner), env, NOW + DAY);
    expect((await nextDay.json()).reference).toBe(reference);
    // After a key rotation nobody gets it: the retry cannot be matched (409 retry_expired).
    const rotated = await handleIntake(postJson({ ...valid, submission_id }, owner), { ...env, INTAKE_HMAC_KEY: randomKey(), INTAKE_HMAC_KEY_VERSION: '2' }, NOW + 2);
    expect(rotated.status).toBe(409);
    expect((await rotated.json()).reference).toBeUndefined();
  });

  it('allocates references from a per-year sequence: unique under concurrency, restarting each year, none taken by a failed save', async () => {
    const replies = await Promise.all(
      Array.from({ length: 12 }, (_, i) => handleIntake(postJson({ ...valid, submission_id: uuid() }), env, NOW + i).then((r) => r.json())),
    );
    const references = replies.map((reply) => reply.reference).sort();
    expect(new Set(references).size).toBe(12);
    expect(references[0]).toBe('BT-R-2026-0001');
    expect(references[11]).toBe('BT-R-2026-0012');
    expect((await (await handleIntake(postJson({ ...valid, submission_id: uuid() }), env, Date.UTC(2027, 0, 1, 0, 0, 1))).json()).reference).toBe('BT-R-2027-0001');
    db.raw.exec("CREATE TRIGGER fail_jobs BEFORE INSERT ON email_jobs BEGIN SELECT RAISE(ABORT, 'forced'); END");
    expect((await handleIntake(postJson({ ...valid, submission_id: uuid() }), env, NOW + 100)).status).toBe(500);
    db.raw.exec('DROP TRIGGER fail_jobs');
    expect((await (await handleIntake(postJson({ ...valid, submission_id: uuid() }), env, NOW + 101)).json()).reference).toBe('BT-R-2026-0013');
  });

  it('continues numbering past a large history without depending on it', async () => {
    db.raw.exec(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 18000)
      INSERT INTO quote_requests (id, ref, ref_year, ref_seq, submission_id, payload_hash, client_hash, hash_key_version, source,
        service, plan, name, email, organization, phone, organization_type, project_need, message, privacy_ack_version, created_at, updated_at)
      SELECT 'hist-' || i, 'BT-R-2026-' || printf('%04d', i), 2026, i, 'hist-' || i, 'h', 'c', '1', 'js',
        '', '', 'History', 'h@example.test', 'O', '', 'other', 'history row', '', 'v', ${NOW - 3 * DAY}, ${NOW - 3 * DAY} FROM n`);
    db.raw.prepare('INSERT INTO ref_sequences (year, last_seq) VALUES (2026, 18000)').run();
    expect((await (await handleIntake(postJson({ ...valid, submission_id: uuid() }), env, NOW)).json()).reference).toBe('BT-R-2026-18001');
  });
});

describe('database work on refusals and failures', () => {
  const totalChanges = () => (db.raw.prepare('SELECT total_changes() AS n').get() as { n: number }).n;

  it('writes nothing for a client already at its limit or after the daily cap', async () => {
    const client = { 'CF-Connecting-IP': '198.51.100.70' };
    for (let i = 0; i < limits.perHour; i++) await handleIntake(postJson({ ...valid, submission_id: uuid() }, client), env, NOW + i);
    const before = totalChanges();
    for (let i = 0; i < 20; i++) expect((await handleIntake(postJson({ ...valid, submission_id: uuid() }, client), env, NOW + 100 + i)).status).toBe(429);
    expect(totalChanges()).toBe(before);

    db.raw.prepare('UPDATE intake_daily SET requests = ? WHERE day = ?').run(limits.requestsPerDay, '2026-10-16');
    const atCap = totalChanges();
    for (let i = 0; i < 20; i++) expect((await handleIntake(postJson({ ...valid, submission_id: uuid() }), env, NOW + 200 + i)).status).toBe(503);
    expect(totalChanges()).toBe(atCap);
  });

  it('rolls back the whole batch when a statement fails, so no quota is consumed', async () => {
    db.raw.exec("CREATE TRIGGER fail_jobs BEFORE INSERT ON email_jobs BEGIN SELECT RAISE(ABORT, 'forced'); END");
    const response = await handleIntake(postJson({ ...valid, submission_id: uuid() }, { 'CF-Connecting-IP': '198.51.100.71' }), env, NOW);
    expect(response.status).toBe(500);
    expect(count('quote_requests') + count('email_jobs') + count('client_counters') + count('intake_daily')).toBe(0);
  });

  it('keeps one daily total consistent with stored requests and queued notifications', async () => {
    for (let i = 0; i < limits.notificationsPerDay + 3; i++) await handleIntake(postJson({ ...valid, submission_id: uuid() }), env, NOW + i);
    await handleIntake(postJson({ ...valid, submission_id: uuid() }, { 'CF-Connecting-IP': null }), env, NOW); // refused
    expect(db.raw.prepare('SELECT requests, notifications, cap_reached_at FROM intake_daily').all()).toEqual([
      { requests: limits.notificationsPerDay + 3, notifications: limits.notificationsPerDay, cap_reached_at: null },
    ]);
    expect(count('email_jobs')).toBe(limits.notificationsPerDay);
  });

  it('marks the moment the daily cap is reached exactly once, as the hook for one owner warning', async () => {
    db.raw.prepare('INSERT INTO intake_daily (day, requests, notifications, created_at) VALUES (?, ?, ?, ?)').run('2026-10-16', limits.requestsPerDay - 1, 0, NOW);
    expect((await handleIntake(postJson({ ...valid, submission_id: uuid() }), env, NOW + 5)).status).toBe(201);
    for (let i = 0; i < 5; i++) expect((await handleIntake(postJson({ ...valid, submission_id: uuid() }), env, NOW + 10 + i)).status).toBe(503);
    expect(db.raw.prepare('SELECT requests, cap_reached_at FROM intake_daily').all()).toEqual([{ requests: limits.requestsPerDay, cap_reached_at: NOW + 5 }]);
  });
});

describe('scheduled cleanup', () => {
  it('deletes counters 48 hours after creation, in bounded rounds, and keeps newer ones', async () => {
    const insert = db.raw.prepare('INSERT INTO client_counters (key_hash, bucket, count, created_at) VALUES (?, ?, 1, ?)');
    for (let i = 0; i < 1200; i++) insert.run(`old-${i}`, 'd:2026-10-13', NOW - 49 * HOUR);
    insert.run('recent', 'd:2026-10-15', NOW - 47 * HOUR);
    expect(await runCleanup(env, NOW)).toBe(1200);
    expect(db.raw.prepare('SELECT key_hash FROM client_counters').all()).toEqual([{ key_hash: 'recent' }]);
  });

  it('deletes daily totals 8 days after creation', async () => {
    const insert = db.raw.prepare('INSERT INTO intake_daily (day, requests, notifications, created_at) VALUES (?, 1, 0, ?)');
    insert.run('2026-10-07', NOW - 9 * DAY);
    insert.run('2026-10-10', NOW - 6 * DAY);
    expect(await runCleanup(env, NOW)).toBe(1);
    expect(db.raw.prepare('SELECT day FROM intake_daily').all()).toEqual([{ day: '2026-10-10' }]);
  });

  it('runs from the scheduled handler and logs only a count', async () => {
    db.raw.prepare('INSERT INTO client_counters (key_hash, bucket, count, created_at) VALUES (?, ?, 1, ?)').run('old', 'd:2020-01-01', 0);
    await worker.scheduled({}, { ...env, ASSETS: { fetch: async () => new Response() } });
    expect(count('client_counters')).toBe(0);
    expect(logLines.map((line) => JSON.parse(line))).toContainEqual({ event: 'counters_purged', deleted: 1 });
  });
});

describe('logging and routing', () => {
  it('writes only fixed codes, never submitted values, addresses or the key', async () => {
    await handleIntake(postJson({ ...valid, submission_id: uuid() }, { 'CF-Connecting-IP': '192.0.2.77' }), env, NOW);
    await handleIntake(postNative({ ...valid, email: 'bad' }), env, NOW);
    await handleIntake(postJson({ ...valid, submission_id: uuid() }, { 'CF-Connecting-IP': null }), env, NOW);
    expect(logLines.length).toBeGreaterThan(0);
    const allowedKeys = new Set(['event', 'route', 'status', 'code', 'source', 'deleted']);
    for (const line of logLines) {
      for (const key of Object.keys(JSON.parse(line))) expect(allowedKeys.has(key)).toBe(true);
      for (const secret of ['Test Customer', 'customer@example.test', 'Example Builders', '0917', 'cement', '192.0.2.77', KEY]) {
        expect(line).not.toContain(secret);
      }
    }
  });

  it('answers unknown API paths with 404 and passes everything else to the assets', async () => {
    const workerEnv = { ...env, ASSETS: { fetch: async () => new Response('asset') } };
    expect((await worker.fetch(new Request(`${ORIGIN}/api/owner/requests`), workerEnv)).status).toBe(404);
    expect(await (await worker.fetch(new Request(`${ORIGIN}/contact/`), workerEnv)).text()).toBe('asset');
  });
});
