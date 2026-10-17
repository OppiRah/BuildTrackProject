// Local check of the owner Worker on the real Workers runtime and local D1: `npm run test:worker:owner`.
//
// 1. Applies migrations/ to a throwaway local D1 database and seeds fictional requests with SQL.
// 2. Runs the real owner handler through the test-only wrapper tests/worker/owner-test-worker.ts
//    under `wrangler dev --local` (workerd + local D1; no Cloudflare account), with Access
//    signing keys, OWNER_FORM_KEY and QUOTE_LINK_KEY_V1 generated for this run only.
// 3. Drives it over HTTP and in headless Chromium (CHROME_PATH) with native form posts.
// 4. Reads D1 back only while the dev server is stopped (opening the local database from another
//    process under a running dev server can drop its next request; recorded in PROPOSAL §18).
// 5. Runs the deployable entry (worker/owner/index.ts) with the committed local config
//    wrangler.owner.local.jsonc and checks that it refuses everything (503).
//
// Network: browser requests to anything but the local Worker are blocked and fail the run. The
// owner code makes no outbound request here (the wrapper supplies the keys). Tooling traffic
// (Wrangler's update check) is not isolated by this script; metrics are disabled and no
// Cloudflare credentials are used. Nothing is emailed: there is no sender.
//
// Requires CHROME_PATH and wrangler 4.147.0 in the npx cache (or WRANGLER_JS), as test:worker.

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createTestAccess, TEST_AUD, TEST_OWNER, TEST_TEAM } from '../support/access-jwt.ts';

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
    if (existsSync(pkg) && JSON.parse(readFileSync(pkg, 'utf8')).version === WRANGLER_VERSION) return join(cache, entry, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  }
  return undefined;
}
const wranglerJs = findWrangler();
if (!wranglerJs || !existsSync(wranglerJs)) {
  console.error(`wrangler ${WRANGLER_VERSION} is not in the npx cache; set WRANGLER_JS to its bin/wrangler.js.`);
  process.exit(2);
}

const work = mkdtempSync(join(tmpdir(), 'buildtrack-owner-'));
const children: ChildProcess[] = [];
const kill = (child: ChildProcess | undefined) => {
  if (child?.pid && child.exitCode === null) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
};
function cleanup() {
  children.forEach(kill);
  try {
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  } catch {
    console.warn(`Could not delete the temporary folder ${work}; it contains only test data.`);
  }
}
const freePort = () =>
  new Promise<number>((done) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => done(typeof address === 'object' && address ? address.port : 0));
    });
  });

