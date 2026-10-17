// Local end-to-end check of quotation intake on the real Workers runtime: `npm run test:worker`.
//
// 1. Builds a temporary copy of the site with the quotation workflow enabled
//    (tests/browser/fixtures/quotation-enabled.ts) and the Contact form pointed at the synthetic
//    endpoint (fixtures/inquiry-configured.ts). The real config and dist/ are never touched.
// 2. Applies migrations/ to a throwaway local D1 database and runs the public Worker with
//    `wrangler dev --local --test-scheduled` (workerd + local D1; no Cloudflare account) and a
//    random test-only INTAKE_HMAC_KEY generated for this run.
// 3. Drives the API over HTTP and the pages in headless Chromium (CHROME_PATH), with and
//    without JavaScript. Locally, `wrangler dev` sets CF-Connecting-IP to the connecting socket's
//    address (127.0.0.1) when a request has none, and passes a client-sent value through unchanged.
//    This script therefore supplies distinct addresses itself (on HTTP calls, and by rewriting the
//    browser's API requests). Local runs prove nothing about how Cloudflare's edge sets the header.
// 4. Reads the local D1 rows back, runs the scheduled cleanup, and checks the Worker's console
//    output for personal data and the key.
// 5. Runs a second local Worker (tests/worker/d1-cost-worker.ts, test-only) on its own throwaway
//    D1 database to measure D1's own rows_read / rows_written per intake outcome, prints them, and
//    asserts bounds (no writes for refusals; a failed batch leaves nothing behind).
//
// Network isolation, stated precisely:
// - Browser traffic: every request the page makes to anything but the local Worker is blocked
//   and fails the run (including the synthetic form-provider endpoint). This is enforced.
// - Tooling traffic is NOT isolated by this script. Wrangler's metrics are disabled
//   (WRANGLER_SEND_METRICS=false), but Wrangler still checks the npm registry for updates
//   (observed: "update available"), and nothing here blocks other tool traffic. No Cloudflare
//   account or credentials are used (CLOUDFLARE_API_TOKEN/ACCOUNT_ID are removed).
// Nothing is emailed: intake only queues owner-notification rows, and no sender exists.
//
// Requires CHROME_PATH and the pinned wrangler already in the npx cache (e.g. from an earlier
// `npx wrangler@4.147.0 ...`), or WRANGLER_JS pointing at its bin/wrangler.js. It is run
// directly with Node, never fetched from the registry, and is not a project dependency.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { createServer } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'astro';
import { quoteRoute } from '../../src/integrations/quote-route.ts';
import { TEST_ENDPOINT } from '../browser/fixtures/inquiry-configured.ts';

const WRANGLER_VERSION = '4.147.0';
const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));
const posix = (path: string) => path.replaceAll('\\', '/');

const chromePath = process.env.CHROME_PATH;
if (!chromePath || !existsSync(chromePath)) {
  console.error(`CHROME_PATH ${chromePath ? `does not exist: ${chromePath}` : 'is not set'} (docs/ARCHITECTURE.md §8).`);
  process.exit(2);
}