// ---- 1. Database and configuration ---------------------------------------------------
const port = await freePort();
const origin = `http://127.0.0.1:${port}`;
const state = join(work, 'state');
const configPath = join(work, 'wrangler.json');
const random32 = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
const access = await createTestAccess();
const linkKey = random32();
const d1 = { binding: 'DB', database_name: 'buildtrack-owner-test', database_id: '00000000-0000-4000-8000-000000000002', migrations_dir: posix(join(root, 'migrations')) };
writeFileSync(
  configPath,
  JSON.stringify({
    name: 'buildtrack-owner-test',
    compatibility_date: '2026-10-04',
    main: posix(join(root, 'tests', 'worker', 'owner-test-worker.ts')),
    d1_databases: [d1],
    vars: {
      WORKFLOW_ENABLED: 'on',
      OWNER_ORIGIN: origin,
      OWNER_EMAIL: TEST_OWNER,
      ACCESS_TEAM_DOMAIN: TEST_TEAM,
      ACCESS_AUD: TEST_AUD,
      OWNER_FORM_KEY: random32(),
      QUOTE_LINK_KEY_CURRENT: '1',
      QUOTE_LINK_KEY_V1: linkKey,
      TEST_ACCESS_JWKS: JSON.stringify({ keys: [access.publicJwk] }),
      // Email runs use the wrapper's in-memory mock provider; nothing is sent anywhere.
      // The retained automatic mode (mock provider); the manual release mode runs in test:worker:e2e.
      EMAIL_MODE: 'resend',
      SENDING_ENABLED: 'on',
      MAIL_FROM: 'BuildTrack <quotes@mail.example.test>',
      PUBLIC_ORIGIN: origin,
    },
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
const dump = () =>
  JSON.stringify(['quote_requests', 'quotes', 'quote_events', 'email_jobs', 'used_form_tokens', 'quote_ref_sequences'].map((table) => query(`SELECT * FROM ${table} ORDER BY rowid`)));

const now = Date.now();
const requests = ['Browser', 'Concurrent', 'Stale', 'Csrf'].map((label, i) => ({
  id: crypto.randomUUID(),
  ref: `BT-R-2026-${String(9001 + i)}`,
  name: `TEST ${label} Customer`,
  email: `${label.toLowerCase()}-owner-check@example.test`,
}));
let devOutput = '';
let dev: ChildProcess | undefined;
async function startDev(extraArgs: string[] = []) {
  dev = spawn(
    process.execPath,
    [wranglerJs!, 'dev', '--local', '-c', configPath, '--ip', '127.0.0.1', '--port', String(port), '--persist-to', state, '--show-interactive-dev-session=false', '--test-scheduled', ...extraArgs],
    { env: wranglerEnv },
  );
  children.push(dev);
  dev.stdout?.on('data', (chunk) => (devOutput += chunk));
  dev.stderr?.on('data', (chunk) => (devOutput += chunk));
  for (let i = 0; i < 300; i++) {
    try {
      await fetch(`${origin}/`);
      return;
    } catch {}
    await sleep(200);
  }
  throw new Error(`wrangler dev did not start:\n${devOutput}`);
}
async function stopDev() {
  kill(dev);
  await sleep(1000);
}
try {
  wrangler(['d1', 'migrations', 'apply', 'DB', '--local', '--persist-to', state, '-c', configPath]);
  query(
    `INSERT INTO quote_requests (id, ref, ref_year, ref_seq, submission_id, payload_hash, client_hash, hash_key_version, source, service, plan,
       name, email, organization, phone, organization_type, project_need, message, privacy_ack_version, created_at, updated_at) VALUES ` +
      requests
        .map(
          (r, i) =>
            `('${r.id}', '${r.ref}', 2026, ${9001 + i}, '${crypto.randomUUID()}', 'h', 'c', '1', 'js', '', 'professional', '${r.name}', '${r.email}', 'TEST ONLY organization', '', 'other', 'TEST ONLY: owner check', '', 'v', ${now + i}, ${now + i})`,
        )
        .join(', '),
  );
  // One owner notification (as intake queues it) and today's cap reached, for the email run.
  query(
    `INSERT INTO email_jobs (id, kind, request_id, resend_seq, idempotency_key, status, next_attempt_at, created_at, updated_at)
     VALUES ('${crypto.randomUUID()}', 'owner_notification', '${requests[3]!.id}', 0, 'bt-r-${requests[3]!.id}-n0', 'queued', ${now}, ${now}, ${now})`,
  );
  query(`INSERT INTO intake_daily (day, requests, notifications, cap_reached_at, created_at) VALUES ('${new Date(now).toISOString().slice(0, 10)}', 200, 1, ${now}, ${now})`);
  await startDev();
} catch (error) {
  cleanup();
  throw error;
}

// ---- 2. Scenarios ---------------------------------------------------------------------
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
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
const jwt = await access.sign({ exp: Math.floor(Date.now() / 1000) + 3600 });
const get = (path: string, token: string | null = jwt) => fetch(origin + path, { headers: token ? { 'Cf-Access-Jwt-Assertion': token } : {}, redirect: 'manual' });
const post = (path: string, fields: Record<string, string>, headers: Record<string, string> = {}) =>
  fetch(origin + path, {
    method: 'POST',
    redirect: 'manual',
    body: new URLSearchParams(fields).toString(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: origin, 'Cf-Access-Jwt-Assertion': jwt, ...headers },
  });
const tokenIn = (html: string) => /name="form_token" value="([^"]+)"/.exec(html)?.[1] ?? '';
const versionIn = (html: string) => /name="version" value="(\d+)"/.exec(html)?.[1] ?? '';
const draft = { scope: 'TEST ONLY: scope for the local owner check.', amount: '7,990', validity_days: '14' };
async function draftAndConfirm(id: string) {
  const detail = await (await get(`/requests/${id}`)).text();
  const saved = await post(`/requests/${id}/draft`, { form_token: tokenIn(detail), version: versionIn(detail), ...draft });
  expectEqual(saved.status, 303, 'draft saved');
  const confirm = await (await get(`/requests/${id}/confirm`)).text();
  return { form_token: tokenIn(confirm), version: versionIn(confirm) };
}

await scenario('Access: no JWT, a forged JWT and another email get 404 on every path', async () => {
  const forged = await (await createTestAccess(access.kid)).sign();
  const other = await access.sign({ email: 'intruder@example.test' });
  for (const path of ['/', `/requests/${requests[0]!.id}`, `/requests/${requests[0]!.id}/confirm`, '/nope']) {
    for (const token of [null, 'x.y.z', forged, other]) expectEqual((await get(path, token)).status, 404, `${path} ${token ? 'bad token' : 'no token'}`);
  }
  expectEqual((await post(`/requests/${requests[0]!.id}/approve`, { form_token: 'x', version: '1' }, { 'Cf-Access-Jwt-Assertion': forged })).status, 404, 'forged POST');
});
await scenario('Pages: list and request are served with no-store, no framing, a self-only CSP and no CORS', async () => {
  const list = await get('/');
  expectEqual(list.status, 200, 'list');
  const html = await list.text();
  for (const r of requests) if (!html.includes(r.ref)) throw new Error(`list misses ${r.ref}`);
  expectEqual([list.headers.get('cache-control'), list.headers.get('x-frame-options'), list.headers.get('access-control-allow-origin')], ['no-store', 'DENY', null], 'headers');
  if (!list.headers.get('content-security-policy')?.includes("form-action 'self'")) throw new Error('CSP');
  expectEqual((await get(`/requests/${requests[0]!.id}/approve`)).status, 405, 'GET on an action');
});

// Browser (native forms, no JS): draft, confirmation, Cancel, approve.
const profile = join(work, 'profile');
const chrome = spawn(chromePath, ['--headless', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
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
  let last: unknown;
  while (Date.now() - start < timeout) {
    try {
      if (await check()) return;
    } catch (error) {
      last = error; // A navigation can destroy the evaluation context; retried until the timeout.
    }
    await sleep(50);
  }
  throw new Error(`Timed out waiting for: ${label}${last ? ` (last error: ${last instanceof Error ? last.message : String(last)})` : ''}`);
}
// Request guard: only the local Worker; every request gets the test Access JWT (Access's role).
const blocked: string[] = [];
const browserPosts: { url: string; origin: string | undefined }[] = [];
listeners.push((message) => {
  if (message.method !== 'Fetch.requestPaused') return;
  const { requestId, request } = message.params;
  if (!request.url.startsWith(`${origin}/`)) {
    blocked.push(`${request.method} ${request.url}`);
    void send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' });
    return;
  }
  if (request.method === 'POST') browserPosts.push({ url: request.url, origin: request.headers.Origin });
  const headers = Object.entries({ ...request.headers, 'Cf-Access-Jwt-Assertion': jwt }).map(([name, value]) => ({ name, value: String(value) }));
  void send('Fetch.continueRequest', { requestId, headers });
});
await send('Page.enable');
await send('Runtime.enable');
await send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
await send('Emulation.setScriptExecutionDisabled', { value: true }); // owner pages use no script
async function open(path: string, width = 1280, fontSize = 16) {
  await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 800 });
  await send('Page.setFontSizes', { fontSizes: { standard: fontSize, fixed: Math.round(fontSize * 0.8125) } });
  await send('Page.navigate', { url: origin + path });
  await waitFor(() => evaluate<boolean>(`document.readyState === 'complete' && location.pathname === ${JSON.stringify(path.split('?')[0])}`), `load ${path}`);
}
// Script execution is disabled for the page, but CDP evaluation still works (as in test:worker).
const submitAndWait = async (selector: string, path: string) => {
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  try {
    await waitFor(() => evaluate<boolean>(`location.pathname === ${JSON.stringify(path)} && document.readyState === 'complete' && !!document.querySelector('h1')`), `arrive at ${path}`);
  } catch (error) {
    const where = await evaluate<string>(`location.pathname + ' | ' + (document.querySelector('h1')?.textContent ?? document.body?.textContent?.slice(0, 200))`).catch(() => '?');
    throw new Error(`${error instanceof Error ? error.message : String(error)}; at ${where}`);
  }
};
const browserRequest = requests[0]!;

await scenario('Browser: draft form posts natively with the owner Origin and lands on the confirmation page', async () => {
  await open(`/requests/${browserRequest.id}`);
  expectEqual(await evaluate(`document.querySelector('#amount').value`), '7990', 'prefilled amount');
  await evaluate(`(() => { document.querySelector('#scope').value = ${JSON.stringify(draft.scope)}; document.querySelector('#amount').value = '8,500.25'; })()`);
  browserPosts.length = 0;
  await submitAndWait('form button[type=submit]', `/requests/${browserRequest.id}/confirm`);
  expectEqual(browserPosts, [{ url: `${origin}/requests/${browserRequest.id}/draft`, origin }], 'one POST with the owner Origin');
  const text = await evaluate<string>(`document.querySelector('main').textContent`);
  for (const part of [browserRequest.name, browserRequest.email, draft.scope, '₱8,500.25', '14 days after approval', 'no email is sent']) {
    if (!text.includes(part)) throw new Error(`confirmation misses ${part}`);
  }
});
await scenario('Browser: Cancel on the confirmation page sends nothing and returns to the draft', async () => {
  browserPosts.length = 0;
  await evaluate(`[...document.querySelectorAll('a')].find((a) => a.textContent.startsWith('Cancel')).click()`);
  await waitFor(() => evaluate<boolean>(`location.pathname === ${JSON.stringify(`/requests/${browserRequest.id}`)} && !!document.querySelector('#scope')`), 'back to draft');
  expectEqual(browserPosts.length, 0, 'POSTs');
  expectEqual(await evaluate(`document.querySelector('#amount').value`), '8,500.25', 'saved amount shown');
});
await scenario('Browser: keyboard reaches every draft control with a visible focus outline', async () => {
  const stops: string[] = [];
  await evaluate(`document.activeElement?.blur(); window.scrollTo(0, 0)`);
  for (let i = 0; i < 12; i++) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    const stop = await evaluate<{ id: string; outline: string }>(
      `(() => { const el = document.activeElement; return { id: el.id || el.tagName + ':' + (el.textContent || '').trim().slice(0, 40), outline: getComputedStyle(el).outlineStyle }; })()`,
    );
    if (stop.id.startsWith('BODY')) continue; // focus leaving the page between cycles
    stops.push(stop.id);
    if (stop.outline === 'none') throw new Error(`no focus outline on ${stop.id}`);
  }
  for (const id of ['scope', 'amount', 'validity_days', 'BUTTON:Save draft and review']) if (!stops.includes(id)) throw new Error(`Tab never reached ${id}: ${stops.join(', ')}`);
});
await scenario('Browser: approving from the confirmation page queues the email job and says nothing was sent', async () => {
  await open(`/requests/${browserRequest.id}/confirm`);
  browserPosts.length = 0;
  await submitAndWait('form button[type=submit]', `/requests/${browserRequest.id}`);
  expectEqual(browserPosts.map((p) => p.origin), [origin], 'POST Origin');
  const text = await evaluate<string>(`document.querySelector('main').textContent`);
  for (const part of ['approved', 'No email has been sent', 'queued']) if (!text.includes(part)) throw new Error(`result page misses ${part}`);
  expectEqual(await evaluate(`document.querySelectorAll('form').length`), 0, 'no forms after approval');
});
await scenario('Browser: owner pages fit 390 px, and 320 px with 32 px default text', async () => {
  for (const [width, font] of [
    [390, 16],
    [320, 32],
  ] as const) {
    for (const path of ['/', `/requests/${requests[1]!.id}`, `/requests/${browserRequest.id}`]) {
      await open(path, width, font);
      expectEqual(await evaluate(`document.documentElement.scrollWidth - document.documentElement.clientWidth`), 0, `${path} overflow at ${width}/${font}`);
    }
  }
});

const concurrent = requests[1]!;
await scenario('HTTP: two concurrent approvals from separate confirmation pages — one succeeds, one changes nothing', async () => {
  const first = await draftAndConfirm(concurrent.id);
  const second = { form_token: tokenIn(await (await get(`/requests/${concurrent.id}/confirm`)).text()), version: first.version };
  const statuses = await Promise.all([first, second].map((fields) => post(`/requests/${concurrent.id}/approve`, fields).then((r) => r.status)));
  expectEqual(statuses.sort(), [303, 409], 'statuses');
  expectEqual((await post(`/requests/${concurrent.id}/approve`, first)).status, 409, 'replayed token');
});
const stale = requests[2]!;
await scenario('HTTP: a confirmation page made stale by a later save cannot approve', async () => {
  const old = await draftAndConfirm(stale.id);
  const detail = await (await get(`/requests/${stale.id}`)).text();
  expectEqual((await post(`/requests/${stale.id}/draft`, { form_token: tokenIn(detail), version: versionIn(detail), ...draft, amount: '9000' })).status, 303, 'second save');
  expectEqual((await post(`/requests/${stale.id}/approve`, old)).status, 409, 'stale approve');
});
const csrf = requests[3]!;
await scenario('HTTP: cross-site, wrong-type and malformed posts are refused', async () => {
  const fields = await draftAndConfirm(csrf.id);
  for (const [label, headers, status] of [
    ['no Origin', { Origin: '' }, 403],
    ['other Origin', { Origin: 'https://attacker.example.test' }, 403],
    ['cross-site metadata', { 'Sec-Fetch-Site': 'cross-site' }, 403],
    ['text/plain', { 'Content-Type': 'text/plain' }, 415],
  ] as const) {
    expectEqual((await post(`/requests/${csrf.id}/approve`, fields, headers as Record<string, string>)).status, status, label);
  }
  expectEqual((await post(`/requests/${csrf.id}/approve`, { ...fields, extra: 'x' })).status, 400, 'extra field');
});