function findWrangler(): string | undefined {
  if (process.env.WRANGLER_JS) return process.env.WRANGLER_JS;
  const cache = join(process.env.LOCALAPPDATA ?? join(homedir(), '.npm'), 'npm-cache', '_npx');
  if (!existsSync(cache)) return undefined;
  for (const entry of readdirSync(cache)) {
    const pkg = join(cache, entry, 'node_modules', 'wrangler', 'package.json');
    if (existsSync(pkg) && JSON.parse(readFileSync(pkg, 'utf8')).version === WRANGLER_VERSION) {
      return join(cache, entry, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
    }
  }
  return undefined;
}
const wranglerJs = findWrangler();
if (!wranglerJs || !existsSync(wranglerJs)) {
  console.error(`wrangler ${WRANGLER_VERSION} is not in the npx cache; set WRANGLER_JS to its bin/wrangler.js.`);
  process.exit(2);
}

const work = mkdtempSync(join(tmpdir(), 'buildtrack-worker-'));
const children: ChildProcess[] = [];
function cleanup() {
  for (const child of children) {
    if (child.pid && child.exitCode === null) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  }
  // Windows may hold files of just-killed processes briefly; a leftover temp folder is only reported.
  try {
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  } catch {
    console.warn(`Could not delete the temporary folder ${work}; it contains only test data.`);
  }
}

// ---- 1. Fixture build -----------------------------------------------------------------
const normalize = (path: string) => path.split('?')[0]!.replaceAll('\\', '/').toLowerCase();
async function buildWithFixtures(name: string, swaps: Record<string, string>): Promise<string> {
  const outDir = join(work, name);
  const targets = Object.entries(swaps).map(([module, fixture]) => ({
    module,
    real: normalize(join(root, 'src', 'config', `${module}.ts`)),
    fixture: join(root, 'tests', 'browser', 'fixtures', fixture),
    redirected: 0,
  }));
  await build({
    root,
    outDir,
    logLevel: 'warn',
    integrations: [quoteRoute()], // the quotation pages are injected only into workflow-enabled builds
    vite: {
      plugins: [
        {
          name: 'buildtrack-config-fixtures',
          enforce: 'pre',
          async resolveId(this: any, source: string, importer: string | undefined, options: object) {
            if (!importer) return null;
            const target = targets.find((t) => new RegExp(`${t.module}(\\.ts)?$`).test(source));
            if (!target || targets.some((t) => normalize(importer) === normalize(t.fixture))) return null;
            const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
            if (!resolved || normalize(resolved.id) !== target.real) return null;
            target.redirected++;
            return target.fixture;
          },
        },
      ],
    },
  });
  for (const t of targets) if (t.redirected === 0) throw new Error(`${t.fixture} was never swapped in for src/config/${t.module}.ts`);
  return outDir;
}
process.on('uncaughtException', (error) => {
  cleanup();
  console.error(error);
  process.exit(1);
});
const siteDir = await buildWithFixtures('site', { quotation: 'quotation-enabled.ts', inquiry: 'inquiry-configured.ts' });

// ---- 2. Local Worker + D1 -------------------------------------------------------------
const port = await new Promise<number>((done) => {
  const server = createServer();
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    server.close(() => done(typeof address === 'object' && address ? address.port : 0));
  });
});
const origin = `http://127.0.0.1:${port}`;
const state = join(work, 'state');
const configPath = join(work, 'wrangler.json');
// Test-only random key for this run (a real deployment sets its own with `wrangler secret put`).
const intakeKey = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
writeFileSync(
  configPath,
  JSON.stringify({
    name: 'buildtrack-workflow-test',
    compatibility_date: '2026-10-04',
    main: posix(join(root, 'worker', 'public', 'index.ts')),
    assets: {
      directory: posix(siteDir),
      binding: 'ASSETS',
      not_found_handling: '404-page',
      html_handling: 'auto-trailing-slash',
      run_worker_first: ['/api/*'],
    },
    d1_databases: [
      {
        binding: 'DB',
        database_name: 'buildtrack-quotes-test',
        database_id: '00000000-0000-4000-8000-000000000000',
        migrations_dir: posix(join(root, 'migrations')),
      },
    ],
    // The retained automatic mode (owner notification jobs are checked); the manual release mode runs in test:worker:e2e.
    vars: { WORKFLOW_ENABLED: 'on', PUBLIC_ORIGIN: origin, INTAKE_HMAC_KEY: intakeKey, INTAKE_HMAC_KEY_VERSION: '1', EMAIL_MODE: 'resend' },
    observability: { enabled: true, logs: { invocation_logs: false } },
  }),
);
const wranglerEnv: Record<string, string | undefined> = { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false', NO_UPDATE_NOTIFIER: '1' };
delete wranglerEnv.CLOUDFLARE_API_TOKEN;
delete wranglerEnv.CLOUDFLARE_ACCOUNT_ID;
function wrangler(args: string[]): string {
  const result = spawnSync(process.execPath, [wranglerJs!, ...args], { env: wranglerEnv, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`wrangler ${args[0]} failed:\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
function query<T>(sql: string): T[] {
  const out = wrangler(['d1', 'execute', 'DB', '--local', '--persist-to', state, '-c', configPath, '--json', '--command', sql]);
  return (JSON.parse(out.slice(out.indexOf('['))) as { results: T[] }[])[0]!.results;
}

let workerOutput = '';
try {
  wrangler(['d1', 'migrations', 'apply', 'DB', '--local', '--persist-to', state, '-c', configPath]);
  const dev = spawn(
    process.execPath,
    [wranglerJs!, 'dev', '--local', '-c', configPath, '--ip', '127.0.0.1', '--port', String(port), '--persist-to', state, '--show-interactive-dev-session=false', '--test-scheduled'],
    { env: wranglerEnv },
  );
  children.push(dev);
  dev.stdout?.on('data', (chunk) => (workerOutput += chunk));
  dev.stderr?.on('data', (chunk) => (workerOutput += chunk));
  for (let i = 0; i < 300; i++) {
    try {
      if ((await fetch(`${origin}/`)).ok) break;
    } catch {}
    await sleep(200);
    if (i === 299) throw new Error(`wrangler dev did not start:\n${workerOutput}`);
  }
} catch (error) {
  cleanup();
  throw error;
}

// ---- 3. Scenarios ---------------------------------------------------------------------
const results: { name: string; ok: boolean; detail?: string }[] = [];
async function scenario(name: string, run: () => Promise<void>) {
  try {
    await run();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, detail: error instanceof Error ? error.message : String(error) });
  }
}
function expectEqual(actual: unknown, expected: unknown, label: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
const REF = /^BT-R-\d{4}-\d{4}$/;
const api = `${origin}/api/quotation-requests`;
const sample = {
  service: '',
  plan: 'starter',
  name: 'TEST Worker Check',
  email: 'worker-check@example.test',
  organization: 'TEST ONLY organization',
  phone: '',
  organization_type: 'other',
  project_need: 'TEST ONLY: local intake check',
  message: '',
  privacy_ack: 'yes',
};
let ipCounter = 0;
/** A fresh documentation-range client address for each call unless one is given. */
const nextIp = () => `198.18.${(++ipCounter >> 8) & 255}.${ipCounter & 255}`;
const postJson = (body: unknown, headers: Record<string, string | null> = {}) =>
  fetch(api, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: Object.fromEntries(
      Object.entries({ 'Content-Type': 'application/json', Origin: origin, 'CF-Connecting-IP': nextIp(), ...headers }).filter(
        (entry): entry is [string, string] => entry[1] !== null,
      ),
    ),
  });
const postNative = (body: Record<string, string>, headers: Record<string, string> = {}) =>
  fetch(api, {
    method: 'POST',
    body: new URLSearchParams(body).toString(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: origin, 'CF-Connecting-IP': nextIp(), ...headers },
  });
const storedCount = () => query<{ n: number }>('SELECT COUNT(*) AS n FROM quote_requests')[0]!.n;
/**
 * Local tooling: opening the dev server's local database from a separate `wrangler d1 execute`
 * process can drop the dev proxy's next forwarded request (observed 2026-10-16). Wrangler's proxy
 * retries GET automatically on a dropped connection, so one GET absorbs it before the next POST.
 * The GET must reach the Worker and get its 405; any other status or a network failure fails the
 * scenario with the cause kept.
 */
const settleAfterDbAccess = async () => {
  let status: number;
  try {
    status = (await fetch(api)).status;
  } catch (error) {
    throw new Error(`routing probe GET failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
  expectEqual(status, 405, 'routing probe GET');
};

let httpReference = '';
await scenario('API: valid JSON is stored with a reference; a retry by the same client returns it unchanged', async () => {
  const submission_id = crypto.randomUUID();
  const client = { 'CF-Connecting-IP': '198.51.100.50' };
  const first = await postJson({ ...sample, submission_id }, client);
  expectEqual(first.status, 201, 'status');
  expectEqual(first.headers.get('cache-control'), 'no-store', 'Cache-Control');
  expectEqual(first.headers.get('x-robots-tag'), 'noindex', 'X-Robots-Tag');
  expectEqual(first.headers.get('access-control-allow-origin'), null, 'no CORS');
  const body = (await first.json()) as { reference: string };
  if (!REF.test(body.reference)) throw new Error(`reference ${body.reference}`);
  httpReference = body.reference;
  const retry = await postJson({ ...sample, submission_id }, client);
  expectEqual(retry.status, 200, 'retry status');
  expectEqual(((await retry.json()) as { reference: string }).reference, httpReference, 'retry reference');
  const otherClient = await postJson({ ...sample, submission_id }, { 'CF-Connecting-IP': '198.51.100.51' });
  expectEqual(await otherClient.json(), { status: 'received', reference: null }, 'another client gets no reference');
});
await scenario('API: wrong or missing Origin, other media types and GET are refused', async () => {
  expectEqual((await postJson({ ...sample, submission_id: crypto.randomUUID() }, { Origin: null })).status, 403, 'no Origin');
  expectEqual((await postJson({ ...sample, submission_id: crypto.randomUUID() }, { Origin: 'https://attacker.example.test' })).status, 403, 'other Origin');
  expectEqual((await fetch(api, { method: 'POST', body: '{}', headers: { 'Content-Type': 'text/plain', Origin: origin } })).status, 415, 'text/plain');
  expectEqual((await fetch(api)).status, 405, 'GET');
});
await scenario('API: invalid values give field errors without echoing them; honeypot stores nothing', async () => {
  const invalid = await postJson({ ...sample, email: 'nope<script>', submission_id: crypto.randomUUID() });
  expectEqual(invalid.status, 422, 'status');
  const text = await invalid.text();
  if (text.includes('nope')) throw new Error('submitted value echoed');
  expectEqual(Object.keys((JSON.parse(text) as { errors: object }).errors), ['email'], 'error fields');
  const trap = await postJson({ ...sample, _gotcha: 'bot', submission_id: crypto.randomUUID() });
  expectEqual(await trap.json(), { status: 'received', reference: null }, 'honeypot reply');
});
await scenario('API: unknown /api paths are 404; pages are still static assets', async () => {
  const unknown = await fetch(`${origin}/api/owner/requests`);
  expectEqual(unknown.status, 404, 'unknown api');
  expectEqual(unknown.headers.get('cache-control'), 'no-store', 'no-store');
  const home = await fetch(`${origin}/`);
  expectEqual(home.status, 200, 'home');
  if (!(await home.text()).includes('<title>BuildTrack')) throw new Error('home is not the static page');
});
await scenario('API: an unusable CF-Connecting-IP value is refused and nothing is stored or counted', async () => {
  // A missing header cannot be produced here (wrangler dev fills it in); the unit tests cover it.
  const before = storedCount();
  for (const value of ['unknown', '1.2.3.4, 5.6.7.8']) {
    const response = await postJson({ ...sample, submission_id: crypto.randomUUID() }, { 'CF-Connecting-IP': value });
    expectEqual(response.status, 503, `status for ${value}`);
    expectEqual(((await response.json()) as { error: string }).error, 'unidentified', 'error');
  }
  expectEqual(storedCount(), before, 'rows');
});
await scenario('API: repeated JSON keys are refused', async () => {
  const body = `{"name":"First Name",${JSON.stringify({ ...sample, submission_id: crypto.randomUUID() }).slice(1)}`;
  const response = await fetch(api, { method: 'POST', body, headers: { 'Content-Type': 'application/json', Origin: origin, 'CF-Connecting-IP': nextIp() } });
  expectEqual(response.status, 400, 'status');
});
await scenario('API: a leading BOM is kept, never stripped into a valid field name, acknowledgment or body', async () => {
  const json = await postJson({ ...sample, privacy_ack: '﻿yes', submission_id: crypto.randomUUID() });
  expectEqual(json.status, 422, 'JSON BOM+yes');
  expectEqual(Object.keys(((await json.json()) as { errors: object }).errors), ['privacy_ack'], 'JSON error fields');
  expectEqual((await postNative({ ...sample, privacy_ack: '﻿yes' })).status, 400, 'native BOM+yes');
  const native = new URLSearchParams(sample).toString();
  const raw = (body: BodyInit, type: string) =>
    fetch(api, { method: 'POST', body, headers: { 'Content-Type': type, Origin: origin, 'CF-Connecting-IP': nextIp() } }).then((r) => r.status);
  expectEqual(await raw(native.replace('name=', '%EF%BB%BFname='), 'application/x-www-form-urlencoded'), 400, 'native BOM field name');
  const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
  const withBom = (text: string) => new Uint8Array([...bom, ...new TextEncoder().encode(text)]);
  expectEqual(await raw(withBom(native), 'application/x-www-form-urlencoded'), 400, 'native body BOM');
  expectEqual(await raw(withBom(JSON.stringify({ ...sample, submission_id: crypto.randomUUID() })), 'application/json'), 400, 'JSON body BOM');
});
await scenario('API: the worst-case valid no-JS payload (larger than the old 8 KB cap) is accepted', async () => {
  const worst = {
    ...sample,
    name: '建'.repeat(100),
    organization: '建'.repeat(150),
    project_need: '建'.repeat(200),
    message: '建'.repeat(2000),
    request_type: 'quotation',
    _gotcha: '',
  };
  const encoded = new URLSearchParams(worst).toString();
  if (encoded.length <= 8192) throw new Error('payload not larger than the old cap');
  const accepted = await postNative(worst);
  expectEqual(accepted.status, 200, `native ${encoded.length} bytes`);
});
await scenario('API: a changed payload under a used submission id gets 409 and no reference', async () => {
  const submission_id = crypto.randomUUID();
  expectEqual((await postJson({ ...sample, submission_id })).status, 201, 'first');
  const changed = await postJson({ ...sample, phone: '0918 000 0000', submission_id });
  expectEqual(changed.status, 409, 'changed');
  expectEqual(((await changed.json()) as { reference?: string }).reference, undefined, 'no reference');
});
await scenario('API: 10 concurrent identical retries store one row and use one quota slot', async () => {
  const client = { 'CF-Connecting-IP': '198.51.100.60' };
  const submission_id = crypto.randomUUID();
  const replies = await Promise.all(
    Array.from({ length: 10 }, () => postJson({ ...sample, submission_id }, client).then(async (r) => [r.status, ((await r.json()) as { reference: string }).reference])),
  );
  expectEqual(new Set(replies.map(([, reference]) => reference)).size, 1, 'one reference');
  expectEqual(replies.filter(([status]) => status === 201).length, 1, 'one created');
  expectEqual(query<{ n: number }>(`SELECT COUNT(*) AS n FROM quote_requests WHERE submission_id = '${submission_id}'`)[0]!.n, 1, 'rows');
  // Only one slot was used: four more fresh requests fit in the hour, the fifth does not.
  const fresh = [];
  for (let i = 0; i < 5; i++) fresh.push((await postJson({ ...sample, submission_id: crypto.randomUUID() }, client)).status);
  expectEqual(fresh, [201, 201, 201, 201, 429], 'remaining quota');
});
await scenario('API: the per-client limit holds under concurrency, and an IPv6 /64 counts as one client', async () => {
  const burst = await Promise.all(
    Array.from({ length: 10 }, () => postJson({ ...sample, submission_id: crypto.randomUUID() }, { 'CF-Connecting-IP': '198.51.100.61' }).then((r) => r.status)),
  );
  expectEqual([burst.filter((s) => s === 201).length, burst.filter((s) => s === 429).length], [5, 5], 'concurrent burst');
  const v6 = [];
  for (let i = 1; i <= 6; i++) v6.push((await postJson({ ...sample, submission_id: crypto.randomUUID() }, { 'CF-Connecting-IP': `2001:db8:5:6::${i}` })).status);
  expectEqual(v6, [201, 201, 201, 201, 201, 429], 'one /64');
  expectEqual((await postJson({ ...sample, submission_id: crypto.randomUUID() }, { 'CF-Connecting-IP': '2001:db8:5:7::1' })).status, 201, 'next /64');
});
await scenario('API: corrected no-JS requests are stored; identical ones are recognized without revealing the reference', async () => {
  const client = { 'CF-Connecting-IP': '198.51.100.62' };
  const first = await (await postNative(sample, client)).text();
  if (!/BT-R-\d{4}-\d{4}/.test(first)) throw new Error('first reference missing');
  const again = await (await postNative(sample, client)).text();
  if (!again.includes('This request was already received') || /BT-R-\d{4}-\d{4}/.test(again)) throw new Error('duplicate page wrong');
  const corrected = await (await postNative({ ...sample, phone: '0918 333 3333' }, client)).text();
  if (!/BT-R-\d{4}-\d{4}/.test(corrected)) throw new Error('corrected request not stored');
  const otherClient = await (await postNative(sample)).text();
  if (!/BT-R-\d{4}-\d{4}/.test(otherClient)) throw new Error('another client was matched');
});
await scenario('API: an origin refusal explains how to retry and how to call', async () => {
  const html = await (await postNative(sample, { Origin: 'null' })).text();
  for (const part of ['did not come from the BuildTrack quotation form', 'href="/contact/quotation/"', 'href="tel:+639510519642"']) {
    if (!html.includes(part)) throw new Error(`missing ${part}`);
  }
});
await scenario('Build: every quotation CTA points to /contact/quotation/; no ?type=quotation remains', async () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? files(join(dir, name)) : name.endsWith('.html') ? [join(dir, name)] : []));
  const html = files(siteDir).map((file) => readFileSync(file, 'utf8')).join('\n');
  if (html.includes('type=quotation')) throw new Error('a ?type=quotation link remains');
  for (const href of ['/contact/quotation/?plan=professional', '/contact/quotation/?service=', 'href="/contact/quotation/"']) {
    if (!html.includes(href)) throw new Error(`missing ${href}`);
  }
});

// ---- 4. Chromium over CDP -------------------------------------------------------------
const profile = join(work, 'profile');
const chrome = spawn(chromePath, ['--headless', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], {
  stdio: 'ignore',
});
children.push(chrome);
let cdpPort: string | undefined;
for (let i = 0; i < 100 && !cdpPort; i++) {
  const file = join(profile, 'DevToolsActivePort');
  if (existsSync(file)) cdpPort = readFileSync(file, 'utf8').split('\n')[0]?.trim() || undefined;
  if (!cdpPort) await sleep(100);
}
if (!cdpPort) throw new Error('Chromium did not start');
let wsUrl: string | undefined;
for (let i = 0; i < 50 && !wsUrl; i++) {
  const targets = (await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
  wsUrl = targets.find((target) => target.type === 'page')?.webSocketDebuggerUrl;
  if (!wsUrl) await sleep(100);
}
const ws = new WebSocket(wsUrl!);
await new Promise((done) => ws.addEventListener('open', done));
let nextId = 0;
const pending = new Map<number, (message: any) => void>();
const listeners: ((message: any) => void)[] = [];
ws.addEventListener('message', (event) => {
  const message = JSON.parse(String(event.data));
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)!(message);
    pending.delete(message.id);
  } else listeners.forEach((listener) => listener(message));
});
const send = (method: string, params: object = {}) =>
  new Promise<any>((done, fail) => {
    const id = ++nextId;
    pending.set(id, (m) => (m.error ? fail(new Error(`${method}: ${m.error.message}`)) : done(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
async function evaluate<T = unknown>(expression: string): Promise<T> {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(`eval failed: ${JSON.stringify(result.exceptionDetails).slice(0, 300)}`);
  return result.result.value as T;
}
async function waitFor(check: () => Promise<boolean>, label: string, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      if (await check()) return;
    } catch {}
    await sleep(50);
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

// Request guard: the local Worker only. API POST bodies are recorded; the Formspree-style
// synthetic endpoint and every other origin are blocked.
const blocked: string[] = [];
const apiBodies: string[] = [];
const BROWSER_IP = '198.51.100.99';
listeners.push((message) => {
  if (message.method !== 'Fetch.requestPaused') return;
  const { requestId, request } = message.params;
  if (request.url.startsWith(`${origin}/`)) {
    if (request.url.startsWith(api) && request.method === 'POST') {
      apiBodies.push(request.postData ?? '');
      // Stand in for Cloudflare's edge, which `wrangler dev` does not emulate.
      const headers = Object.entries({ ...request.headers, 'CF-Connecting-IP': BROWSER_IP }).map(([name, value]) => ({ name, value: String(value) }));
      void send('Fetch.continueRequest', { requestId, headers });
      return;
    }
    void send('Fetch.continueRequest', { requestId });
    return;
  }
  blocked.push(`${request.method} ${request.url}`);
  void send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' });
});
await send('Page.enable');
await send('Runtime.enable');
await send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });

async function open(path: string, { js = true, width = 1280, fontSize = 16 } = {}) {
  await send('Emulation.setScriptExecutionDisabled', { value: !js });
  await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 800 });
  await send('Page.setFontSizes', { fontSizes: { standard: fontSize, fixed: Math.round(fontSize * 0.8125) } });
  await send('Page.navigate', { url: origin + path });
  await waitFor(() => evaluate<boolean>(`document.readyState === 'complete' && location.href !== 'about:blank'`), `load ${path}`);
}
const fill = (values: Record<string, string>) =>
  evaluate(`(() => {
    const form = document.querySelector('[data-inquiry-form]');
    for (const [name, value] of Object.entries(${JSON.stringify(values)})) form.elements.namedItem(name).value = value;
    const ack = form.querySelector('#inquiry-privacy_ack'); if (!ack.checked) ack.click();
  })()`);
const browserSample = {
  name: 'TEST Browser Check',
  email: 'browser-check@example.test',
  organization: 'TEST ONLY browser organization',
  organization_type: 'other',
  project_need: 'TEST ONLY: browser intake check',
};

let jsReference = '';
await scenario('Quotation page (JS): preselection, approved privacy wording, JSON submit and reference', async () => {
  apiBodies.length = 0;
  await open('/contact/quotation/?service=custom-integration&plan=enterprise&type=demo');
  expectEqual(await evaluate(`document.querySelector('#inquiry-service').value`), 'custom-integration', 'service');
  expectEqual(await evaluate(`document.querySelector('#inquiry-plan').value`), 'enterprise', 'plan');
  expectEqual(await evaluate(`document.querySelectorAll('input[type=radio][name=request_type]').length`), 0, 'no type radios');
  expectEqual(await evaluate(`document.querySelector('[data-inquiry-form]').getAttribute('action')`), '/api/quotation-requests', 'action');
  // The owner approved the wording on 2026-10-17: it is shown, and the draft marker is gone.
  const privacyText = await evaluate<string>(`document.querySelector('[data-field=privacy_ack]').textContent`);
  if (privacyText.includes('Draft privacy wording pending review')) throw new Error('draft marker still shown');
  if (!privacyText.includes('automatic database backups may keep a copy for up to 7 more days')) throw new Error('approved privacy wording missing');
  expectEqual((await evaluate<string>(`document.querySelector('[data-submit-label]').textContent`)).trim(), 'Send quotation request', 'label');
  await fill(browserSample);
  await evaluate(`document.querySelector('[data-inquiry-form]').requestSubmit()`);
  await waitFor(() => evaluate<boolean>(`document.querySelector('[data-confirmation]').checkVisibility()`), 'confirmation');
  jsReference = await evaluate<string>(`document.querySelector('[data-confirm-reference]').textContent`);
  if (!REF.test(jsReference)) throw new Error(`reference ${jsReference}`);
  expectEqual(await evaluate(`document.activeElement === document.querySelector('[data-confirmation-heading]')`), true, 'focus');
  expectEqual(apiBodies.length, 1, 'one API request');
  const sent = JSON.parse(apiBodies[0]!) as Record<string, string>;
  expectEqual(sent.request_type, 'quotation', 'request type');
  if (!/^[0-9a-f-]{36}$/.test(sent.submission_id ?? '')) throw new Error('no submission id');
  if ('subject' in sent) throw new Error('Formspree subject sent to the Worker');
});

let nativeReference = '';
await scenario('Quotation page (no JS): native POST stores the request and shows the reference', async () => {
  await open('/contact/quotation/', { js: false });
  await fill({ ...browserSample, name: 'TEST Native Check', email: 'native-check@example.test' });
  await evaluate(`document.querySelector('[data-submit]').click()`);
  await waitFor(() => evaluate<boolean>(`location.pathname === '/api/quotation-requests' && !!document.querySelector('h1')`), 'result page');
  expectEqual(await evaluate(`document.querySelector('h1').textContent`), 'Quotation request received', 'heading');
  nativeReference = await evaluate<string>(`document.querySelector('.ref').textContent`);
  if (!REF.test(nativeReference)) throw new Error(`reference ${nativeReference}`);
});
await scenario('Quotation page (no JS): server validation page lists errors without echoing values', async () => {
  await open('/contact/quotation/', { js: false });
  await fill({ ...browserSample, name: 'x', project_need: 'TEST' });
  await evaluate(`document.querySelector('[data-submit]').click()`);
  await waitFor(() => evaluate<boolean>(`location.pathname === '/api/quotation-requests' && !!document.querySelector('h1')`), 'error page');
  expectEqual(await evaluate(`document.querySelector('h1').textContent`), 'Please fix the following', 'heading');
  const items = await evaluate<string[]>(`[...document.querySelectorAll('li')].map((li) => li.textContent)`);
  expectEqual(items, ['Enter at least 2 characters for your name.', 'Enter at least 5 characters for your project need.'], 'errors');
  if ((await evaluate<string>(`document.body.textContent`)).includes('TEST ONLY browser organization')) throw new Error('value echoed');
});
await scenario('Contact (workflow on): demo and service only, a quotation link card, no quotation option', async () => {
  await open('/contact/', { js: false });
  expectEqual(await evaluate(`[...document.querySelectorAll('input[name=request_type]')].map((i) => i.value)`), ['demo', 'service'], 'types');
  expectEqual(await evaluate(`document.querySelector('.quotation-card a').getAttribute('href')`), '/contact/quotation/', 'card link');
  expectEqual(await evaluate(`document.querySelector('[data-inquiry-form]').getAttribute('action')`), TEST_ENDPOINT, 'Contact still posts to the form provider');
  expectEqual(await evaluate(`document.querySelector('.quotation-card').checkVisibility()`), true, 'card visible without JS');
});
await scenario('Contact (workflow on): legacy quotation links redirect with only allowlisted values', async () => {
  for (const [path, expected] of [
    ['/contact/?type=quotation&service=custom-integration&plan=enterprise', '/contact/quotation/?service=custom-integration&plan=enterprise'],
    ['/contact/?service=custom-integration&evil=%3Cb%3E', '/contact/quotation/?service=custom-integration'],
    ['/contact/?type=quotation&plan=bogus', '/contact/quotation/'],
  ] as const) {
    await open(path);
    await waitFor(() => evaluate<boolean>(`location.pathname === '/contact/quotation/' && document.readyState === 'complete'`), `redirect ${path}`);
    expectEqual(await evaluate(`location.pathname + location.search`), expected, path);
  }
  await open('/contact/?type=demo');
  expectEqual(await evaluate(`location.pathname`), '/contact/', 'demo stays');
  expectEqual(await evaluate(`document.querySelector('input[name=request_type][value=demo]').checked`), true, 'demo preselected');
});

await scenario('Layout: quotation page and Contact fit 390 px, and 320 px with 32 px default text', async () => {
  for (const [width, fontSize] of [
    [390, 16],
    [320, 32],
  ] as const) {
    for (const path of ['/contact/quotation/', '/contact/']) {
      await open(path, { js: true, width, fontSize });
      const overflow = await evaluate<number>(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
      expectEqual(overflow, 0, `${path} horizontal overflow at ${width}px/${fontSize}px`);
    }
  }
});

// Optional screenshots for human visual review (EVIDENCE_DIR); never committed.
const evidence = process.env.EVIDENCE_DIR;
if (evidence) {
  await scenario('Evidence screenshots', async () => {
    mkdirSync(evidence, { recursive: true });
    const shot = async (name: string, path: string, options: { js?: boolean; width?: number; fontSize?: number }) => {
      await open(path, options);
      const { contentSize } = await send('Page.getLayoutMetrics');
      const { data } = await send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
        clip: { x: 0, y: 0, width: options.width ?? 1280, height: Math.ceil(contentSize.height), scale: 1 },
      });
      writeFileSync(join(evidence, `${name}.png`), Buffer.from(data, 'base64'));
    };
    await shot('quotation-1440', '/contact/quotation/?plan=professional', { width: 1440 });
    await shot('quotation-390', '/contact/quotation/?plan=professional', { width: 390 });
    await shot('quotation-320-32px', '/contact/quotation/', { width: 320, fontSize: 32 });
    await shot('contact-workflow-on-1440', '/contact/', { width: 1440 });
    await shot('contact-workflow-on-390', '/contact/', { width: 390 });
    await open('/contact/quotation/', { js: false, width: 1440 });
    await fill({ ...browserSample, name: 'x' });
    await evaluate(`document.querySelector('[data-submit]').click()`);
    await waitFor(() => evaluate<boolean>(`location.pathname === '/api/quotation-requests'`), 'error page');
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(evidence, 'native-errors-1440.png'), Buffer.from(data, 'base64'));
  });
}