// ---- 3. Database checks (dev server stopped) -----------------------------------------
await stopDev();
await scenario('D1: one approval each, one queued quotation job per approved quote, nothing sent, stale and refused quotes untouched', async () => {
  const quotes = query<{ request_id: string; status: string; version: number; amount_centavos: number; token_hash: string | null; snap_email: string | null }>(
    'SELECT request_id, status, version, amount_centavos, token_hash, snap_email FROM quotes',
  );
  const byRequest = Object.fromEntries(quotes.map((q) => [q.request_id, q]));
  expectEqual([byRequest[browserRequest.id]?.status, byRequest[concurrent.id]?.status, byRequest[stale.id]?.status, byRequest[csrf.id]?.status], ['approved', 'approved', 'draft', 'draft'], 'statuses');
  expectEqual(byRequest[browserRequest.id]?.amount_centavos, 850025, 'browser amount');
  expectEqual(byRequest[browserRequest.id]?.snap_email, browserRequest.email, 'snapshot recipient');
  if (!/^[0-9a-f]{64}$/.test(byRequest[concurrent.id]?.token_hash ?? '')) throw new Error('no link hash');
  const jobs = query<{ request_id: string; status: string; attempts: number; idempotency_key: string }>("SELECT request_id, status, attempts, idempotency_key FROM email_jobs WHERE kind = 'quotation' ORDER BY request_id");
  expectEqual(jobs.map((j) => j.request_id).sort(), [browserRequest.id, concurrent.id].sort(), 'one job per approved quote');
  expectEqual(jobs.map((j) => [j.status, j.attempts]), [['queued', 0], ['queued', 0]], 'jobs only queued');
  expectEqual(query<{ n: number }>("SELECT COUNT(*) AS n FROM quote_events WHERE event = 'approved'")[0]!.n, 2, 'approval events');
});
let beforeGets = '';
await scenario('Read-only GETs (real runtime): every page and action URL changes no rows', async () => {
  beforeGets = dump();
  await startDev();
  for (const r of requests) for (const path of [`/requests/${r.id}`, `/requests/${r.id}/confirm`, `/requests/${r.id}/draft`, `/requests/${r.id}/approve`]) await get(path);
  await get('/');
  await stopDev();
  expectEqual(dump() === beforeGets, true, 'database unchanged');
});

await scenario('Email run (real runtime, mock provider): concurrent scheduled runs send each due job once; links rebuild to the approved hashes', async () => {
  await startDev();
  const trigger = () => fetch(`${origin}/cdn-cgi/handler/scheduled?cron=${encodeURIComponent('*/5 * * * *')}`).then((r) => r.status);
  const statuses = await Promise.all([trigger(), trigger()]);
  let report: { calls: { key: string; to: string }[]; inbox: { key: string; to: string; linkHash: string | null }[] } = { calls: [], inbox: [] };
  for (let i = 0; i < 50 && report.inbox.length < 4; i++) {
    report = await (await fetch(`${origin}/__test/provider`)).json();
    if (report.inbox.length < 4) await sleep(200);
  }
  expectEqual(await trigger(), 200, 'third run'); // nothing due any more
  report = await (await fetch(`${origin}/__test/provider`)).json();
  await stopDev();
  expectEqual(statuses, [200, 200], 'scheduled triggers');
  const jobs = query<{ kind: string; status: string; attempts: number; has_id: number; to_address: string; quote_id: string | null }>(
    'SELECT kind, status, attempts, provider_message_id IS NOT NULL AS has_id, to_address, quote_id FROM email_jobs ORDER BY kind, idempotency_key',
  );
  expectEqual(jobs.map((j) => [j.kind, j.status, j.attempts, j.has_id]), [
    ['owner_cap_warning', 'provider_accepted', 1, 1],
    ['owner_notification', 'provider_accepted', 1, 1],
    ['quotation', 'provider_accepted', 1, 1],
    ['quotation', 'provider_accepted', 1, 1],
  ], 'jobs');
  expectEqual(report.calls.length, 4, 'provider calls (one per job)');
  expectEqual(new Set(report.calls.map((c) => c.key)).size, 4, 'distinct keys');
  const quotes = query<{ token_hash: string; status: string; snap_email: string }>("SELECT token_hash, status, snap_email FROM quotes WHERE token_hash IS NOT NULL");
  expectEqual(quotes.map((q) => q.status), ['emailed', 'emailed'], 'quotes accepted by the provider');
  expectEqual(
    report.inbox.filter((m) => m.linkHash).map((m) => m.linkHash).sort(),
    quotes.map((q) => q.token_hash).sort(),
    'rebuilt links match the approved hashes',
  );
  expectEqual(jobs.filter((j) => j.kind === 'quotation').map((j) => j.to_address).sort(), quotes.map((q) => q.snap_email).sort(), 'quotation recipients');
  expectEqual(jobs.filter((j) => j.kind !== 'quotation').map((j) => j.to_address), [TEST_OWNER, TEST_OWNER], 'owner emails go to the owner');
  // Attempt history on real D1: one attempt per job, provider call marked, accepted; codes only.
  const attempts = query<{ attempt: number; called: number; outcome: string }>(
    'SELECT attempt, provider_called_at IS NOT NULL AS called, outcome FROM email_attempts ORDER BY job_id',
  );
  expectEqual(attempts.map((a) => [a.attempt, a.called, a.outcome]), Array(4).fill([1, 1, 'OK_ACCEPTED']), 'attempt records');
  // Retention follows the job: deleting a job deletes its attempts (trigger).
  query("DELETE FROM email_jobs WHERE kind = 'owner_cap_warning'");
  expectEqual(query<{ n: number }>('SELECT COUNT(*) AS n FROM email_attempts')[0]!.n, 3, 'attempts after deleting one job');
});