// ---- 5. Stored rows, cleanup, global cap and Worker output -------------------------------
await scenario('Local D1: browser and API requests are stored; every unflagged request has exactly one untouched queued job', async () => {
  const rows = query<{ ref: string; source: string; name: string }>(
    `SELECT ref, source, name FROM quote_requests WHERE ref IN ('${httpReference}', '${jsReference}', '${nativeReference}') ORDER BY ref_seq`,
  );
  expectEqual(
    rows.map((row) => [row.ref, row.source, row.name]),
    [
      [httpReference, 'js', 'TEST Worker Check'],
      [jsReference, 'js', 'TEST Browser Check'],
      [nativeReference, 'native', 'TEST Native Check'],
    ],
    'rows',
  );
  const wrong = query<{ n: number }>(
    'SELECT COUNT(*) AS n FROM quote_requests r WHERE (SELECT COUNT(*) FROM email_jobs j WHERE j.request_id = r.id) <> (1 - r.flagged)',
  )[0]!.n;
  expectEqual(wrong, 0, 'requests without exactly one job (or flagged with one)');
  const touched = query<{ n: number }>("SELECT COUNT(*) AS n FROM email_jobs WHERE status <> 'queued' OR attempts <> 0 OR first_attempt_at IS NOT NULL")[0]!.n;
  expectEqual(touched, 0, 'jobs ever attempted');
  const addresses = JSON.stringify(query('SELECT * FROM client_counters')) + JSON.stringify(query('SELECT * FROM quote_requests'));
  if (/198\.(18|51)\.|2001:db8/.test(addresses)) throw new Error('a client address is stored');
});
await scenario('Scheduled cleanup (real runtime): counters older than 48 hours are deleted, newer ones kept', async () => {
  const now = Date.now();
  query(
    `INSERT INTO client_counters (key_hash, bucket, count, created_at) VALUES ('review-old-1', 'd:2000-01-01', 1, ${now - 49 * 3600 * 1000}), ('review-old-2', 'h:2000-01-01T00', 1, ${now - 72 * 3600 * 1000}), ('review-recent', 'd:2000-01-02', 1, ${now - 47 * 3600 * 1000})`,
  );
  let status = 0;
  for (let attempt = 0; attempt < 3 && status !== 200; attempt++) {
    try {
      status = (await fetch(`${origin}/cdn-cgi/handler/scheduled?cron=${encodeURIComponent('17 * * * *')}`)).status;
    } catch {
      await sleep(500); // A transient local-proxy connection error; the trigger is idempotent.
    }
  }
  expectEqual(status, 200, 'scheduled trigger');
  await waitFor(async () => workerOutput.includes('"event":"counters_purged"'), 'cleanup log line');
  const left = query<{ key_hash: string }>("SELECT key_hash FROM client_counters WHERE key_hash LIKE 'review-%' ORDER BY key_hash").map((row) => row.key_hash);
  expectEqual(left, ['review-recent'], 'remaining test rows');
});
await scenario('Global daily cap (real runtime): concurrent requests at the boundary never exceed it', async () => {
  const cap = 200;
  const remaining = cap - query<{ n: number }>(`SELECT COUNT(*) AS n FROM quote_requests WHERE created_at >= ${Date.now() - (Date.now() % 86400000)}`)[0]!.n;
  if (remaining < 1) throw new Error('cap already reached before the test');
  await settleAfterDbAccess();
  const statuses = await Promise.all(
    Array.from({ length: remaining + 4 }, () => postJson({ ...sample, submission_id: crypto.randomUUID() }).then((r) => r.status)),
  );
  expectEqual([statuses.filter((s) => s === 201).length, statuses.filter((s) => s === 503).length], [remaining, 4], 'created / refused');
  const refused = await postJson({ ...sample, submission_id: crypto.randomUUID() });
  expectEqual(refused.status, 503, 'after the cap');
  if (!((await refused.json()) as { message: string }).message.includes('try again tomorrow')) throw new Error('no capacity guidance');
  expectEqual(query<{ n: number }>(`SELECT COUNT(*) AS n FROM quote_requests WHERE created_at >= ${Date.now() - (Date.now() % 86400000)}`)[0]!.n, cap, 'stored today');
  await settleAfterDbAccess();
});
await scenario('API (last request): an oversize body streamed without Content-Length gets a useful 413', async () => {
  // Streamed without Content-Length. The Worker answers 413 before the body ends; wrangler's local
  // dev proxy then fails the next request it forwards ("Error inside ProxyWorker ... Network
  // connection lost"; observed 2026-10-16, local tooling, not the Worker, no E_INTAKE logged).
  // This is therefore the last request this script sends to the Worker.
  const tooLarge = await new Promise<{ status: number; body: string }>((done, fail) => {
    const request = httpRequest(api, {
      method: 'POST',
      agent: false,
      headers: { 'Content-Type': 'application/json', Origin: origin, 'CF-Connecting-IP': nextIp(), 'Transfer-Encoding': 'chunked' },
    });
    request.on('response', (response) => {
      let body = '';
      response.on('data', (chunk) => (body += chunk));
      response.on('end', () => done({ status: response.statusCode ?? 0, body }));
    });
    request.on('error', fail);
    for (let i = 0; i < 40; i++) request.write('x'.repeat(1000));
    request.end();
  });
  expectEqual(tooLarge.status, 413, 'streamed 40 KB');
  if (!(JSON.parse(tooLarge.body) as { message: string }).message.includes('Shorten your message')) throw new Error('no size guidance');
});
// ---- 6. Measured D1 cost per outcome (separate local Worker and database) ----------------
const costPort = await new Promise<number>((done) => {
  const server = createServer();
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    server.close(() => done(typeof address === 'object' && address ? address.port : 0));
  });
});
const costOrigin = `http://127.0.0.1:${costPort}`;
const costState = join(work, 'cost-state');
const costConfig = join(work, 'wrangler-cost.json');
writeFileSync(
  costConfig,
  JSON.stringify({
    name: 'buildtrack-cost-test',
    compatibility_date: '2026-10-04',
    main: posix(join(root, 'tests', 'worker', 'd1-cost-worker.ts')),
    d1_databases: [
      { binding: 'DB', database_name: 'buildtrack-cost-test', database_id: '00000000-0000-4000-8000-000000000001', migrations_dir: posix(join(root, 'migrations')) },
    ],
    vars: { WORKFLOW_ENABLED: 'on', PUBLIC_ORIGIN: costOrigin, INTAKE_HMAC_KEY: intakeKey, INTAKE_HMAC_KEY_VERSION: '1', EMAIL_MODE: 'resend' },
  }),
);
const costQuery = <T>(sql: string): T[] => {
  const out = wrangler(['d1', 'execute', 'DB', '--local', '--persist-to', costState, '-c', costConfig, '--json', '--command', sql]);
  return (JSON.parse(out.slice(out.indexOf('['))) as { results: T[] }[])[0]!.results;
};
wrangler(['d1', 'migrations', 'apply', 'DB', '--local', '--persist-to', costState, '-c', costConfig]);
let costOutput = '';
let costDev: ChildProcess | undefined;
/** (Re)starts the cost Worker. Schema changes are made only while it is stopped: altering the local
 * database from another process under a running dev server broke its next request. */
async function startCostDev() {
  costDev = spawn(
    process.execPath,
    [wranglerJs!, 'dev', '--local', '-c', costConfig, '--ip', '127.0.0.1', '--port', String(costPort), '--persist-to', costState, '--show-interactive-dev-session=false'],
    { env: wranglerEnv },
  );
  children.push(costDev);
  costDev.stdout?.on('data', (chunk) => (costOutput += chunk));
  costDev.stderr?.on('data', (chunk) => (costOutput += chunk));
  for (let i = 0; i < 300; i++) {
    try {
      await fetch(`${costOrigin}/`);
      return;
    } catch {}
    await sleep(200);
  }
  throw new Error('cost Worker did not start');
}
function stopCostDev() {
  if (costDev?.pid) spawnSync('taskkill', ['/pid', String(costDev.pid), '/T', '/F'], { stdio: 'ignore' });
}
await startCostDev();
type Cost = { status: number; read: number; written: number; statements: number };
const measured: Record<string, Cost> = {};
async function costOf(label: string, body: Record<string, string>, ip: string): Promise<Cost> {
  const response = await fetch(`${costOrigin}/api/quotation-requests`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', Origin: costOrigin, 'CF-Connecting-IP': ip },
  });
  await response.text();
  const cost = { status: response.status, ...(JSON.parse(response.headers.get('X-D1-Cost') ?? '{}') as Omit<Cost, 'status'>) };
  measured[label] = cost;
  return cost;
}
await scenario('D1 cost (real runtime): accepted, retry and refusals are bounded; refusals write nothing', async () => {
  const accepted = await costOf('accepted (new request)', { ...sample, submission_id: crypto.randomUUID() }, '198.51.100.80');
  expectEqual(accepted.status, 201, 'accepted');
  if (accepted.written > 40 || accepted.read > 40) throw new Error(`accepted cost ${JSON.stringify(accepted)}`);
  const submission_id = crypto.randomUUID();
  await costOf('setup', { ...sample, submission_id }, '198.51.100.81');
  const retry = await costOf('identical JSON retry', { ...sample, submission_id }, '198.51.100.81');
  expectEqual([retry.status, retry.written], [200, 0], 'retry status / writes');
  if (retry.read > 2) throw new Error(`retry reads ${retry.read}`);
  for (let i = 0; i < 4; i++) await costOf('setup', { ...sample, submission_id: crypto.randomUUID() }, '198.51.100.81');
  const limited = await costOf('refused: client at its limit', { ...sample, submission_id: crypto.randomUUID() }, '198.51.100.81');
  expectEqual([limited.status, limited.written], [429, 0], 'client-limited status / writes');
  if (limited.read > 5) throw new Error(`client-limited reads ${limited.read}`);
  const invalid = await costOf('refused: validation', { ...sample, email: 'x', submission_id: crypto.randomUUID() }, '198.51.100.82');
  expectEqual([invalid.status, invalid.read, invalid.written], [422, 0, 0], 'validation');
  costQuery(`UPDATE intake_daily SET requests = 200 WHERE day = '${new Date().toISOString().slice(0, 10)}'`);
  const capped = await costOf('refused: daily cap reached', { ...sample, submission_id: crypto.randomUUID() }, '198.51.100.83');
  expectEqual([capped.status, capped.written], [503, 0], 'cap status / writes');
  if (capped.read > 5) throw new Error(`cap reads ${capped.read}`);
});
await scenario('D1 cost (real runtime): an accepted request costs the same with 18,000 earlier requests', async () => {
  const empty = measured['accepted (new request)']!;
  stopCostDev();
  await sleep(1000);
  const year = new Date().getUTCFullYear();
  const old = Date.now() - 3 * 86400000;
  costQuery(`UPDATE intake_daily SET requests = 0 WHERE day = '${new Date().toISOString().slice(0, 10)}'`); // undo the cap test
  costQuery(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 18000)
    INSERT INTO quote_requests (id, ref, ref_year, ref_seq, submission_id, payload_hash, client_hash, hash_key_version, source,
      service, plan, name, email, organization, phone, organization_type, project_need, message, privacy_ack_version, created_at, updated_at)
    SELECT 'hist-' || i, 'BT-R-${year}-H' || i, ${year} - 1, i, 'hist-' || i, 'h', 'c', '1', 'js',
      '', '', 'History', 'h@example.test', 'O', '', 'other', 'history row', '', 'v', ${old}, ${old} FROM n`);
  costQuery(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 18000)
    INSERT INTO quote_requests (id, ref, ref_year, ref_seq, submission_id, payload_hash, client_hash, hash_key_version, source,
      service, plan, name, email, organization, phone, organization_type, project_need, message, privacy_ack_version, created_at, updated_at)
    SELECT 'hist2-' || i, 'BT-R-${year}-G' || i, ${year}, 100000 + i, 'hist2-' || i, 'h', 'c', '1', 'js',
      '', '', 'History', 'h@example.test', 'O', '', 'other', 'history row', '', 'v', ${old}, ${old} FROM n`);
  await startCostDev();
  const populated = await costOf('accepted with 36,000 earlier requests', { ...sample, submission_id: crypto.randomUUID() }, '198.51.100.85');
  expectEqual(populated.status, 201, 'accepted');
  if (Math.abs(populated.read - empty.read) > 2 || Math.abs(populated.written - empty.written) > 2) {
    throw new Error(`cost grew with history: empty ${JSON.stringify(empty)}, populated ${JSON.stringify(populated)}`);
  }
});
await scenario('D1 cost (real runtime): race compensation writes only when concurrent requests defeat the pre-check', async () => {
  const submission_id = crypto.randomUUID();
  const identical = await Promise.all(
    Array.from({ length: 6 }, (_, i) => costOf(`race-identical-${i}`, { ...sample, submission_id }, '198.51.100.86')),
  );
  expectEqual(identical.filter((cost) => cost.status === 201).length, 1, 'one created');
  expectEqual(costQuery<{ n: number }>(`SELECT COUNT(*) AS n FROM quote_requests WHERE submission_id = '${submission_id}'`)[0]!.n, 1, 'stored once');
  const burst = await Promise.all(
    Array.from({ length: 10 }, (_, i) => costOf(`race-limit-${i}`, { ...sample, submission_id: crypto.randomUUID() }, '198.51.100.87')),
  );
  expectEqual([burst.filter((c) => c.status === 201).length, burst.filter((c) => c.status === 429).length], [5, 5], 'limit under concurrency');
  const losers = [...identical.filter((c) => c.status !== 201), ...burst.filter((c) => c.status !== 201)];
  measured['race loser: no batch (pre-check refused)'] = losers.filter((c) => c.statements <= 2).sort((a, b) => b.written - a.written)[0] ?? losers[0]!;
  const compensated = losers.filter((c) => c.statements > 2).sort((a, b) => b.written - a.written)[0];
  if (compensated) measured['race loser: batch with compensation (max)'] = compensated;
  for (const loser of losers.filter((c) => c.statements <= 2)) expectEqual(loser.written, 0, 'pre-check refusal writes');
});
await scenario('Atomicity (real runtime): a failing statement rolls back quota, request and job together', async () => {
  stopCostDev();
  await sleep(1000);
  costQuery(`UPDATE intake_daily SET requests = 0 WHERE day = '${new Date().toISOString().slice(0, 10)}'`);
  costQuery("CREATE TRIGGER review_fail_jobs BEFORE INSERT ON email_jobs BEGIN SELECT RAISE(ABORT, 'forced'); END");
  await startCostDev();
  const before = costQuery<{ requests: number; counters: number; daily: number }>(
    "SELECT (SELECT COUNT(*) FROM quote_requests) AS requests, (SELECT COALESCE(SUM(count), 0) FROM client_counters) AS counters, (SELECT COALESCE(SUM(requests), 0) FROM intake_daily) AS daily",
  )[0];
  const failed = await costOf('failed save (forced job-insert failure)', { ...sample, submission_id: crypto.randomUUID() }, '198.51.100.84');
  expectEqual(failed.status, 500, 'status');
  const after = costQuery<{ requests: number; counters: number; daily: number }>(
    "SELECT (SELECT COUNT(*) FROM quote_requests) AS requests, (SELECT COALESCE(SUM(count), 0) FROM client_counters) AS counters, (SELECT COALESCE(SUM(requests), 0) FROM intake_daily) AS daily",
  )[0];
  expectEqual(after, before, 'rows, counters and daily total unchanged');
});
console.log('Measured D1 cost per outcome (local runtime; D1 rows_read / rows_written):');
for (const [label, cost] of Object.entries(measured)) {
  if (label !== 'setup' && !label.startsWith('race-')) console.log(`  ${label.padEnd(42)} status ${cost.status}  read ${cost.read}  written ${cost.written}  statements ${cost.statements}`);
}