await scenario('Lifecycle (real D1): revoke, new link, delete and dismiss through the owner pages', async () => {
  // A request without a quotation, for "dismiss" (inserted while the server is stopped).
  const plainId = crypto.randomUUID();
  query(
    `INSERT INTO quote_requests (id, ref, ref_year, ref_seq, submission_id, payload_hash, client_hash, hash_key_version, source, service, plan,
       name, email, organization, phone, organization_type, project_need, message, privacy_ack_version, created_at, updated_at, last_activity_at)
     VALUES ('${plainId}', 'BT-R-2026-9100', 2026, 9100, '${crypto.randomUUID()}', 'h', 'c', '1', 'js', '', 'starter', 'TEST Plain', 'plain@example.test',
       'TEST ONLY organization', '', 'other', 'TEST ONLY: owner check', '', 'v', ${now}, ${now}, ${now})`,
  );
  await startDev();
  const act = async (id: string, kind: string) => {
    const page = await (await get(`/requests/${id}/${kind}`)).text();
    return post(`/requests/${id}/${kind}`, { form_token: tokenIn(page), version: versionIn(page) });
  };
  const revoked = await act(concurrent.id, 'revoke');
  const replaced = await act(concurrent.id, 'new-link');
  const removed = await act(stale.id, 'delete');
  const dismissed = await act(plainId, 'dismiss');
  await stopDev();
  expectEqual([revoked.status, replaced.status, removed.status, dismissed.status], [303, 303, 303, 303], 'statuses');
  const quoteRow = query<{ status: string; link_generation: number; revoked_at: number | null }>(
    `SELECT status, link_generation, revoked_at FROM quotes WHERE request_id = '${concurrent.id}'`,
  )[0]!;
  expectEqual([quoteRow.status, quoteRow.link_generation, quoteRow.revoked_at], ['approved', 2, null], 'replaced quotation');
  const links = query<{ link_generation: number; revoked: number }>(
    `SELECT link_generation, revoked_at IS NOT NULL AS revoked FROM quote_links WHERE quote_id = (SELECT id FROM quotes WHERE request_id = '${concurrent.id}') ORDER BY link_generation`,
  );
  expectEqual(links.map((l) => [l.link_generation, l.revoked]), [[1, 1], [2, 0]], 'links: the revoked first, the new second');
  const jobs = query<{ link_generation: number; status: string }>(
    `SELECT link_generation, status FROM email_jobs WHERE kind = 'quotation' AND request_id = '${concurrent.id}' ORDER BY link_generation`,
  );
  expectEqual(jobs.map((j) => [j.link_generation, j.status]), [[1, 'provider_accepted'], [2, 'queued']], 'the sent email stays recorded; one new job');
  for (const table of ['quote_requests WHERE id', 'quotes WHERE request_id', 'email_jobs WHERE request_id', 'quote_events WHERE request_id']) {
    expectEqual(query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} = '${stale.id}'`)[0]!.n, 0, `deleted: ${table}`);
  }
  expectEqual(query<{ status: string }>(`SELECT status FROM quote_requests WHERE id = '${plainId}'`)[0]!.status, 'dismissed', 'dismissed');
});

// ---- Codex consolidated review repairs (2026-10-17) ------------------------------------------
const DAY_MS = 24 * 3600 * 1000;
/** Runs a SQL file against the local database (server stopped), for fixtures too large for --command. */
function querySqlFile(sql: string) {
  const file = join(work, 'fixture.sql');
  writeFileSync(file, sql);
  wrangler(['d1', 'execute', 'DB', '--local', '--persist-to', state, '-c', configPath, '--file', file]);
}
/**
 * A realistic history (finding 3): per request a quotation, its link, an approval event, the owner
 * notification (1 attempt) and the quotation email (2 attempts); plus 200 cap warnings (1 attempt
 * each), half older than 90 days. Jobs in total: 2 × requests + 200.
 */
function historySql(tag: string, requestsPerAge: number): string {
  const cte = (count: number) => `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ${count})`;
  const parts: string[] = [];
  for (const [age, at, offset] of [['o', Date.now() - 100 * DAY_MS, 0], ['n', Date.now() - DAY_MS, 100000]] as const) {
    const p = `${tag}${age}`;
    const seq = `${offset} + ${tag.slice(1)} * 1000000 + i`;
    parts.push(
      `${cte(requestsPerAge)} INSERT INTO quote_requests (id, ref, ref_year, ref_seq, submission_id, payload_hash, client_hash, hash_key_version, source, status, service, plan,
         name, email, organization, phone, organization_type, project_need, message, privacy_ack_version, created_at, updated_at, last_activity_at)
       SELECT '${p}-r-' || i, 'BT-R-1998-${p}' || i, 1998, ${seq}, '${p}-s-' || i, 'h', 'c', '1', 'js', 'quoted', '', 'starter',
         'History', 'h@example.test', 'O', '', 'other', 'history row', '', 'v', ${at}, ${at}, ${at} FROM n`,
      `${cte(requestsPerAge)} INSERT INTO quotes (id, request_id, ref, ref_year, ref_seq, status, version, scope_text, amount_centavos, validity_days, link_key_version,
         link_generation, token_hash, expires_at, snap_name, snap_email, snap_scope, snap_amount_centavos, snap_validity_days, approved_at, approved_by, emailed_at, created_at, updated_at)
       SELECT '${p}-q-' || i, '${p}-r-' || i, 'BT-Q-1998-${p}' || i, 1998, ${seq}, 'emailed', 2, 'history scope text', 100000, 14, 1,
         1, '${p}-t-' || i, ${at + 14 * DAY_MS}, 'History', 'h@example.test', 'history scope text', 100000, 14, ${at}, 'owner', ${at}, ${at}, ${at} FROM n`,
      `${cte(requestsPerAge)} INSERT INTO quote_links (token_hash, quote_id, link_generation, link_key_version, created_at) SELECT '${p}-t-' || i, '${p}-q-' || i, 1, 1, ${at} FROM n`,
      `${cte(requestsPerAge)} INSERT INTO quote_events (id, quote_id, request_id, actor, event, version, created_at) SELECT '${p}-e-' || i, '${p}-q-' || i, '${p}-r-' || i, 'owner', 'approved', 2, ${at} FROM n`,
      `${cte(requestsPerAge)} INSERT INTO email_jobs (id, kind, request_id, quote_id, link_generation, resend_seq, idempotency_key, status, attempts, first_attempt_at, next_attempt_at,
         provider_message_id, last_result, created_at, updated_at)
       SELECT '${p}-n-' || i, 'owner_notification', '${p}-r-' || i, NULL, NULL, 0, 'bt-r-${p}-' || i || '-n0', 'provider_accepted', 1, ${at}, ${at}, 'm-${p}-n-' || i, 'OK_ACCEPTED', ${at}, ${at} FROM n
       UNION ALL
       SELECT '${p}-j-' || i, 'quotation', '${p}-r-' || i, '${p}-q-' || i, 1, 0, 'bt-q-${p}-q-' || i || '-g1-s0', 'provider_accepted', 2, ${at}, ${at}, 'm-${p}-j-' || i, 'OK_ACCEPTED', ${at}, ${at} FROM n`,
      `${cte(requestsPerAge)} INSERT INTO email_attempts (id, job_id, attempt, started_at, send_intent_at, provider_called_at, finished_at, outcome)
       SELECT '${p}-na-' || i, '${p}-n-' || i, 1, ${at}, ${at}, ${at}, ${at}, 'OK_ACCEPTED' FROM n
       UNION ALL SELECT '${p}-ja1-' || i, '${p}-j-' || i, 1, ${at}, ${at}, ${at}, ${at}, 'E_PROVIDER_5XX' FROM n
       UNION ALL SELECT '${p}-ja2-' || i, '${p}-j-' || i, 2, ${at}, ${at}, ${at}, ${at}, 'OK_ACCEPTED' FROM n`,
    );
  }
  // Cap warnings: i = 1..100 created 101–200 days ago (eligible), i = 101..200 created 1–89 days ago.
  const created = `${Date.now()} - (CASE WHEN i <= 100 THEN 100 + i ELSE (i - 101) % 89 + 1 END) * ${DAY_MS}`;
  parts.push(
    `${cte(200)} INSERT INTO email_jobs (id, kind, resend_seq, idempotency_key, status, attempts, first_attempt_at, next_attempt_at, last_result, created_at, updated_at)
     SELECT '${tag}-w-' || i, 'owner_cap_warning', 0, 'bt-cap-${tag}-' || i, 'provider_accepted', 1, ${created}, ${created}, 'OK_ACCEPTED', ${created}, ${created} FROM n`,
    `${cte(200)} INSERT INTO email_attempts (id, job_id, attempt, started_at, send_intent_at, provider_called_at, finished_at, outcome)
     SELECT '${tag}-wa-' || i, '${tag}-w-' || i, 1, ${created}, ${created}, ${created}, ${created}, 'OK_ACCEPTED' FROM n`,
  );
  return parts.join(';\n') + ';\n';
}
type RetentionRun = { summary: { requestsDeleted: number; requestsSkipped: number; formTokensDeleted: number; capWarningsDeleted: number }; cost: { read: number; written: number; statements: number } };
const costs: Record<string, RetentionRun[]> = {};

for (const jobs of [6000, 12000]) {
  await scenario(`Retention (real D1): ${jobs.toLocaleString('en')} jobs with attempts, requests, quotations, links and events — no eligible rows, then two bounded passes`, async () => {
    const tag = `h${jobs / 1000}`;
    const perAge = (jobs - 200) / 4; // requests per age group; 2 jobs each
    querySqlFile(historySql(tag, perAge));
    try {
      const counted = query<{ jobs: number; attempts: number; requests: number }>(
        `SELECT (SELECT COUNT(*) FROM email_jobs WHERE id LIKE '${tag}%') AS jobs, (SELECT COUNT(*) FROM email_attempts WHERE id LIKE '${tag}%') AS attempts,
           (SELECT COUNT(*) FROM quote_requests WHERE id LIKE '${tag}%') AS requests`,
      )[0]!;
      expectEqual([counted.jobs, counted.attempts, counted.requests], [jobs, perAge * 2 * 3 + 200, perAge * 2], 'fixture size');
      await startDev();
      const runs: RetentionRun[] = [];
      // Nothing eligible: a clock 120 days back puts the cutoff before every row.
      runs.push(await (await fetch(`${origin}/__test/retention?now=${Date.now() - 120 * DAY_MS}`)).json());
      for (let i = 0; i < 2; i++) runs.push(await (await fetch(`${origin}/__test/retention?now=${Date.now()}`)).json());
      await stopDev();
      costs[jobs] = runs;
      console.log(`Retention on ${jobs} jobs: ${JSON.stringify(runs.map((r) => ({ ...r.summary, ...r.cost })))}`);
      expectEqual(
        runs.map((r) => [r.summary.requestsDeleted, r.summary.requestsSkipped, r.summary.capWarningsDeleted]),
        [[0, 0, 0], [5, 0, 100], [5, 0, 0]],
        'nothing eligible, then one bounded batch per pass',
      );
      expectEqual([runs[0]!.cost.written, runs[0]!.cost.read <= 10], [0, true], 'an empty pass writes nothing and reads almost nothing');
      const left = query<{ old: number; recent: number; warnings: number; attempts: number; orphans: number }>(
        `SELECT (SELECT COUNT(*) FROM quote_requests WHERE id LIKE '${tag}o-%') AS old, (SELECT COUNT(*) FROM quote_requests WHERE id LIKE '${tag}n-%') AS recent,
           (SELECT COUNT(*) FROM email_jobs WHERE id LIKE '${tag}-w-%') AS warnings, (SELECT COUNT(*) FROM email_attempts WHERE id LIKE '${tag}%') AS attempts,
           (SELECT COUNT(*) FROM email_attempts WHERE job_id NOT IN (SELECT id FROM email_jobs)) AS orphans`,
      )[0]!;
      expectEqual(
        [left.old, left.recent, left.warnings, left.attempts, left.orphans],
        [perAge - 10, perAge, 100, (perAge * 2 - 10) * 3 + 100, 0],
        'deleted whole with jobs and attempts; recent requests and cap warnings kept',
      );
    } finally {
      await stopDev();
      // Remove this fixture (also after a failure) so the next size and later full-table checks start from the same state.
      query(`DELETE FROM email_jobs WHERE id LIKE '${tag}%'`);
      for (const table of ['quote_events', 'quote_links', 'quotes', 'quote_requests']) query(`DELETE FROM ${table} WHERE ${table === 'quote_links' ? 'token_hash' : 'id'} LIKE '${tag}%'`);
    }
  });
}
await scenario('Retention cost (real D1) does not grow with the email history: 12,000 jobs cost the same as 6,000', async () => {
  const [six, twelve] = [costs[6000], costs[12000]];
  if (!six || !twelve) throw new Error('a populated run failed');
  expectEqual(
    twelve.map((run, i) => [run.cost.statements, run.cost.written, run.cost.read - six[i]!.cost.read]),
    six.map((run) => [run.cost.statements, run.cost.written, 0]),
    'statements, rows written and rows read per pass, 12,000 vs 6,000 jobs',
  );
  // Before the repair the cap-warning statement scanned every job: rows read grew with the history.
  for (const run of twelve) if (run.cost.read >= 6000) throw new Error(`retention pass read ${run.cost.read} rows`);
  // Workers Free allows 50 D1 queries per invocation; every pass stays below it even counting each batched statement.
  for (const run of [...six, ...twelve]) if (run.cost.statements >= 50) throw new Error(`retention pass used ${run.cost.statements} statements`);
});

await scenario('Generations (real D1): an older link’s in-flight send completing after a replacement leaves the new link unemailed; earlier-generation resends never block its resend', async () => {
  const r = { id: crypto.randomUUID(), email: 'generations-owner-check@example.test' };
  query(
    `INSERT INTO quote_requests (id, ref, ref_year, ref_seq, submission_id, payload_hash, client_hash, hash_key_version, source, service, plan,
       name, email, organization, phone, organization_type, project_need, message, privacy_ack_version, created_at, updated_at, last_activity_at)
     VALUES ('${r.id}', 'BT-R-2026-9200', 2026, 9200, '${crypto.randomUUID()}', 'h', 'c', '1', 'js', '', 'starter', 'TEST Generations', '${r.email}',
       'TEST ONLY organization', '', 'other', 'TEST ONLY: owner check', '', 'v', ${Date.now()}, ${Date.now()}, ${Date.now()})`,
  );
  // Only this quotation's email may meet the scripted provider: park any other due job.
  query("UPDATE email_jobs SET status = 'cancelled', last_result = 'E_TEST_PARKED' WHERE status IN ('queued', 'retry_wait')");
  await startDev();
  try {
    const trigger = () => fetch(`${origin}/cdn-cgi/handler/scheduled?cron=${encodeURIComponent('*/5 * * * *')}`).then((res) => res.status);
    const script = (b: string) => fetch(`${origin}/__test/provider-script?b=${b}`);
    const calls = async () => ((await (await fetch(`${origin}/__test/provider`)).json()) as { calls: unknown[] }).calls.length;
    const act = async (kind: string) => {
      const page = await (await get(`/requests/${r.id}/${kind}`)).text();
      return (await post(`/requests/${r.id}/${kind}`, { form_token: tokenIn(page), version: versionIn(page) })).status;
    };
    const detail = async () => (await (await get(`/requests/${r.id}`)).text()).replace(/\s+/g, ' ');
    expectEqual((await post(`/requests/${r.id}/approve`, await draftAndConfirm(r.id))).status, 303, 'approve');
    await script('reject');
    expectEqual(await trigger(), 200, 'run 1: generation 1 rejected');
    expectEqual(await act('resend'), 303, 'resend generation 1');
    await script('accept_slow');
    const before = await calls();
    const inFlight = trigger();
    inFlight.catch(() => undefined); // awaited below; if the scenario fails first, the server is stopped under it
    await waitFor(async () => (await calls()) === before + 1, 'generation 1 resend in flight at the provider');
    expectEqual(await act('new-link'), 303, 'new link while the older email is being sent');
    await fetch(`${origin}/__test/provider-release`);
    expectEqual(await inFlight, 200, 'run 2 finished');
    if (!/Quotation BT-Q-\d{4}-\d{4}: approved/.test(await detail())) throw new Error('the replacement link was marked emailed by the older send');
    await script('reject');
    expectEqual(await trigger(), 200, 'run 3: generation 2 rejected');
    if (!(await detail()).includes('Send the quotation email again')) throw new Error('resend not offered for the replacement link');
    expectEqual(await act('resend'), 303, 'resend generation 2 (refused with 409 before the repair)');
    expectEqual(await trigger(), 200, 'run 4: generation 2 resend accepted');
  } finally {
    await stopDev();
  }
  const jobs = query<{ key: string; status: string; has_id: number }>(
    `SELECT substr(idempotency_key, -5) AS key, status, provider_message_id IS NOT NULL AS has_id FROM email_jobs WHERE request_id = '${r.id}' AND kind = 'quotation' ORDER BY link_generation, resend_seq`,
  );
  expectEqual(jobs.map((j) => [j.key, j.status, j.has_id]), [
    ['g1-s0', 'cancelled', 0],
    ['g1-s1', 'provider_accepted', 1], // the older send's acceptance stays recorded
    ['g2-s0', 'needs_owner', 0],
    ['g2-s1', 'provider_accepted', 1],
  ], 'jobs');
  const quoteRow = query<{ status: string; link_generation: number }>(`SELECT status, link_generation FROM quotes WHERE request_id = '${r.id}'`)[0]!;
  expectEqual([quoteRow.status, quoteRow.link_generation], ['emailed', 2], 'emailed only once the replacement link’s email was accepted');
  const attempts = query<{ outcome: string }>(
    `SELECT a.outcome FROM email_attempts a JOIN email_jobs j ON j.id = a.job_id WHERE j.request_id = '${r.id}' AND j.idempotency_key LIKE '%-g1-s1'`,
  );
  expectEqual(attempts.map((a) => a.outcome), ['OK_ACCEPTED'], 'older send attempt record');
});

await scenario('Cap warnings (real D1, sending off): an old one left in sending with an expired lease is deleted with its attempt; a live lease is kept', async () => {
  const t = Date.now();
  const created = t - 91 * DAY_MS;
  for (const [id, leaseUntil] of [['cap-expired', t - 60_000], ['cap-live', t + 3600_000]] as const) {
    query(`INSERT INTO email_jobs (id, kind, resend_seq, idempotency_key, status, attempts, first_attempt_at, next_attempt_at, lease_id, lease_until, created_at, updated_at)
           VALUES ('${id}', 'owner_cap_warning', 0, 'bt-cap-${id}', 'sending', 1, ${created}, ${created}, 'lease-${id}', ${leaseUntil}, ${created}, ${created})`);
    query(`INSERT INTO email_attempts (id, job_id, attempt, started_at, send_intent_at) VALUES ('lease-${id}', '${id}', 1, ${created}, ${created})`);
  }
  await startDev(['--var', 'SENDING_ENABLED:off']);
  try {
    expectEqual((await fetch(`${origin}/cdn-cgi/handler/scheduled?cron=${encodeURIComponent('*/5 * * * *')}`)).status, 200, 'scheduled run');
  } finally {
    await stopDev();
  }
  const jobs = query<{ id: string; status: string }>("SELECT id, status FROM email_jobs WHERE id LIKE 'cap-%' ORDER BY id");
  const attempts = query<{ id: string }>("SELECT id FROM email_attempts WHERE job_id LIKE 'cap-%' ORDER BY id");
  expectEqual([jobs.map((j) => [j.id, j.status]), attempts.map((a) => a.id)], [[['cap-live', 'sending']], ['lease-cap-live']], 'expired deleted, live kept (sending off: no recovery ran)');
  query("DELETE FROM email_jobs WHERE id LIKE 'cap-%'");
});

await scenario('Immutability (real D1): approved snapshots and frozen job snapshots refuse changes', async () => {
  for (const sql of [
    "UPDATE quotes SET snap_email = 'attacker@example.test' WHERE token_hash IS NOT NULL",
    "UPDATE email_jobs SET to_address = 'attacker@example.test' WHERE kind = 'quotation'",
    "UPDATE email_jobs SET idempotency_key = 'other' WHERE kind = 'quotation'",
  ]) {
    let refused = false;
    try {
      query(sql);
    } catch (error) {
      refused = /immutable/.test(String(error));
    }
    expectEqual(refused, true, sql);
  }
});

await scenario('Invalid OWNER_ORIGIN (real runtime): GET and POST get 503 and the database is unchanged', async () => {
  const before = dump();
  const target = requests[3]!; // still a draft, so an accepted POST would change rows
  const statuses: string[] = [];
  for (const value of ['null', 'https://buildtrack-owner.example.test/', 'http://192.0.2.10:8788', `${origin}/owner`]) {
    await startDev(['--var', `OWNER_ORIGIN:${value}`]);
    // The confirmation token can't be fetched from a refusing Worker, so the POST carries a
    // syntactically valid one; with a valid origin it would reach the token check (403), not 503.
    const fields = { form_token: `${'A'.repeat(43)}.${Date.now() + 60000}.${'A'.repeat(43)}`, version: '1' };
    statuses.push(
      [
        (await get('/')).status,
        (await get(`/requests/${target.id}`)).status,
        (await post(`/requests/${target.id}/approve`, fields, { Origin: value })).status,
        (await post(`/requests/${target.id}/draft`, { ...fields, ...draft }, { Origin: origin })).status,
      ].join(','),
    );
    await stopDev();
  }
  expectEqual(statuses, ['503,503,503,503', '503,503,503,503', '503,503,503,503', '503,503,503,503'], 'statuses');
  expectEqual(dump() === before, true, 'database unchanged');
});

// ---- 4. The deployable entry with the committed local config -------------------------
await scenario('Deployable entry with wrangler.owner.local.jsonc: refuses everything (503), even with a test JWT', async () => {
  const entryPort = await freePort();
  const entry = spawn(
    process.execPath,
    [wranglerJs!, 'dev', '--local', '-c', join(root, 'wrangler.owner.local.jsonc'), '--ip', '127.0.0.1', '--port', String(entryPort), '--persist-to', join(work, 'entry-state'), '--show-interactive-dev-session=false'],
    { env: wranglerEnv },
  );
  children.push(entry);
  let status = 0;
  for (let i = 0; i < 300 && !status; i++) {
    try {
      status = (await fetch(`http://127.0.0.1:${entryPort}/`, { headers: { 'Cf-Access-Jwt-Assertion': jwt } })).status;
    } catch {
      await sleep(200);
    }
  }
  kill(entry);
  expectEqual(status, 503, 'status');
});