await scenario('Browser made no request outside the local Worker', async () => {
  expectEqual(blocked, [], 'blocked requests');
});
await scenario('Worker output contains no submitted personal data', async () => {
  for (const value of ['TEST Worker Check', 'TEST Browser Check', 'TEST Native Check', 'example.test', 'TEST ONLY', '198.18.', '198.51.100.', '2001:db8', intakeKey]) {
    if (workerOutput.includes(value)) throw new Error(`worker output contains ${value}`);
  }
  if (!workerOutput.includes('"event":"intake_received"')) throw new Error('expected intake log lines are missing');
});

ws.close();
cleanup();
if (results.some((result) => !result.ok)) {
  // The Worker logs only fixed codes (checked above), so its output is safe to show for diagnosis.
  console.log('--- Worker output (last 40 lines) ---');
  console.log(workerOutput.split('\n').slice(-40).join('\n'));
  console.log('--- Cost Worker output (last 25 lines) ---');
  console.log(costOutput.split('\n').slice(-25).join('\n'));
}
for (const result of results) console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.name}${result.detail ? `\n      ${result.detail}` : ''}`);
const failed = results.filter((result) => !result.ok).length;
console.log(`\n${results.length - failed}/${results.length} quotation intake checks passed.`);
process.exit(failed ? 1 : 0);