await scenario('Deployable entry, fully configured but with OWNER_ORIGIN on loopback HTTP: GET and POST get 503, D1 unchanged', async () => {
  // Same vars as the test Worker (secrets included) and the seeded database, but the real entry:
  // it must refuse at configuration (503) rather than reach the Access check (404) or D1.
  const entryPort = await freePort();
  const entryOrigin = `http://127.0.0.1:${entryPort}`;
  const entryConfig = join(work, 'wrangler-entry.json');
  const testConfig = JSON.parse(readFileSync(configPath, 'utf8')) as { vars: Record<string, string> };
  const { TEST_ACCESS_JWKS: _unused, ...vars } = testConfig.vars;
  writeFileSync(
    entryConfig,
    JSON.stringify({
      name: 'buildtrack-owner-entry-test',
      compatibility_date: '2026-10-04',
      main: posix(join(root, 'worker', 'owner', 'index.ts')),
      d1_databases: [d1],
      vars: { ...vars, OWNER_ORIGIN: entryOrigin },
      observability: { enabled: true, logs: { invocation_logs: false } },
    }),
  );
  const before = dump();
  const entry = spawn(
    process.execPath,
    [wranglerJs!, 'dev', '--local', '-c', entryConfig, '--ip', '127.0.0.1', '--port', String(entryPort), '--persist-to', state, '--show-interactive-dev-session=false'],
    { env: wranglerEnv },
  );
  children.push(entry);
  let first = 0;
  for (let i = 0; i < 300 && !first; i++) {
    try {
      first = (await fetch(`${entryOrigin}/`, { headers: { 'Cf-Access-Jwt-Assertion': jwt } })).status;
    } catch {
      await sleep(200);
    }
  }
  const target = requests[3]!;
  const posted = await fetch(`${entryOrigin}/requests/${target.id}/draft`, {
    method: 'POST',
    body: new URLSearchParams({ form_token: `${'A'.repeat(43)}.${Date.now() + 60000}.${'A'.repeat(43)}`, version: '1', ...draft }).toString(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: entryOrigin, 'Cf-Access-Jwt-Assertion': jwt },
  });
  const statuses = [first, (await fetch(`${entryOrigin}/requests/${target.id}`, { headers: { 'Cf-Access-Jwt-Assertion': jwt } })).status, posted.status];
  kill(entry);
  await sleep(1000);
  expectEqual(statuses, [503, 503, 503], 'GET /, GET request, POST draft');
  expectEqual(dump() === before, true, 'database unchanged');
});

await scenario('Browser made no request outside the local Worker', async () => {
  expectEqual(blocked, [], 'blocked requests');
});
await scenario('Worker log lines contain no names, emails, tokens or keys', async () => {
  // Only the Worker's own lines: Wrangler's startup banner prints configured vars (here the test
  // values, truncated); that is local tooling output, and secrets set with `wrangler secret put` are not vars.
  const logLines = devOutput.split(/\r?\n/).filter((line) => line.startsWith('{'));
  if (!logLines.some((line) => line.includes('"owner_changed"'))) throw new Error('no Worker log lines captured');
  for (const value of [...requests.flatMap((r) => [r.name, r.email]), TEST_OWNER, jwt, linkKey, 'TEST ONLY', ...requests.map((r) => r.id)]) {
    if (logLines.some((line) => line.includes(value))) throw new Error(`a log line contains ${value.slice(0, 40)}`);
  }
});

ws.close();
cleanup();
for (const result of results) console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.name}${result.detail ? `\n      ${result.detail}` : ''}`);
const failed = results.filter((result) => !result.ok).length;
console.log(`\n${results.length - failed}/${results.length} owner checks passed.`);
process.exit(failed ? 1 : 0);
