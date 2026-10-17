// Local end-to-end check of the whole quotation workflow on the real Workers runtime and local
// D1: `npm run test:worker:e2e`. Mocked email only; no network service, account or real email.
//
// 1. Builds a temporary copy of the site with the quotation workflow enabled and the /quote/ page
//    added (tests/browser/fixtures/quotation-enabled.ts + quoteRoute()). The real config and dist/
//    are never touched; the committed config keeps the workflow, sending and customer readiness off.
// 2. Runs the test-only Worker tests/worker/e2e-test-worker.ts under `wrangler dev --local
//    --test-scheduled`: the public site on http://127.0.0.1:<port> and the owner pages on
//    http://localhost:<port> (two origins), one throwaway local D1 database, per-run keys.
// 3. In headless Chromium (CHROME_PATH): a visitor requests a quotation -> the owner reviews,
//    drafts and approves it -> a scheduled run "sends" the invitation to the in-memory provider ->
//    the customer opens the link, reloads, accepts after confirming, and runs a simulated checkout.
//    Also: no-JS, invalid and missing links, keyboard, 320/390 px layouts, Origin under
//    no-referrer, and that no request ever carries the token in a URL or the demo code anywhere.
// 4. Over HTTP: concurrent acceptance and simulated outcomes, a revoked and a superseded link.
// 5. Reads D1 back only while the server is stopped.
// Network: browser requests to anything but the two local origins are blocked and fail the run.
// Tooling traffic (Wrangler's update check) is not isolated; no Cloudflare credentials are used.

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'astro';
import { quoteRoute } from '../../src/integrations/quote-route.ts';
import { resultDisclaimer } from '../../src/lib/payment-walkthrough.ts';
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

const work = mkdtempSync(join(tmpdir(), 'buildtrack-e2e-'));
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
process.on('uncaughtException', (error) => {
  cleanup();
  console.error(error);
  process.exit(1);
});

// ---- 1. Fixture build (workflow enabled, /quote/ added) -------------------------------
const normalize = (path: string) => path.split('?')[0]!.replaceAll('\\', '/').toLowerCase();
async function buildSite(): Promise<string> {
  const outDir = join(work, 'site');
  const swaps = { quotation: 'quotation-enabled.ts', inquiry: 'inquiry-configured.ts' };
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
    integrations: [quoteRoute()],
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
  if (!existsSync(join(outDir, 'quote', 'index.html'))) throw new Error('the test build has no /quote/ page');
  return outDir;
}
const siteDir = await buildSite();

// ---- 2. Worker, D1 and keys -----------------------------------------------------------
const port = await new Promise<number>((done) => {
  const server = createServer();
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    server.close(() => done(typeof address === 'object' && address ? address.port : 0));
  });
});
const site = `http://127.0.0.1:${port}`;
const ownerSite = `http://localhost:${port}`;
const state = join(work, 'state');
const configPath = join(work, 'wrangler.json');
const random32 = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
const access = await createTestAccess();
const secrets = { INTAKE_HMAC_KEY: random32(), OWNER_FORM_KEY: random32(), QUOTE_LINK_KEY_V1: random32() };
writeFileSync(
  configPath,
  JSON.stringify({
    name: 'buildtrack-e2e-test',
    compatibility_date: '2026-10-04',
    main: posix(join(root, 'tests', 'worker', 'e2e-test-worker.ts')),
    assets: { directory: posix(siteDir), binding: 'ASSETS', not_found_handling: '404-page', html_handling: 'auto-trailing-slash', run_worker_first: true },
    d1_databases: [{ binding: 'DB', database_name: 'buildtrack-e2e-test', database_id: '00000000-0000-4000-8000-000000000003', migrations_dir: posix(join(root, 'migrations')) }],
    vars: {
      WORKFLOW_ENABLED: 'on',
      PUBLIC_ORIGIN: site,
      INTAKE_HMAC_KEY_VERSION: '1',
      OWNER_ORIGIN: ownerSite,
      OWNER_EMAIL: TEST_OWNER,
      ACCESS_TEAM_DOMAIN: TEST_TEAM,
      ACCESS_AUD: TEST_AUD,
      QUOTE_LINK_KEY_CURRENT: '1',
      // The release mode: manual email. SENDING_ENABLED stays on to show that manual mode still sends nothing.
      EMAIL_MODE: 'manual',
      SENDING_ENABLED: 'on',
      MAIL_FROM: 'BuildTrack <quotes@mail.example.test>',
      TEST_ACCESS_JWKS: JSON.stringify({ keys: [access.publicJwk] }),
      ...secrets,
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
let devOutput = '';
let dev: ChildProcess | undefined;
async function startDev() {
  dev = spawn(
    process.execPath,
    [wranglerJs!, 'dev', '--local', '-c', configPath, '--ip', '127.0.0.1', '--port', String(port), '--persist-to', state, '--show-interactive-dev-session=false', '--test-scheduled'],
    { env: wranglerEnv },
  );
  children.push(dev);
  dev.stdout?.on('data', (chunk) => (devOutput += chunk));
  dev.stderr?.on('data', (chunk) => (devOutput += chunk));
  for (let i = 0; i < 300; i++) {
    try {
      await fetch(`${site}/`);
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
  await startDev();
} catch (error) {
  cleanup();
  throw error;
}

// ---- 3. Helpers -----------------------------------------------------------------------
const results: { name: string; ok: boolean; detail?: string }[] = [];

// ---- CDP interception errors (Codex consolidated review, finding 7) ---------------------------
// A paused request that the browser has cancelled (a reload or navigation, or the page aborting its
// own fetch) can no longer be continued, failed or fulfilled: CDP then answers exactly
// "Invalid InterceptionId.". Only that exact error is tolerated, and only for an interception id
// that is still OUTSTANDING (this harness saw it paused and has not completed it: every successful
// continue, fail or fulfil retires its id) and whose cancellation Chromium itself reported: either
// Network.loadingFailed with canceled: true for that request (the page aborted it), or a main-frame
// navigation committed after it was paused and while it was still outstanding (a reload or
// navigation replaced its document; Chromium then sends no per-request event, checked with a
// standalone probe on 2026-10-17). A navigation alone never authorizes the error: an unknown or
// retired (already completed) id fails. Any other error also fails: the scenario in progress fails
// and so does the run. Nothing throws inside a CDP callback, and an unhandled rejection is recorded
// instead of ending the process, so no later scenario or assertion is skipped.
const CANCELLED = 'Invalid InterceptionId.';
const networkIdOf = new Map<string, string>(); // interception id -> the browser's network request id
const cancelledByBrowser = new Set<string>(); // network ids reported cancelled
/** Paused and not yet completed: interception id -> main-frame navigations seen when it was (last) paused. */
const outstanding = new Map<string, number>();
let mainFrameNavigations = 0;
const unconfirmed: { method: string; id: string; pausedAt: number }[] = [];
const harnessErrors: string[] = [];
const interceptionError = (method: string, id: string) => (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const pausedAt = outstanding.get(id);
  outstanding.delete(id); // decided here either way: the id cannot be used again
  if (message === `${method}: ${CANCELLED}` && pausedAt !== undefined) unconfirmed.push({ method, id, pausedAt });
  else harnessErrors.push(`${method} ${id}: ${message}${message.endsWith(CANCELLED) && pausedAt === undefined ? ' (not an outstanding interception)' : ''}`);
};
/** A CDP call that completes interception `id`: success retires it; failure goes to interceptionError. */
const complete = (method: 'Fetch.continueRequest' | 'Fetch.failRequest' | 'Fetch.fulfillRequest', id: string, params: object) =>
  send(method, params).then(() => {
    outstanding.delete(id);
  }, interceptionError(method, id));
/** Waits briefly for the browser's cancellation reports; an unconfirmed one becomes a harness error. */
async function settleInterceptions() {
  const confirmed = (u: { id: string; pausedAt: number }) => cancelledByBrowser.has(networkIdOf.get(u.id) ?? '') || mainFrameNavigations > u.pausedAt;
  const deadline = Date.now() + 3000;
  while (unconfirmed.some((u) => !confirmed(u)) && Date.now() < deadline) await sleep(50);
  for (const u of unconfirmed.splice(0)) if (!confirmed(u)) harnessErrors.push(`${u.method} ${u.id}: "${CANCELLED}" for a request the browser never reported cancelled`);
}
process.on('unhandledRejection', (reason) => harnessErrors.push(`unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`));

async function scenario(name: string, run: () => Promise<void>) {
  const before = harnessErrors.length;
  let failure: string | undefined;
  try {
    await run();
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }
  await settleInterceptions();
  const harness = harnessErrors.slice(before);
  if (harness.length) failure = [failure, `harness: ${harness.join('; ')}`].filter(Boolean).join(' | ');
  results.push({ name, ok: !failure, detail: failure });
}
function expectEqual(actual: unknown, expected: unknown, label: string) {
  // JSON.stringify writes every Set and Map as {}, so comparing them would always pass (finding 6).
  const json = (value: unknown) =>
    JSON.stringify(value, (_key, v: unknown) => {
      if (v instanceof Set || v instanceof Map) throw new Error(`${label}: compare arrays, not a Set or Map`);
      return v;
    });
  if (json(actual) !== json(expected)) throw new Error(`${label}: expected ${json(expected)}, got ${json(actual)}`);
}

// ---- Request identities (Codex consolidated review, finding 6) ---------------------------------
type Mutation = { action: string; fields: Record<string, unknown> };
/** One action with its exact fields (token, version, method, outcome, attempt id), key order ignored. */
const identity = (m: Mutation) => JSON.stringify([m.action, Object.entries(m.fields).sort(([a], [b]) => (a < b ? -1 : 1))]);
/** Exactly `count` requests were sent (the original and its retries), each the identical action and fields. */
function expectSameMutation(sent: Mutation[], original: Mutation, count: number, label: string) {
  expectEqual(sent.length, count, `${label}: requests sent (the original and its retries)`);
  sent.forEach((m, i) => expectEqual(identity(m), identity(original), `${label}: request ${i + 1} is the original action with its exact fields`));
}
const jwt = await access.sign({ exp: Math.floor(Date.now() / 1000) + 3600 });
const ownerGet = (path: string) => fetch(ownerSite + path, { headers: { 'Cf-Access-Jwt-Assertion': jwt }, redirect: 'manual' });
const ownerPost = (path: string, fields: Record<string, string>) =>
  fetch(ownerSite + path, {
    method: 'POST',
    redirect: 'manual',
    body: new URLSearchParams(fields).toString(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: ownerSite, 'Cf-Access-Jwt-Assertion': jwt },
  });
const formOf = (html: string) => ({ form_token: /name="form_token" value="([^"]+)"/.exec(html)?.[1] ?? '', version: /name="version" value="(\d+)"/.exec(html)?.[1] ?? '' });
/**
 * One stable client identity per customer journey (here: per quotation link), shared by the API
 * helper and the browser, and never rotated per request: the per-client hourly limit (30) applies
 * to each journey exactly as it would to a customer. Separate journeys use separate links.
 */
const journeys = new Map<string, string>();
const identityOf = (token: string | undefined) => {
  const key = token ?? '';
  if (!journeys.has(key)) journeys.set(key, `198.19.${(journeys.size >> 8) & 255}.${(journeys.size + 1) & 255}`);
  return journeys.get(key)!;
};
const api = (action: string, fields: Record<string, string>, headers: Record<string, string> = {}) =>
  fetch(`${site}/api/quote/${action}`, {
    method: 'POST',
    body: JSON.stringify(fields),
    headers: { 'Content-Type': 'application/json', Origin: site, 'CF-Connecting-IP': identityOf(fields.token), ...headers },
  });
let ipCounter = 0;
async function httpRequest(name: string): Promise<string> {
  const response = await fetch(`${site}/api/quotation-requests`, {
    method: 'POST',
    body: JSON.stringify({
      service: '', plan: 'starter', name, email: `${name.toLowerCase().replace(/\W+/g, '-')}@example.test`, organization: 'TEST ONLY organization',
      phone: '', organization_type: 'other', project_need: 'TEST ONLY: end-to-end check', message: '', privacy_ack: 'yes', submission_id: crypto.randomUUID(),
    }),
    headers: { 'Content-Type': 'application/json', Origin: site, 'CF-Connecting-IP': `198.18.0.${++ipCounter}` },
  });
  return ((await response.json()) as { reference: string }).reference;
}
async function ownerApprove(reference: string): Promise<void> {
  const list = await (await ownerGet('/')).text();
  const id = new RegExp(`href="/requests/([0-9a-f-]{36})">${reference}<`).exec(list)?.[1];
  if (!id) throw new Error(`owner list misses ${reference}`);
  const detail = formOf(await (await ownerGet(`/requests/${id}`)).text());
  expectEqual((await ownerPost(`/requests/${id}/draft`, { ...detail, scope: 'TEST ONLY: scope for the end-to-end check.', amount: '2,990', validity_days: '14' })).status, 303, 'draft');
  expectEqual((await ownerPost(`/requests/${id}/approve`, formOf(await (await ownerGet(`/requests/${id}/confirm`)).text()))).status, 303, 'approve');
}
const runScheduled = async () => expectEqual((await fetch(`${site}/cdn-cgi/handler/scheduled?cron=${encodeURIComponent('*/5 * * * *')}`)).status, 200, 'scheduled run');
type Invitation = { key: string; to: string; subject: string; link: string | null };
const invitations = async () => (await (await fetch(`${site}/__test/invitations`)).json()) as Invitation[];
const htmlDecode = (html: string) => html.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
/**
 * Manual email mode (the release mode): the customer link as the owner page prepares it for the
 * owner to copy into their own email. Nothing is sent; the mock provider captures nothing.
 */
const preparedLink = async (reference: string) => {
  const list = await (await ownerGet('/')).text();
  const id = new RegExp(`href="/requests/([0-9a-f-]{36})">${reference}<`).exec(list)?.[1];
  if (!id) throw new Error(`owner list misses ${reference}`);
  const page = await (await ownerGet(`/requests/${id}`)).text();
  const link = /id="invitation-link" type="text" readonly value="([^"]+)"/.exec(page)?.[1];
  if (!link) throw new Error(`no prepared invitation for ${reference}`);
  return htmlDecode(link);
};
const tokenOf = (link: string) => link.split('#t=')[1]!;

// ---- 4. Chromium ----------------------------------------------------------------------
const profile = join(work, 'profile');
children.push(spawn(chromePath, ['--headless', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' }));
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
      last = error;
    }
    await sleep(50);
  }
  throw new Error(`Timed out waiting for: ${label}${last ? ` (last error: ${last instanceof Error ? last.message : String(last)})` : ''}`);
}
// Every browser request is recorded; only the two local origins are allowed; owner requests get
// the test Access JWT (Access's role in production).
const blocked: string[] = [];
const requests: { url: string; method: string; headers: Record<string, string>; body: string }[] = [];
const securityMessages: string[] = [];
// Response-stage control for /api/quote/*: a rule can hold a response (the server has already
// answered) until released, or fail it as a lost response. Held ids are released by releaseHeld().
type ResponseRule = (request: { url: string; body: string }) => 'hold' | 'fail' | { replace: (original: string) => string } | null;
/** Request-stage rules: answer the browser with 504 but forward the identical request (see the interceptor). */
let gatewayRules: ((url: string, body: string) => boolean)[] = [];
const forwarded: Promise<Response>[] = [];
let responseRules: ResponseRule[] = [];
const heldResponses: string[] = [];
const releaseHeld = async () => {
  // A held response may have been cancelled by the page meanwhile (tolerated only as finding 7 allows).
  for (const requestId of heldResponses.splice(0)) await complete('Fetch.continueRequest', requestId, { requestId });
};
// The browser's own reports, for interceptionError: which network request each interception is, and
// which requests it cancelled.
listeners.push((message) => {
  if (message.method === 'Fetch.requestPaused') {
    outstanding.set(message.params.requestId, mainFrameNavigations);
    if (message.params.networkId) networkIdOf.set(message.params.requestId, message.params.networkId);
  }
  if (message.method === 'Network.loadingFailed' && message.params.canceled === true) cancelledByBrowser.add(message.params.requestId);
  if (message.method === 'Page.frameNavigated' && !message.params.frame.parentId) mainFrameNavigations++;
});
listeners.push((message) => {
  if (message.method !== 'Fetch.requestPaused' || (message.params.responseStatusCode === undefined && message.params.responseErrorReason === undefined)) return;
  const { requestId, request } = message.params;
  const decision = responseRules.map((rule) => rule({ url: request.url, body: request.postData ?? '' })).find((d) => d !== null) ?? null;
  if (decision === 'hold') heldResponses.push(requestId);
  else if (decision === 'fail') void complete('Fetch.failRequest', requestId, { requestId, errorReason: 'ConnectionReset' });
  else if (decision && typeof decision === 'object') {
    // The server has answered (and committed); the page receives a different body instead.
    void (async () => {
      const original = await send('Fetch.getResponseBody', { requestId }).catch(interceptionError('Fetch.getResponseBody', requestId));
      if (!original) return;
      const text = original.base64Encoded ? Buffer.from(original.body, 'base64').toString('utf8') : original.body;
      await complete('Fetch.fulfillRequest', requestId, {
        requestId,
        responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
        body: Buffer.from(decision.replace(text), 'utf8').toString('base64'),
      });
    })();
  } else void complete('Fetch.continueRequest', requestId, { requestId });
});
/** Test-only (harness self-check): requests matching this are left paused, their ids recorded. */
let stallRule: ((url: string) => boolean) | null = null;
const stalled: string[] = [];
listeners.push((message) => {
  if (message.params?.responseStatusCode !== undefined || message.params?.responseErrorReason !== undefined) return; // response stage: handled above
  if (message.method === 'Log.entryAdded' && /Content Security Policy|Refused to/i.test(message.params.entry.text)) securityMessages.push(message.params.entry.text);
  if (message.method === 'Runtime.exceptionThrown') securityMessages.push(`exception: ${JSON.stringify(message.params.exceptionDetails).slice(0, 200)}`);
  if (message.method !== 'Fetch.requestPaused') return;
  const { requestId, request } = message.params;
  if (stallRule?.(request.url)) {
    stalled.push(requestId);
    return;
  }
  requests.push({ url: request.url, method: request.method, headers: request.headers, body: request.postData ?? '' });
  if (request.url.startsWith(`${ownerSite}/`)) {
    const headers = Object.entries({ ...request.headers, 'Cf-Access-Jwt-Assertion': jwt }).map(([name, value]) => ({ name, value: String(value) }));
    void complete('Fetch.continueRequest', requestId, { requestId, headers });
  } else if (request.url.startsWith(`${site}/api/quote/`)) {
    // Stand in for Cloudflare's edge: the journey's one stable address (see identityOf).
    let token: string | undefined;
    try {
      token = JSON.parse(request.postData ?? '{}').token;
    } catch {}
    const gateway = gatewayRules.find((rule) => rule(request.url, request.postData ?? ''));
    if (gateway) {
      // A gateway timeout: the browser gets 504, while the identical request still reaches the Worker
      // (from this test, with the journey's identity) and keeps running there.
      gatewayRules = gatewayRules.filter((rule) => rule !== gateway);
      forwarded.push(api(request.url.split('/api/quote/')[1]!, JSON.parse(request.postData ?? '{}') as Record<string, string>));
      void complete('Fetch.fulfillRequest', requestId, { requestId, responseCode: 504, responseHeaders: [{ name: 'Content-Type', value: 'text/plain' }], body: Buffer.from('Gateway Timeout').toString('base64') });
      return;
    }
    const headers = Object.entries({ ...request.headers, 'CF-Connecting-IP': identityOf(token) }).map(([name, value]) => ({ name, value: String(value) }));
    void complete('Fetch.continueRequest', requestId, { requestId, headers });
  } else if (request.url.startsWith(`${site}/`)) {
    void complete('Fetch.continueRequest', requestId, { requestId });
  } else {
    blocked.push(`${request.method} ${request.url}`);
    void complete('Fetch.failRequest', requestId, { requestId, errorReason: 'BlockedByClient' });
  }
});
/** The customer-API changes the page sent since `requests` was last cleared (views excluded), parsed. */
const mutationsSent = (): Mutation[] =>
  requests
    .filter((r) => r.url.startsWith(`${site}/api/quote/`) && !r.url.endsWith('/api/quote/view'))
    .map((r) => ({ action: r.url.slice(`${site}/api/quote/`.length), fields: JSON.parse(r.body) as Record<string, unknown> }));
await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');
await send('Network.enable'); // only for the cancellation reports above
await send('Fetch.enable', {
  patterns: [
    { urlPattern: '*', requestStage: 'Request' },
    { urlPattern: '*/api/quote/*', requestStage: 'Response' },
  ],
});
async function open(url: string, { js = true, width = 1280, fontSize = 16 } = {}) {
  await send('Emulation.setScriptExecutionDisabled', { value: !js });
  await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 800 });
  await send('Page.setFontSizes', { fontSizes: { standard: fontSize, fixed: Math.round(fontSize * 0.8125) } });
  await send('Page.navigate', { url });
  await waitFor(() => evaluate<boolean>(`document.readyState === 'complete' && location.href !== 'about:blank'`), `load ${url}`);
}
const visible = (selector: string) => evaluate<boolean>(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); return !!el && el.checkVisibility(); })()`);
const text = (selector: string) => evaluate<string>(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? ''`);
const click = (selector: string) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
const key = async (keyName: string, code = keyName, keyCode = 0) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: keyName, code, windowsVirtualKeyCode: keyCode, text: keyName === 'Enter' ? '\r' : undefined });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: keyName, code, windowsVirtualKeyCode: keyCode });
};

// ---- 5. Scenarios ---------------------------------------------------------------------
// Harness self-checks first (Codex consolidated review, findings 6 and 7): the assertions the
// scenarios rely on must fail on what they exist to catch.
await scenario('Harness: identity assertions reject a different action, token, version, outcome or attempt id, and a wrong retry count', async () => {
  const original: Mutation = { action: 'simulate', fields: { token: 'v1.token', version: '3', method: 'card', outcome: 'success', attempt_id: 'attempt-1' } };
  const reordered: Mutation = { action: 'simulate', fields: { attempt_id: 'attempt-1', outcome: 'success', method: 'card', version: '3', token: 'v1.token' } };
  expectSameMutation([original, reordered], original, 2, 'the identical request (key order ignored)'); // must pass
  const changed = (fields: Record<string, unknown>, action = 'simulate'): Mutation => ({ action, fields: { ...original.fields, ...fields } });
  const wrong: [string, Mutation[]][] = [
    ['another action', [original, changed({}, 'accept')]],
    ['another token', [original, changed({ token: 'v1.other' })]],
    ['another version', [original, changed({ version: '4' })]],
    ['another outcome', [original, changed({ outcome: 'failure' })]],
    ['another attempt id', [original, changed({ attempt_id: 'attempt-2' })]],
    ['an extra field', [original, changed({ extra: 'x' })]],
    ['one retry too many', [original, original, original]],
    ['no retry', [original]],
  ];
  for (const [label, sent] of wrong) {
    let refused = false;
    try {
      expectSameMutation(sent, original, 2, label);
    } catch {
      refused = true;
    }
    if (!refused) throw new Error(`accepted ${label}`);
  }
  // The comparison that hid these before: two different Sets stringify alike ({}), so it must be refused.
  let refused = false;
  try {
    expectEqual(new Set([identity(original)]), new Set([identity(changed({ attempt_id: 'attempt-2' }))]), 'Set comparison');
  } catch (error) {
    refused = /compare arrays, not a Set or Map/.test(String(error));
  }
  expectEqual(refused, true, 'a Set comparison is refused');
});

await scenario('Harness: a cancelled interception is tolerated only for its exact error, while outstanding, with a browser-reported cancellation; unknown, retired ids and other errors fail', async () => {
  await open(`${site}/quote/`);
  stallRule = (url) => url === `${site}/__test/stall-probe`;
  try {
    await evaluate(`void fetch('/__test/stall-probe').catch(() => {})`);
    await waitFor(async () => stalled.length === 1, 'probe request paused');
  } finally {
    stallRule = null;
  }
  const [probe] = stalled.splice(0);
  await reloadPage(); // the browser cancels the paused probe request
  const before = harnessErrors.length;
  const mustFail = (method: string, id: string, params: object) =>
    send(method, params).then(
      () => {
        throw new Error(`${method} succeeded on ${id}`);
      },
      interceptionError(method, id),
    );
  // 1. The exact error, for the tracked id whose document the browser replaced: tolerated.
  await mustFail('Fetch.continueRequest', probe!, { requestId: probe });
  // 1b. The same for a request the page aborted itself (reported as cancelled, no navigation).
  stallRule = (url) => url === `${site}/__test/stall-probe`;
  try {
    await evaluate(`window.__probe = new AbortController(); void fetch('/__test/stall-probe', { signal: __probe.signal }).catch(() => {})`);
    await waitFor(async () => stalled.length === 1, 'second probe request paused');
  } finally {
    stallRule = null;
  }
  const [aborted] = stalled.splice(0);
  await evaluate(`__probe.abort()`);
  await waitFor(async () => cancelledByBrowser.has(networkIdOf.get(aborted!) ?? ''), 'the browser reports the abort');
  await mustFail('Fetch.continueRequest', aborted!, { requestId: aborted });
  await settleInterceptions();
  expectEqual(harnessErrors.slice(before), [], 'both confirmed cancellations are tolerated');
  // 2. The same error for an id that was never paused: a harness error.
  await mustFail('Fetch.continueRequest', 'interception-job-999999.0', { requestId: 'interception-job-999999.0' });
  // 3. Another error for the tracked id: a harness error.
  await mustFail('Fetch.failRequest', probe!, { requestId: probe, errorReason: 'NotAReason' });
  // 4. A completed (retired) interception, then a navigation: the navigation does not excuse the error.
  stallRule = (url) => url === `${site}/__test/stall-probe`;
  try {
    await evaluate(`void fetch('/__test/stall-probe').catch(() => {})`);
    await waitFor(async () => stalled.length === 1, 'third probe request paused');
  } finally {
    stallRule = null;
  }
  const [retired] = stalled.splice(0);
  await complete('Fetch.continueRequest', retired!, { requestId: retired });
  expectEqual(outstanding.has(retired!), false, 'a completed interception is retired');
  await reloadPage();
  await mustFail('Fetch.continueRequest', retired!, { requestId: retired });
  await settleInterceptions();
  const caught = harnessErrors.splice(before); // expected here; removed so this scenario passes only if all three were caught
  expectEqual(caught.length, 3, `all caught: ${caught.join(' / ')}`);
  if (!caught[0]!.startsWith(`Fetch.continueRequest interception-job-999999.0: Fetch.continueRequest: ${CANCELLED}`)) throw new Error(`unknown id: ${caught[0]}`);
  if (!caught[1]!.startsWith(`Fetch.failRequest ${probe}: `) || caught[1]!.includes(CANCELLED)) throw new Error(`other error: ${caught[1]}`);
  if (!caught[2]!.startsWith(`Fetch.continueRequest ${retired}: Fetch.continueRequest: ${CANCELLED} (not an outstanding interception)`)) throw new Error(`retired id: ${caught[2]}`);
});

const customer = { name: 'TEST Customer Browser', email: 'customer-browser@example.test' };
let link = '';
await scenario('Request → owner approval → prepared invitation (manual email: nothing sent, even by a scheduled run)', async () => {
  await open(`${site}/contact/quotation/`);
  await evaluate(`(() => {
    const form = document.querySelector('[data-inquiry-form]');
    const values = { name: ${JSON.stringify(customer.name)}, email: ${JSON.stringify(customer.email)}, organization: 'TEST ONLY organization', organization_type: 'other', project_need: 'TEST ONLY: end-to-end check' };
    for (const [name, value] of Object.entries(values)) form.elements.namedItem(name).value = value;
    form.querySelector('#inquiry-privacy_ack').click();
    form.requestSubmit();
  })()`);
  await waitFor(() => visible('[data-confirmation]'), 'request confirmation');
  const reference = await text('[data-confirm-reference]');
  // Owner, in the browser (native forms, owner origin): request -> draft -> confirmation -> approve.
  await open(`${ownerSite}/`, { js: false });
  await evaluate(`[...document.querySelectorAll('a')].find((a) => a.textContent === ${JSON.stringify(reference)}).click()`);
  await waitFor(() => evaluate<boolean>(`!!document.querySelector('#scope')`), 'owner request page');
  await evaluate(`(() => { document.querySelector('#scope').value = 'TEST ONLY: scope for the end-to-end check.'; document.querySelector('#amount').value = '2,990'; document.querySelector('form button[type=submit]').click(); })()`);
  await waitFor(() => evaluate<boolean>(`location.pathname.endsWith('/confirm') && !!document.querySelector('h1')`), 'owner confirmation');
  await evaluate(`document.querySelector('form button[type=submit]').click()`);
  await waitFor(() => evaluate<boolean>(`!location.pathname.endsWith('/confirm') && document.body.textContent.includes('approved')`), 'approved');
  // The owner page (scripts still off) shows the prepared invitation as plain, selectable fields.
  const shown = await evaluate<{ to: string; subject: string; text: string; link: string; mailto: string; copyHidden: boolean }>(`({
    to: document.querySelector('#invitation-to').value,
    subject: document.querySelector('#invitation-subject').value,
    text: document.querySelector('#invitation-text').value,
    link: document.querySelector('#invitation-link').value,
    mailto: document.querySelector('a.button-link').getAttribute('href'),
    copyHidden: document.querySelector('[data-copy]').hidden,
  })`);
  expectEqual([shown.to, shown.subject.startsWith('Your BuildTrack quotation BT-Q-'), shown.copyHidden], [customer.email, true, true], 'prepared invitation (no script)');
  if (!new RegExp(`^${site.replace(/\./g, '\\.')}/quote/#t=v1\\.[A-Za-z0-9_-]{43}$`).test(shown.link)) throw new Error('unexpected link form');
  if (!shown.text.includes(shown.link) || !shown.text.includes('BuildTrack is an academic project')) throw new Error('invitation text');
  expectEqual(shown.mailto.startsWith(`mailto:${customer.email.replace('@', '@')}?subject=Your%20BuildTrack%20quotation%20BT-Q-`), true, 'mailto');
  // A scheduled run sends nothing in manual mode: the mock provider captures no email at all.
  await runScheduled();
  expectEqual(await invitations(), [], 'nothing emailed by BuildTrack');
  // With scripts on, "Copy quotation link" copies (or selects) the link and says nothing was sent; no request is made.
  const before = requests.length;
  await open(await evaluate<string>('location.href'));
  await waitFor(() => visible('[data-copy="invitation-link"]'), 'copy buttons shown by the script');
  await click('[data-copy="invitation-link"]');
  await waitFor(async () => (await text('#copy-status')) !== '', 'copy status');
  const status = await text('#copy-status');
  if (!/Nothing has been sent\.$/.test(status)) throw new Error(`copy status: ${status}`);
  expectEqual(requests.slice(before).filter((r) => r.method !== 'GET').length, 0, 'copying makes no request');
  link = shown.link;
});

await scenario('Customer opens the link: fragment removed at once, approved values shown, Origin kept under no-referrer', async () => {
  requests.length = 0;
  await open(link);
  await waitFor(() => visible('[data-q-quote]'), 'quotation shown');
  expectEqual(await evaluate(`location.href`), `${site}/quote/`, 'address bar after the exchange');
  for (const [selector, expected] of [
    ['[data-q-scope]', 'TEST ONLY: scope for the end-to-end check.'],
    ['[data-q-amount]', '₱2,990.00 (PHP)'],
  ] as const) {
    expectEqual(await text(selector), expected, selector);
  }
  if (!(await text('[data-q-greeting]')).startsWith('Hello TEST,')) throw new Error('greeting');
  if (!/^BT-Q-\d{4}-\d{4}$/.test(await text('[data-q-ref]'))) throw new Error('reference');
  if (!(await visible('[data-q-disclosure]'))) throw new Error('no-real-payment disclosure not visible');
  const token = tokenOf(link);
  const view = requests.find((r) => r.url === `${site}/api/quote/view`);
  if (!view) throw new Error('no view request');
  expectEqual([view.method, view.headers.Origin ?? view.headers.origin], ['POST', site], 'view POST and its Origin (page sends Referrer-Policy: no-referrer)');
  if (!view.body.includes(token)) throw new Error('token not in the POST body');
  if (requests.some((r) => r.url.includes(token))) throw new Error('token appeared in a request URL');
  const shell = await fetch(`${site}/quote/`);
  expectEqual(
    [shell.headers.get('cache-control'), shell.headers.get('referrer-policy'), shell.headers.get('x-robots-tag')],
    ['no-store', 'no-referrer', 'noindex'],
    'shell headers',
  );
  if (!/script-src 'self'( 'sha256-[A-Za-z0-9+/=]+')+/.test(shell.headers.get('content-security-policy') ?? '')) throw new Error('shell CSP');
});

await scenario('Reload keeps the quotation (same tab), and viewing changed nothing', async () => {
  await send('Page.reload');
  await waitFor(() => evaluate<boolean>(`document.readyState === 'complete'`), 'reload');
  await waitFor(() => visible('[data-q-quote]'), 'quotation after reload');
  expectEqual(await visible('[data-q-decision]'), true, 'still open: viewing never accepts');
});

await scenario('Accept: explicit confirmation, then accepted; the checkout appears', async () => {
  await click('[data-q-ask="accept"]');
  await waitFor(() => visible('[data-q-confirm]'), 'confirmation');
  const question = await text('[data-q-confirm-text]');
  if (!/^Accept quotation BT-Q-\d{4}-\d{4} for ₱2,990\.00\? BuildTrack is an academic project; no payment is due\.$/.test(question)) throw new Error(`question: ${question}`);
  expectEqual(await evaluate(`document.activeElement === document.querySelector('[data-q-confirm-text]')`), true, 'focus on the question');
  await click('[data-q-confirm-yes]');
  await waitFor(() => visible('[data-q-checkout]'), 'checkout');
  if (!(await text('[data-q-answer]')).startsWith('You accepted this quotation.')) throw new Error('answer');
  expectEqual(await visible('[data-q-decision]'), false, 'no decision buttons after accepting');
});

await scenario('Simulated checkout: demo code checked locally only; result labelled simulated; code never sent', async () => {
  requests.length = 0;
  await click('[data-q-method="card"]');
  await waitFor(() => visible('[data-q-code]'), 'code step');
  const label = await evaluate<string>(`document.querySelector('label[for="q-demo-code"]').textContent`);
  expectEqual(label, 'Demo code — enter 12345678', 'label');
  expectEqual(
    await evaluate(`(() => { const i = document.querySelector('[data-q-code]'); return [i.type, i.inputMode, i.autocomplete, i.spellcheck, i.maxLength, i.hasAttribute('name'), !!i.closest('form')]; })()`),
    ['text', 'numeric', 'off', false, 8, false, false],
    'field markup',
  );
  await evaluate(`document.querySelector('[data-q-code]').value = '11112222'`);
  await click('[data-q-check]');
  expectEqual(await evaluate(`document.querySelector('[data-q-code]').getAttribute('aria-invalid')`), 'true', 'wrong code flagged');
  expectEqual(await text('[data-q-code-error]'), 'That is not the demo code. Use the sample code 12345678.', 'error text');
  await click('[data-q-sample]');
  expectEqual(await evaluate(`document.querySelector('[data-q-code]').value`), '12345678', 'sample filled');
  await click('[data-q-check]');
  await waitFor(() => visible('[data-q-outcome="success"]'), 'outcome step');
  expectEqual(await evaluate(`document.querySelector('[data-q-code]').value`), '', 'field cleared after the check');
  await click('[data-q-outcome="success"]');
  await waitFor(() => visible('[data-q-result-title]'), 'result');
  expectEqual(await text('[data-q-result-title]'), 'Simulated success', 'title');
  if (!(await text('[data-q-checkout] .disclaimer')).includes(resultDisclaimer)) throw new Error('disclaimer missing');
  for (const r of requests) {
    if (JSON.stringify(r).includes('12345678') || JSON.stringify(r).includes('11112222')) throw new Error(`a request carried the demo code: ${r.method} ${r.url}`);
  }
  const simulate = requests.find((r) => r.url === `${site}/api/quote/simulate`)!;
  expectEqual(Object.keys(JSON.parse(simulate.body)).sort(), ['attempt_id', 'method', 'outcome', 'token', 'version'], 'simulate body fields');
  await click('[data-q-restart]');
  await click('[data-q-method="bank"]');
  expectEqual(await evaluate(`document.querySelector('[data-q-code]').value`), '', 'field empty after Start over');
  await click('[data-q-back]');
  expectEqual(await visible('[data-q-history]'), true, 'history shown');
});

await scenario('Without JavaScript: only the explanation shows; no request is made', async () => {
  requests.length = 0;
  await open(`${site}/quote/`, { js: false });
  expectEqual(await evaluate(`document.querySelector('noscript') !== null && document.body.textContent.includes('JavaScript is needed to open this quotation')`), true, 'noscript text');
  expectEqual(await visible('[data-q-quote]'), false, 'no quotation');
  expectEqual(requests.filter((r) => r.url.includes('/api/')).length, 0, 'no API request');
});

await scenario('Missing and invalid links show clear messages', async () => {
  await open(`${site}/quote/`);
  await evaluate(`sessionStorage.clear()`);
  await open(`${site}/quote/`);
  await waitFor(() => visible('[data-q-problem]'), 'problem');
  if (!(await text('[data-q-problem-text]')).startsWith('Open the quotation link from your BuildTrack email')) throw new Error('missing-link text');
  await open(`${site}/quote/#t=v1.${'A'.repeat(43)}`);
  await waitFor(() => visible('[data-q-problem]'), 'invalid');
  if (!(await text('[data-q-problem-text]')).startsWith('This quotation link is not valid.')) throw new Error('invalid text');
  expectEqual(await evaluate(`location.href`), `${site}/quote/`, 'fragment removed even when invalid');
});

const second = { name: 'TEST Customer Keyboard', email: 'test-customer-keyboard@example.test' };
await scenario('Keyboard: decline by keyboard with visible focus; mobile 390 px and 320 px at 32 px fit', async () => {
  const reference = await httpRequest(second.name);
  await ownerApprove(reference);
  const secondLink = await preparedLink(reference);
  await open(secondLink, { width: 390 });
  await waitFor(() => visible('[data-q-decision]'), 'decision');
  expectEqual(await evaluate(`document.documentElement.scrollWidth - document.documentElement.clientWidth`), 0, 'overflow at 390 px');
  await evaluate(`document.activeElement?.blur(); window.scrollTo(0, 0)`);
  const stops: string[] = [];
  for (let i = 0; i < 40 && !stops.includes('Decline quotation'); i++) {
    await key('Tab', 'Tab', 9);
    const stop = await evaluate<{ label: string; outline: string }>(`(() => { const el = document.activeElement; return { label: (el.textContent || '').trim(), outline: getComputedStyle(el).outlineStyle }; })()`);
    stops.push(stop.label);
    if (stop.label === 'Decline quotation' && stop.outline === 'none') throw new Error('no focus outline on Decline');
  }
  if (!stops.includes('Accept quotation') || !stops.includes('Decline quotation')) throw new Error(`Tab stops: ${stops.join(' | ')}`);
  await key('Enter', 'Enter', 13);
  await waitFor(() => visible('[data-q-confirm]'), 'decline confirmation');
  expectEqual(await evaluate(`document.activeElement === document.querySelector('[data-q-confirm-text]')`), true, 'focus moved to the question');
  await key('Tab', 'Tab', 9);
  expectEqual(await evaluate(`document.activeElement === document.querySelector('[data-q-confirm-yes]')`), true, 'Tab to Yes');
  await key('Enter', 'Enter', 13);
  await waitFor(async () => (await text('[data-q-answer]')).startsWith('You declined this quotation.'), 'declined');
  expectEqual(await visible('[data-q-checkout]'), false, 'no checkout after declining');
  await open(secondLink, { width: 320, fontSize: 32 });
  await waitFor(() => visible('[data-q-quote]'), 'shown at 320 px');
  expectEqual(await evaluate(`document.documentElement.scrollWidth - document.documentElement.clientWidth`), 0, 'overflow at 320 px / 32 px');
});

const third = { name: 'TEST Customer Races', email: 'test-customer-races@example.test' };
let thirdToken = '';
await scenario('Races (HTTP): concurrent acceptances and simulated outcomes record once', async () => {
  const thirdRef = await httpRequest(third.name);
  await ownerApprove(thirdRef);
  thirdToken = tokenOf(await preparedLink(thirdRef));
  const view = (await (await api('view', { token: thirdToken })).json()) as { view: { version: number } };
  const accepts = await Promise.all(Array.from({ length: 6 }, () => api('accept', { token: thirdToken, version: String(view.view.version) })));
  expectEqual(accepts.map((r) => r.status), Array(6).fill(200), 'accept statuses');
  const repeated = await Promise.all(accepts.map(async (r) => ((await r.json()) as { repeated: boolean }).repeated));
  expectEqual(repeated.filter((r) => !r).length, 1, 'one acceptance made');
  const attempt = crypto.randomUUID();
  const sims = await Promise.all(Array.from({ length: 5 }, () => api('simulate', { token: thirdToken, version: String(view.view.version + 1), method: 'bank', outcome: 'failure', attempt_id: attempt })));
  expectEqual(sims.map((r) => r.status), Array(5).fill(200), 'simulate statuses');
  const crossSite = await api('accept', { token: thirdToken, version: String(view.view.version) }, { Origin: ownerSite });
  expectEqual(crossSite.status, 403, 'owner origin refused on the customer API');
  expectEqual(crossSite.headers.get('access-control-allow-origin'), null, 'no CORS');
});

const fourth = { name: 'TEST Customer Links', email: 'test-customer-links@example.test' };
let fourthToken = '';
await scenario('Prepare a link to revoke (state changed later with the server stopped)', async () => {
  const fourthRef = await httpRequest(fourth.name);
  await ownerApprove(fourthRef);
  fourthToken = tokenOf(await preparedLink(fourthRef));
  expectEqual((await api('view', { token: fourthToken })).status, 200, 'works before');
});


// ---- Checkpoint 4 review regressions -------------------------------------------------------
type Fixture = { token: string; ref: string; expiresAt: number; link: string };
const fixture = async (ms = 24 * 3600 * 1000, status: 'approved' | 'accepted' = 'approved') =>
  (await (await fetch(`${site}/__test/fixture?ms=${ms}&status=${status}`)).json()) as Fixture;
const quoteState = async (ref: string) =>
  (await (await fetch(`${site}/__test/state?ref=${encodeURIComponent(ref)}`)).json()) as { status: string; events: number; simulations: number };
const shownRef = () => text('[data-q-ref]');
const waitShown = (ref: string) => waitFor(async () => (await visible('[data-q-quote]')) && (await shownRef()) === ref, `quotation ${ref} shown`);
const isFor = (action: string, token: string) => (r: { url: string; body: string }) => r.url.endsWith(`/api/quote/${action}`) && r.body.includes(token);
const once = (rule: (r: { url: string; body: string }) => boolean, decision: 'hold' | 'fail'): ResponseRule => {
  let used = false;
  return (r) => (!used && rule(r) ? ((used = true), decision) : null);
};
async function goTo(url: string) {
  // Same-tab navigation; between /quote/ links only the fragment changes (no reload).
  await send('Page.navigate', { url });
  await sleep(100);
}
async function acceptOnPage() {
  await click('[data-q-ask="accept"]');
  await waitFor(() => visible('[data-q-confirm]'), 'confirmation');
  await click('[data-q-confirm-yes]');
}

await scenario('Finding 1: a delayed view response for link A never replaces link B opened meanwhile', async () => {
  const a = await fixture();
  const b = await fixture();
  responseRules = [once(isFor('view', a.token), 'hold')];
  await open(link); // start from a known page
  await goTo(a.link);
  await waitFor(async () => heldResponses.length === 1, 'A held');
  await goTo(b.link);
  await waitShown(b.ref);
  await releaseHeld();
  await sleep(600);
  expectEqual(await shownRef(), b.ref, 'still B after A was released');
  expectEqual(await visible('[data-q-decision]'), true, 'B still open for a decision');
  responseRules = [];
});

await scenario('Finding 1: a delayed acceptance response for A cannot change B; A itself was accepted', async () => {
  const a = await fixture();
  const b = await fixture();
  await goTo(a.link);
  await waitShown(a.ref);
  responseRules = [once(isFor('accept', a.token), 'hold')];
  await acceptOnPage();
  await waitFor(async () => heldResponses.length === 1, 'accept response held');
  await goTo(b.link);
  await waitShown(b.ref);
  await releaseHeld();
  await sleep(600);
  expectEqual([await shownRef(), await visible('[data-q-decision]'), await visible('[data-q-checkout]')], [b.ref, true, false], 'B unchanged');
  expectEqual((await quoteState(b.ref)).status, 'approved', 'B not accepted');
  expectEqual((await quoteState(a.ref)).status, 'accepted', 'A accepted on the server');
  await goTo(a.link);
  await waitShown(a.ref);
  if (!(await text('[data-q-answer]')).startsWith('You accepted')) throw new Error('A reopened does not show its acceptance');
  responseRules = [];
});

await scenario('Finding 1: rapid link changes A → B → A with B delayed end on A', async () => {
  const a = await fixture();
  const b = await fixture();
  await goTo(a.link);
  await waitShown(a.ref);
  responseRules = [once(isFor('view', b.token), 'hold')];
  await goTo(b.link);
  await goTo(a.link);
  await waitShown(a.ref);
  await waitFor(async () => heldResponses.length === 1, 'B held');
  await releaseHeld();
  await sleep(600);
  expectEqual(await shownRef(), a.ref, 'still A');
  responseRules = [];
});

await scenario('Finding 4: explicit invalid fragments show an error, close the confirmation, and never reopen an earlier quotation', async () => {
  const a = await fixture();
  const b = await fixture();
  for (const bad of ['not-a-token', `${a.token}#t=${b.token}`, `v1.${'%41'.repeat(43)}`, `${a.token}&x=1`]) {
    await goTo(a.link);
    await waitShown(a.ref);
    await click('[data-q-ask="accept"]');
    await waitFor(() => visible('[data-q-confirm]'), 'confirmation open');
    requests.length = 0;
    await goTo(`${site}/quote/#t=${bad}`);
    await waitFor(() => visible('[data-q-problem]'), `error for ${bad.slice(0, 12)}`);
    if (!(await text('[data-q-problem-text]')).startsWith('This quotation link is incomplete or not valid.')) throw new Error(`text for ${bad.slice(0, 12)}`);
    expectEqual([await visible('[data-q-quote]'), await visible('[data-q-confirm]')], [false, false], 'earlier view and confirmation gone');
    await click('[data-q-confirm-yes]'); // even a scripted click on the hidden button sends nothing
    await sleep(300);
    expectEqual(requests.filter((r) => r.url.includes('/api/quote/accept')).length, 0, 'no acceptance sent');
    await open(`${site}/quote/`); // reload: the earlier link must not reopen
    await waitFor(() => visible('[data-q-problem]'), 'after reload');
    if (!(await text('[data-q-problem-text]')).startsWith('Open the quotation link from your BuildTrack email')) throw new Error('an earlier quotation reopened after reload');
  }
  // A well-formed but unknown token: the server says so; the earlier link is not reopened either.
  await goTo(a.link);
  await waitShown(a.ref);
  await goTo(`${site}/quote/#t=v1.${'Z'.repeat(43)}`);
  await waitFor(() => visible('[data-q-problem]'), 'unknown token');
  if (!(await text('[data-q-problem-text]')).startsWith('This quotation link is not valid.')) throw new Error('unknown token text');
  await open(`${site}/quote/`);
  await waitFor(() => visible('[data-q-problem]'), 'unknown after reload');
  expectEqual((await quoteState(a.ref)).status, 'approved', 'A untouched');
});

await scenario('Finding 5: a lost response after a committed acceptance shows uncertainty; Check again reconciles once', async () => {
  const c = await fixture();
  await goTo(c.link);
  await waitShown(c.ref);
  requests.length = 0;
  responseRules = [once(isFor('accept', c.token), 'fail')];
  await acceptOnPage();
  await waitFor(() => visible('[data-q-retry]'), 'Check again offered');
  const said = await text('[data-q-status]');
  if (!said.includes('could not confirm whether your acceptance was recorded') || /Nothing was sent/.test(said)) throw new Error(`status: ${said}`);
  expectEqual(await quoteState(c.ref), { status: 'accepted', accepted_at: (await quoteState(c.ref) as any).accepted_at, declined_at: null, events: 1, simulations: 0 }, 'committed once');
  await click('[data-q-retry]');
  await waitFor(async () => (await text('[data-q-answer]')).startsWith('You accepted'), 'reconciled');
  const accepts = requests.filter((r) => r.url.endsWith('/api/quote/accept'));
  expectEqual(accepts.length, 2, 'the identical request repeated once');
  expectEqual(accepts[0]!.body, accepts[1]!.body, 'same token and version');
  expectEqual((await quoteState(c.ref)).events, 1, 'still one acceptance');
  responseRules = [];
});

await scenario('Finding 5: a lost response after a committed decline reconciles the same way', async () => {
  const d = await fixture();
  await goTo(d.link);
  await waitShown(d.ref);
  responseRules = [once(isFor('decline', d.token), 'fail')];
  await click('[data-q-ask="decline"]');
  await waitFor(() => visible('[data-q-confirm]'), 'confirmation');
  await click('[data-q-confirm-yes]');
  await waitFor(() => visible('[data-q-retry]'), 'Check again offered');
  if (!(await text('[data-q-status]')).includes('could not confirm whether your decline was recorded')) throw new Error('decline uncertainty text');
  await click('[data-q-retry]');
  await waitFor(async () => (await text('[data-q-answer]')).startsWith('You declined'), 'reconciled');
  expectEqual([(await quoteState(d.ref)).status, (await quoteState(d.ref)).events], ['declined', 1], 'one decline');
  responseRules = [];
});

await scenario('Finding 5: a lost response after a recorded simulated outcome reconciles with the same attempt', async () => {
  const e = await fixture(24 * 3600 * 1000, 'accepted');
  await goTo(e.link);
  await waitShown(e.ref);
  await waitFor(() => visible('[data-q-checkout]'), 'checkout');
  await click('[data-q-method="card"]');
  await click('[data-q-sample]');
  await click('[data-q-check]');
  await waitFor(() => visible('[data-q-outcome="success"]'), 'outcome step');
  requests.length = 0;
  responseRules = [once(isFor('simulate', e.token), 'fail')];
  await click('[data-q-outcome="success"]');
  await waitFor(() => visible('[data-q-retry]'), 'Check again offered');
  if (!(await text('[data-q-status]')).includes('could not confirm whether this simulated result was recorded')) throw new Error('simulate uncertainty text');
  await click('[data-q-retry]');
  await waitFor(async () => (await text('[data-q-result-title]')) === 'Simulated success', 'reconciled');
  const sims = requests.filter((r) => r.url.endsWith('/api/quote/simulate')).map((r) => JSON.parse(r.body).attempt_id);
  expectEqual([sims.length, sims[0] === sims[1]], [2, true], 'same attempt id repeated');
  expectEqual((await quoteState(e.ref)).simulations, 1, 'recorded once');
  responseRules = [];
});

await scenario('Finding 5: while a decision is pending, a second Yes sends nothing', async () => {
  const f = await fixture();
  await goTo(f.link);
  await waitShown(f.ref);
  requests.length = 0;
  responseRules = [once(isFor('accept', f.token), 'hold')];
  await click('[data-q-ask="accept"]');
  await waitFor(() => visible('[data-q-confirm]'), 'confirmation');
  await evaluate(`(() => { const b = document.querySelector('[data-q-confirm-yes]'); b.click(); b.disabled = false; b.click(); b.click(); })()`);
  await waitFor(async () => heldResponses.length === 1, 'held');
  await releaseHeld();
  await waitFor(async () => (await text('[data-q-answer]')).startsWith('You accepted'), 'accepted');
  expectEqual(requests.filter((r) => r.url.endsWith('/api/quote/accept')).length, 1, 'one acceptance request');
  responseRules = [];
});

/** Fires a mutation that the Worker holds between its check and its write; returns its eventual response. */
async function heldMutation(action: 'accept' | 'simulate', fields: Record<string, string>, change: () => Promise<void>) {
  await fetch(`${site}/__test/pause?action=${action}`);
  const pendingResponse = api(action, fields);
  await waitFor(async () => ((await (await fetch(`${site}/__test/paused?action=${action}`)).json()) as { held: number }).held === 1, `${action} held at the write`);
  await change();
  await fetch(`${site}/__test/release?action=${action}`);
  const response = await pendingResponse;
  return { status: response.status, error: ((await response.json()) as { error?: string }).error };
}

await scenario('Findings 2 and 6 (real D1): expiry during a delayed acceptance leaves no acceptance or event', async () => {
  const g = await fixture(4000);
  const view = (await (await api('view', { token: g.token })).json()) as { view: { version: number } };
  const result = await heldMutation('accept', { token: g.token, version: String(view.view.version) }, async () => {
    while (Date.now() <= g.expiresAt + 300) await sleep(100);
  });
  expectEqual(result, { status: 410, error: 'expired' }, 'refused at the write');
  expectEqual(await quoteState(g.ref), { status: 'approved', accepted_at: null, declined_at: null, events: 0, simulations: 0 }, 'nothing recorded');
});

await scenario('Findings 2 and 6 (real D1): expiry during a delayed simulated checkout leaves no row', async () => {
  const h = await fixture(4000, 'accepted');
  const result = await heldMutation('simulate', { token: h.token, version: '2', method: 'card', outcome: 'success', attempt_id: crypto.randomUUID() }, async () => {
    while (Date.now() <= h.expiresAt + 300) await sleep(100);
  });
  expectEqual(result, { status: 410, error: 'expired' }, 'refused at the write');
  expectEqual((await quoteState(h.ref)).simulations, 0, 'no simulated row');
});

await scenario('Finding 2 (real D1): revocation during a delayed acceptance or simulated checkout records nothing', async () => {
  const i = await fixture();
  const view = (await (await api('view', { token: i.token })).json()) as { view: { version: number } };
  const accept = await heldMutation('accept', { token: i.token, version: String(view.view.version) }, async () => void (await fetch(`${site}/__test/revoke?ref=${i.ref}`)));
  expectEqual(accept, { status: 410, error: 'revoked' }, 'acceptance refused');
  expectEqual([(await quoteState(i.ref)).status, (await quoteState(i.ref)).events], ['approved', 0], 'no acceptance or event');
  const j = await fixture(24 * 3600 * 1000, 'accepted');
  const simulate = await heldMutation('simulate', { token: j.token, version: '2', method: 'bank', outcome: 'success', attempt_id: crypto.randomUUID() }, async () => void (await fetch(`${site}/__test/revoke?ref=${j.ref}`)));
  expectEqual(simulate, { status: 410, error: 'revoked' }, 'simulation refused');
  expectEqual((await quoteState(j.ref)).simulations, 0, 'no simulated row');
});

await scenario('Finding 6 (real runtime): an expired link says so, in the API and on the page', async () => {
  const k = await fixture(1500);
  while (Date.now() <= k.expiresAt + 200) await sleep(100);
  const response = await api('view', { token: k.token });
  expectEqual([response.status, ((await response.json()) as { error: string }).error], [410, 'expired'], 'API');
  await goTo(k.link);
  await waitFor(() => visible('[data-q-problem]'), 'expired page');
  if (!(await text('[data-q-problem-text]')).startsWith('This quotation link has expired.')) throw new Error('expired text');
});

await scenario('Finding 3 (real runtime): reusing a checkout attempt with a different choice is a 409 and changes nothing', async () => {
  const l = await fixture(24 * 3600 * 1000, 'accepted');
  const attempt = crypto.randomUUID();
  expectEqual((await api('simulate', { token: l.token, version: '2', method: 'card', outcome: 'success', attempt_id: attempt })).status, 200, 'first');
  const conflict = await api('simulate', { token: l.token, version: '2', method: 'bank', outcome: 'failure', attempt_id: attempt });
  expectEqual([conflict.status, ((await conflict.json()) as { error: string }).error], [409, 'conflict'], 'conflict');
  const same = await api('simulate', { token: l.token, version: '2', method: 'card', outcome: 'success', attempt_id: attempt });
  expectEqual([same.status, ((await same.json()) as { outcome: string }).outcome], [200, 'success'], 'identical repeat returns the original');
  expectEqual((await quoteState(l.ref)).simulations, 1, 'one row');
});


// ---- Checkpoint 4 second review regressions ------------------------------------------------
const replaceOnce = (rule: (r: { url: string; body: string }) => boolean, replace: (original: string) => string): ResponseRule => {
  let used = false;
  return (r) => (!used && rule(r) ? ((used = true), { replace }) : null);
};

for (const [label, replace] of [
  ['an interrupted body', (o: string) => o.slice(0, Math.floor(o.length / 2))],
  ['invalid JSON', () => 'not json'],
  ['an empty object', () => '{}'],
  ['a mismatched shape', () => JSON.stringify({ view: { status: 'accepted' }, repeated: false })],
] as const) {
  await scenario(`Finding 1 (second review): ${label} with HTTP 200 after a committed acceptance is uncertain; Check again reconciles`, async () => {
    const q = await fixture();
    await goTo(q.link);
    await waitShown(q.ref);
    requests.length = 0;
    responseRules = [replaceOnce(isFor('accept', q.token), replace)];
    await acceptOnPage();
    await waitFor(() => visible('[data-q-retry]'), 'Check again offered');
    if (!(await text('[data-q-status]')).includes('could not confirm whether your acceptance was recorded')) throw new Error('not reported as uncertain');
    expectEqual([await visible('[data-q-checkout]'), (await text('[data-q-answer]')).startsWith('You accepted')], [false, false], 'not shown as accepted yet');
    expectEqual((await quoteState(q.ref)).events, 1, 'committed on the server');
    await click('[data-q-ask="accept"]'); // a new decision cannot start while unresolved
    expectEqual(await visible('[data-q-confirm]'), false, 'no new confirmation while unresolved');
    await click('[data-q-retry]');
    await waitFor(async () => (await text('[data-q-answer]')).startsWith('You accepted'), 'reconciled');
    const accepts = requests.filter((r) => r.url.endsWith('/api/quote/accept'));
    expectEqual([accepts.length, accepts[0]!.body === accepts[1]!.body], [2, true], 'one identical repeat');
    expectEqual((await quoteState(q.ref)).events, 1, 'still one acceptance');
    responseRules = [];
  });
}

await scenario('Finding 1 (second review): a mismatched simulated result is uncertain; no fresh attempt until Check again resolves it', async () => {
  const q = await fixture(24 * 3600 * 1000, 'accepted');
  await goTo(q.link);
  await waitShown(q.ref);
  await click('[data-q-method="card"]');
  await click('[data-q-sample]');
  await click('[data-q-check]');
  await waitFor(() => visible('[data-q-outcome="success"]'), 'outcome step');
  requests.length = 0;
  responseRules = [replaceOnce(isFor('simulate', q.token), (o) => JSON.stringify({ ...JSON.parse(o), outcome: 'failure' }))];
  await click('[data-q-outcome="success"]');
  await waitFor(() => visible('[data-q-retry]'), 'Check again offered');
  if (!(await text('[data-q-status]')).includes('could not confirm whether this simulated result was recorded')) throw new Error('not uncertain');
  for (const other of ['failure', 'cancelled']) await click(`[data-q-outcome="${other}"]`); // no fresh attempts
  await sleep(300);
  expectEqual(requests.filter((r) => r.url.endsWith('/api/quote/simulate')).length, 1, 'no new attempt while unresolved');
  await click('[data-q-retry]');
  await waitFor(async () => (await text('[data-q-result-title]')) === 'Simulated success', 'reconciled');
  const sims = requests.filter((r) => r.url.endsWith('/api/quote/simulate')).map((r) => r.body);
  expectEqual([sims.length, sims[0] === sims[1]], [2, true], 'the identical request repeated (token, version, method, outcome, attempt)');
  expectEqual(Object.keys(JSON.parse(sims[0]!)).sort(), ['attempt_id', 'method', 'outcome', 'token', 'version'], 'fields');
  expectEqual((await quoteState(q.ref)).simulations, 1, 'recorded once');
  responseRules = [];
});

await scenario('Finding 2 (second review): an explicit empty "#" invalidates the link, confirmation and stored credentials', async () => {
  const a = await fixture();
  await goTo(a.link);
  await waitShown(a.ref);
  await click('[data-q-ask="accept"]');
  await waitFor(() => visible('[data-q-confirm]'), 'confirmation open');
  requests.length = 0;
  await goTo(`${site}/quote/#`); // same-document navigation
  await waitFor(() => visible('[data-q-problem]'), 'error');
  if (!(await text('[data-q-problem-text]')).startsWith('This quotation link is incomplete or not valid.')) throw new Error('text');
  expectEqual([await visible('[data-q-quote]'), await visible('[data-q-confirm]')], [false, false], 'view and confirmation gone');
  await click('[data-q-confirm-yes]');
  await sleep(300);
  expectEqual(requests.filter((r) => r.url.includes('/api/quote/accept')).length, 0, 'no acceptance sent');
  await open(`${site}/quote/`); // reload without a fragment: the earlier link must not come back
  await waitFor(() => visible('[data-q-problem]'), 'after reload');
  if (!(await text('[data-q-problem-text]')).startsWith('Open the quotation link from your BuildTrack email')) throw new Error('an earlier quotation reopened');
  // A fresh load of "/quote/#" (not same-document) behaves the same.
  await goTo(a.link);
  await waitShown(a.ref);
  await goTo('about:blank');
  await open(`${site}/quote/#`);
  await waitFor(() => visible('[data-q-problem]'), 'fresh load error');
  await open(`${site}/quote/`);
  await waitFor(() => visible('[data-q-problem]'), 'fresh load, then reload');
  if (!(await text('[data-q-problem-text]')).startsWith('Open the quotation link from your BuildTrack email')) throw new Error('reopened after a fresh "#"');
  expectEqual((await quoteState(a.ref)).status, 'approved', 'A untouched');
});

await scenario('Finding 5: a normal journey (open, reloads, lost answer and Check again, checkout, return) stays under the limit with one identity', async () => {
  const q = await fixture();
  requests.length = 0;
  await goTo(q.link);
  await waitShown(q.ref);
  for (let i = 0; i < 2; i++) {
    await send('Page.reload');
    await waitShown(q.ref);
  }
  responseRules = [once(isFor('accept', q.token), 'fail')];
  await acceptOnPage();
  await waitFor(() => visible('[data-q-retry]'), 'lost answer');
  await click('[data-q-retry]');
  await waitFor(() => visible('[data-q-checkout]'), 'accepted');
  await click('[data-q-method="bank"]');
  await click('[data-q-sample]');
  await click('[data-q-check]');
  await click('[data-q-outcome="cancelled"]');
  await waitFor(async () => (await text('[data-q-result-title]')) === 'Simulated cancellation', 'result');
  await send('Page.reload');
  await waitShown(q.ref);
  const journey = requests.filter((r) => r.url.includes('/api/quote/'));
  if (journey.length >= 30) throw new Error(`journey used ${journey.length} requests`);
  expectEqual(new Set(journey.map((r) => r.body.includes(q.token))).size, 1, 'all for this link');
  expectEqual((await quoteState(q.ref)), { status: 'accepted', accepted_at: (await quoteState(q.ref) as any).accepted_at, declined_at: null, events: 1, simulations: 1 }, 'recorded once each');
  responseRules = [];
});

await scenario('Finding 5: deliberate exhaustion by one journey gets 429 guidance in the API and on the page', async () => {
  const q = await fixture();
  for (let i = 0; i < 30; i++) expectEqual((await api('view', { token: q.token })).status, 200, `request ${i + 1}`);
  const refused = await api('view', { token: q.token });
  expectEqual([refused.status, refused.headers.get('retry-after')], [429, '3600'], '31st request');
  expectEqual(((await refused.json()) as { message: string }).message, 'Too many requests from this connection. Please wait an hour and try again.', 'guidance');
  await goTo(q.link); // the same journey in the browser
  await waitFor(async () => (await text('[data-q-status]')) === 'Too many requests from this connection. Please wait an hour and try again.', 'guidance on the page');
  expectEqual([await visible('[data-q-quote]'), await visible('[data-q-retry]')], [false, false], 'no quotation; not reported as uncertain');
  const other = await fixture(); // another customer's journey is unaffected
  expectEqual((await api('view', { token: other.token })).status, 200, 'another journey');
});


// ---- Checkpoint 4 third review regressions -------------------------------------------------
/** Uses up this journey's hourly allowance (the identity is the link's; see identityOf). */
async function exhaust(token: string) {
  for (let i = 0; i < 40; i++) if ((await api('view', { token })).status === 429) return;
  throw new Error('could not exhaust the allowance');
}
const setClock = (offset: number) => fetch(`${site}/__test/clock?offset=${offset}`);
const HOUR_MS = 3600 * 1000;

async function refusedRetryThenReconcile(
  q: Fixture,
  action: 'accept' | 'decline' | 'simulate',
  start: () => Promise<void>,
  done: () => Promise<boolean>,
  check: (state: { status: string; events: number; simulations: number }) => void,
) {
  requests.length = 0;
  responseRules = [once(isFor(action, q.token), 'fail')];
  await start(); // the original request commits on the server; its answer is lost
  await waitFor(() => visible('[data-q-retry]'), 'uncertain after the lost answer');
  responseRules = [];
  await exhaust(q.token);
  await click('[data-q-retry]'); // "Check again" is refused (429)
  await waitFor(async () => (await text('[data-q-status]')).includes('This check could not be completed'), 'refusal reported');
  const said = await text('[data-q-status]');
  if (!said.includes('is still unknown') || !said.includes('check again in about 60 minutes')) throw new Error(`refusal text: ${said}`);
  expectEqual(await visible('[data-q-retry]'), true, 'Check again still offered');
  // The lock holds: nothing fresh can start while the original outcome is unknown.
  if (action === 'simulate') {
    for (const other of ['failure', 'cancelled']) await click(`[data-q-outcome="${other}"]`);
  } else {
    await click('[data-q-ask="accept"]');
    await click('[data-q-ask="decline"]');
    expectEqual(await visible('[data-q-confirm]'), false, 'no new confirmation');
  }
  await sleep(300);
  const sent = requests.filter((r) => r.url.endsWith(`/api/quote/${action}`));
  expectEqual(sent.length, 2, 'only the original and the refused check were sent');
  await setClock(HOUR_MS); // the next hourly window
  try {
    await click('[data-q-retry]');
    await waitFor(done, 'reconciled after the wait');
  } finally {
    await setClock(0);
  }
  const all = requests.filter((r) => r.url.endsWith(`/api/quote/${action}`)).map((r) => r.body);
  expectEqual([all.length, new Set(all).size], [3, 1], 'the identical request three times (original, refused check, check)');
  check(await quoteState(q.ref));
}

await scenario('Finding 1 (third review): committed checkout → lost answer → allowance exhausted → refused check → next window → exactly one result', async () => {
  const q = await fixture(24 * 3600 * 1000, 'accepted');
  await goTo(q.link);
  await waitShown(q.ref);
  await click('[data-q-method="card"]');
  await click('[data-q-sample]');
  await click('[data-q-check]');
  await waitFor(() => visible('[data-q-outcome="success"]'), 'outcome step');
  await refusedRetryThenReconcile(
    q,
    'simulate',
    () => click('[data-q-outcome="success"]') as Promise<void>,
    async () => (await text('[data-q-result-title]')) === 'Simulated success',
    (state) => expectEqual(state.simulations, 1, 'exactly one simulated result'),
  );
});

await scenario('Finding 1 (third review): the same recovery for a committed acceptance', async () => {
  const q = await fixture();
  await goTo(q.link);
  await waitShown(q.ref);
  await refusedRetryThenReconcile(
    q,
    'accept',
    acceptOnPage,
    async () => (await text('[data-q-answer]')).startsWith('You accepted'),
    (state) => expectEqual([state.status, state.events], ['accepted', 1], 'exactly one acceptance'),
  );
});

await scenario('Finding 1 (third review): the same recovery for a committed decline', async () => {
  const q = await fixture();
  await goTo(q.link);
  await waitShown(q.ref);
  await refusedRetryThenReconcile(
    q,
    'decline',
    async () => {
      await click('[data-q-ask="decline"]');
      await waitFor(() => visible('[data-q-confirm]'), 'confirmation');
      await click('[data-q-confirm-yes]');
    },
    async () => (await text('[data-q-answer]')).startsWith('You declined'),
    (state) => expectEqual([state.status, state.events], ['declined', 1], 'exactly one decline'),
  );
});

/** Sends a request that the Worker holds just before its response snapshot; applies `change` meanwhile. */
async function heldRead(action: 'view' | 'accept' | 'simulate', fields: Record<string, string>, change: () => Promise<unknown>) {
  await fetch(`${site}/__test/pause?action=read-${action}`);
  const pendingResponse = api(action, fields);
  await waitFor(async () => ((await (await fetch(`${site}/__test/paused?action=read-${action}`)).json()) as { held: number }).held === 1, `${action} held before its read`);
  await change();
  await fetch(`${site}/__test/release?action=read-${action}`);
  const response = await pendingResponse;
  const text = await response.text();
  return { status: response.status, body: JSON.parse(text) as Record<string, unknown>, text };
}
const leaksNothing = (text: string) => {
  for (const part of ['TEST ONLY: short-lived fixture', '"simulations"', '"simulated":true']) if (text.includes(part)) throw new Error(`response contains ${part}`);
};

await scenario('Finding 2 (real D1): revocation, a newer generation, or expiry just before the response read → refusal, no data or newer history', async () => {
  for (const [label, prepare, change, expected] of [
    ['revoked', async () => fixture(24 * 3600 * 1000, 'accepted'), (q: Fixture) => fetch(`${site}/__test/revoke?ref=${q.ref}`), 'revoked'],
    ['superseded', async () => fixture(24 * 3600 * 1000, 'accepted'), (q: Fixture) => fetch(`${site}/__test/supersede?ref=${q.ref}`), 'superseded'],
    ['expired', async () => fixture(3000, 'accepted'), async (q: Fixture) => { while (Date.now() <= q.expiresAt + 200) await sleep(100); }, 'expired'],
  ] as const) {
    for (const action of ['view', 'simulate'] as const) {
      const q = await prepare();
      const attempt = crypto.randomUUID();
      const fields: Record<string, string> = action === 'view' ? { token: q.token } : { token: q.token, version: '2', method: 'card', outcome: 'success', attempt_id: attempt };
      if (action === 'simulate') expectEqual((await api('simulate', fields)).status, 200, `${label}: stored attempt first`);
      const answer = await heldRead(action, fields, () => change(q));
      expectEqual([answer.status, answer.body.error], [410, expected], `${label} ${action}`);
      leaksNothing(answer.text);
    }
  }
});

await scenario('Finding 2 (real D1): a version change just before the response read → no stored result; the conflict view is current', async () => {
  const q = await fixture(24 * 3600 * 1000, 'accepted');
  const fields = { token: q.token, version: '2', method: 'bank', outcome: 'cancelled', attempt_id: crypto.randomUUID() };
  expectEqual((await api('simulate', fields)).status, 200, 'stored attempt first');
  const answer = await heldRead('simulate', fields, () => fetch(`${site}/__test/bump-version?ref=${q.ref}`));
  expectEqual([answer.status, answer.body.error, (answer.body.view as { version: number }).version], [409, 'changed', 3], 'conflict with the current view');
  if (answer.text.includes('"simulated":true')) throw new Error('stored result returned');
});


// ---- Checkpoint 4 fourth review: link problems after a decision or checkout was sent ---------
type MatrixAction = 'accept' | 'decline' | 'simulate';
type Condition = 'revoked' | 'expired' | 'superseded';
const conditionText: Record<Condition, string> = {
  revoked: 'BuildTrack has withdrawn this quotation link.',
  expired: 'This quotation link has expired.',
  superseded: 'BuildTrack has sent you a newer link for this quotation.',
};
const invalidate: Record<Condition, (q: Fixture) => Promise<unknown>> = {
  revoked: (q) => fetch(`${site}/__test/revoke?ref=${q.ref}`),
  expired: () => setClock(2 * 24 * HOUR_MS), // past the fixture's one-day expiry
  superseded: (q) => fetch(`${site}/__test/supersede?ref=${q.ref}&history=0`),
};
const restore: Record<Condition, (q: Fixture) => Promise<unknown>> = {
  revoked: (q) => fetch(`${site}/__test/unrevoke?ref=${q.ref}`),
  expired: () => setClock(0),
  superseded: (q) => fetch(`${site}/__test/unsupersede?ref=${q.ref}`),
};
async function sendAction(action: MatrixAction) {
  if (action === 'accept') return acceptOnPage();
  if (action === 'decline') {
    await click('[data-q-ask="decline"]');
    await waitFor(() => visible('[data-q-confirm]'), 'confirmation');
    return void (await click('[data-q-confirm-yes]'));
  }
  return void (await click('[data-q-outcome="success"]'));
}
const reconciled: Record<MatrixAction, () => Promise<boolean>> = {
  accept: async () => (await text('[data-q-answer]')).startsWith('You accepted'),
  decline: async () => (await text('[data-q-answer]')).startsWith('You declined'),
  simulate: async () => (await text('[data-q-result-title]')) === 'Simulated success',
};
const oneRecord = (action: MatrixAction, state: { status: string; events: number; simulations: number }) =>
  action === 'simulate' ? state.simulations === 1 : state.events === 1 && state.status === (action === 'accept' ? 'accepted' : 'declined');
const actionNoun: Record<MatrixAction, string> = { accept: 'acceptance', decline: 'decline', simulate: 'simulated result' };

async function assertUncertainProblem(action: MatrixAction, condition: Condition, label: string) {
  await waitFor(() => visible('[data-q-problem]'), `${label}: link problem shown`);
  if (!(await text('[data-q-problem-text]')).startsWith(conditionText[condition])) throw new Error(`${label}: link text`);
  const said = await text('[data-q-status]');
  if (!said.includes(`Your ${actionNoun[action]} may or may not have been recorded before this link stopped working.`) || !said.includes('contact BuildTrack')) {
    throw new Error(`${label}: uncertainty text: ${said}`);
  }
  expectEqual([await visible('[data-q-retry]'), await visible('[data-q-quote]'), await visible('[data-q-checkout]')], [true, false, false], `${label}: retry kept, no quotation details`);
  if (!(await evaluate<boolean>(`!!document.querySelector('[data-q-problem] a[href^="tel:"]')`))) throw new Error(`${label}: no contact route`);
}

for (const action of ['accept', 'decline', 'simulate'] as const) {
  for (const condition of ['revoked', 'expired', 'superseded'] as const) {
    for (const phase of ['initial response', 'retry response'] as const) {
      await scenario(`Finding (fourth review): ${action} × ${condition} × ${phase}: problem + uncertainty, request and lock kept, retry works once valid, one record`, async () => {
        const q = await fixture(24 * 3600 * 1000, action === 'simulate' ? 'accepted' : 'approved');
        try {
          await goTo(q.link);
          await waitShown(q.ref);
          if (action === 'simulate') {
            await click('[data-q-method="card"]');
            await click('[data-q-sample]');
            await click('[data-q-check]');
            await waitFor(() => visible('[data-q-outcome="success"]'), 'outcome step');
          }
          requests.length = 0;
          if (phase === 'initial response') {
            // The write commits; the link stops working before the response snapshot is read.
            await fetch(`${site}/__test/pause?action=read-${action}`);
            await sendAction(action);
            await waitFor(async () => ((await (await fetch(`${site}/__test/paused?action=read-${action}`)).json()) as { held: number }).held === 1, 'held after the write');
            await invalidate[condition](q);
            await fetch(`${site}/__test/release?action=read-${action}`);
          } else {
            // The write commits; its answer is lost; the link stops working before "Check again".
            responseRules = [once(isFor(action, q.token), 'fail')];
            await sendAction(action);
            await waitFor(() => visible('[data-q-retry]'), 'uncertain after the lost answer');
            responseRules = [];
            await invalidate[condition](q);
            await click('[data-q-retry]');
          }
          await assertUncertainProblem(action, condition, 'first link problem');
          if (!oneRecord(action, await quoteState(q.ref))) throw new Error('the original was not committed once');
          // The lock holds: no new decision or checkout can be sent (even by scripted clicks).
          for (const selector of ['[data-q-ask="accept"]', '[data-q-ask="decline"]', '[data-q-confirm-yes]', '[data-q-outcome="failure"]', '[data-q-outcome="cancelled"]']) await click(selector);
          await sleep(200);
          // "Check again" while the link is still unusable: the same request, still uncertain.
          await click('[data-q-retry]');
          await sleep(300);
          await assertUncertainProblem(action, condition, 'retry while the link is unusable');
          // Once the link is valid again, "Check again" reconciles the original.
          await restore[condition](q);
          await click('[data-q-retry]');
          await waitFor(reconciled[action], 'reconciled once the link is valid');
          const sent = requests.filter((r) => r.url.endsWith(`/api/quote/${action}`)).map((r) => r.body);
          expectEqual([sent.length >= 3, new Set(sent).size], [true, 1], 'only the identical request was ever sent');
          if (!oneRecord(action, await quoteState(q.ref))) throw new Error(`not exactly one record: ${JSON.stringify(await quoteState(q.ref))}`);
        } finally {
          responseRules = [];
          await fetch(`${site}/__test/release?action=read-${action}`);
          await setClock(0);
        }
      });
    }
  }
}

await scenario('Fourth review: a new explicit link (or an invalid one) still replaces an unresolved session', async () => {
  const a = await fixture();
  const b = await fixture();
  await goTo(a.link);
  await waitShown(a.ref);
  responseRules = [once(isFor('accept', a.token), 'fail')];
  await acceptOnPage();
  await waitFor(() => visible('[data-q-retry]'), 'A unresolved');
  responseRules = [];
  await goTo(b.link); // session replacement
  await waitShown(b.ref);
  expectEqual([await visible('[data-q-retry]'), await visible('[data-q-decision]')], [false, true], 'B is a fresh session, not locked');
  await goTo(a.link);
  await waitShown(a.ref); // A reloads from the server: the acceptance was recorded
  if (!(await text('[data-q-answer]')).startsWith('You accepted')) throw new Error('A state');
  await goTo(`${site}/quote/#t=broken`);
  await waitFor(() => visible('[data-q-problem]'), 'invalid fragment');
  expectEqual(await visible('[data-q-retry]'), false, 'an explicitly invalid link replaces the session');
});


// ---- Reload repair (pending action survives a reload) -----------------------------------------
const pausedCount = async (action: string) => ((await (await fetch(`${site}/__test/paused?action=${action}`)).json()) as { held: number }).held;
async function reloadPage() {
  await send('Page.reload');
  await waitFor(() => evaluate<boolean>(`document.readyState === 'complete'`), 'reloaded');
}

await scenario("Reload repair (Codex's case): checkout still running → gateway timeout → reload → repeated choice blocked → original released → reconciled, one record", async () => {
  const q = await fixture(24 * 3600 * 1000, 'accepted');
  try {
    await goTo(q.link);
    await waitShown(q.ref);
    await click('[data-q-method="card"]');
    await click('[data-q-sample]');
    await click('[data-q-check]');
    await waitFor(() => visible('[data-q-outcome="success"]'), 'outcome step');
    requests.length = 0;
    await fetch(`${site}/__test/pause?action=simulate`); // the original keeps running at the Worker
    gatewayRules = [(url, body) => url.endsWith('/api/quote/simulate') && body.includes(q.token)];
    await click('[data-q-outcome="success"]');
    await waitFor(() => visible('[data-q-retry]'), 'uncertain after 504');
    await waitFor(async () => (await pausedCount('simulate')) === 1, 'original running at the Worker');
    const original = mutationsSent()[0]!;
    expectEqual([original.action, original.fields.token, original.fields.outcome, typeof original.fields.attempt_id], ['simulate', q.token, 'success', 'string'], 'the original request');
    await reloadPage();
    // Restored before anything else: the uncertainty, "Check again" and the lock.
    await waitFor(() => visible('[data-q-retry]'), 'Check again restored after reload');
    if (!(await text('[data-q-status]')).includes('was sent but not confirmed')) throw new Error(`status: ${await text('[data-q-status]')}`);
    await waitShown(q.ref);
    expectEqual(await evaluate(`location.href`), `${site}/quote/`, 'no fragment after reload');
    // The customer repeats the choice: nothing new may be sent.
    await click('[data-q-method="card"]');
    await click('[data-q-sample]');
    await click('[data-q-check]');
    for (const outcome of ['success', 'failure']) await click(`[data-q-outcome="${outcome}"]`);
    await sleep(300);
    expectSameMutation(mutationsSent(), original, 1, 'after the reload and the repeated choice');
    // The original completes.
    await fetch(`${site}/__test/release?action=simulate`);
    expectEqual((await forwarded.pop()!).status, 200, 'original recorded');
    await click('[data-q-retry]');
    await waitFor(async () => (await text('[data-q-result-title]')) === 'Simulated success', 'reconciled');
    expectSameMutation(mutationsSent(), original, 2, 'the original, then one "Check again" with the same attempt id');
    expectEqual((await quoteState(q.ref)).simulations, 1, 'exactly one record');
    expectEqual(await evaluate(`sessionStorage.getItem('buildtrack-quote-pending')`), null, 'record cleared after settlement');
  } finally {
    gatewayRules = [];
    await fetch(`${site}/__test/release?action=simulate`);
  }
});

await scenario('Reload repair: an acceptance and a decline sent before a reload are restored and reconciled once', async () => {
  for (const action of ['accept', 'decline'] as const) {
    const q = await fixture();
    await goTo(q.link);
    await waitShown(q.ref);
    requests.length = 0;
    responseRules = [once(isFor(action, q.token), 'fail')];
    await sendAction(action);
    await waitFor(() => visible('[data-q-retry]'), `${action} uncertain`);
    responseRules = [];
    const original = mutationsSent()[0]!;
    expectEqual([original.action, original.fields.token], [action, q.token], `${action}: the original request`);
    await reloadPage();
    await waitFor(() => visible('[data-q-retry]'), `${action} restored`);
    await waitShown(q.ref);
    for (const selector of ['[data-q-ask="accept"]', '[data-q-ask="decline"]']) await click(selector);
    expectEqual(await visible('[data-q-confirm]'), false, `${action}: no new confirmation after reload`);
    await click('[data-q-retry]');
    await waitFor(reconciled[action], `${action} reconciled`);
    expectSameMutation(mutationsSent(), original, 2, `${action}: the original, then one "Check again" after the reload`);
    if (!oneRecord(action, await quoteState(q.ref))) throw new Error(`${action}: not exactly one record`);
  }
});

await scenario('Reload repair: a committed action whose link is then revoked keeps its uncertainty after reload', async () => {
  const q = await fixture();
  try {
    await goTo(q.link);
    await waitShown(q.ref);
    requests.length = 0;
    responseRules = [once(isFor('accept', q.token), 'fail')];
    await acceptOnPage();
    await waitFor(() => visible('[data-q-retry]'), 'uncertain');
    responseRules = [];
    const original = mutationsSent()[0]!;
    expectEqual([original.action, original.fields.token], ['accept', q.token], 'the original request');
    await fetch(`${site}/__test/revoke?ref=${q.ref}`);
    await reloadPage();
    await waitFor(() => visible('[data-q-problem]'), 'link problem after reload');
    if (!(await text('[data-q-status]')).includes('may or may not have been recorded before this link stopped working')) throw new Error('uncertainty lost');
    expectEqual([await visible('[data-q-retry]'), await visible('[data-q-quote]')], [true, false], 'retry kept, no details');
    await fetch(`${site}/__test/unrevoke?ref=${q.ref}`);
    await click('[data-q-retry]');
    await waitFor(reconciled.accept, 'reconciled');
    expectSameMutation(mutationsSent(), original, 2, 'the original, then one "Check again" after the reload');
    expectEqual((await quoteState(q.ref)).events, 1, 'one acceptance');
  } finally {
    responseRules = [];
  }
});

await scenario('Reload repair: a new or invalid link never resurrects an earlier pending action', async () => {
  const a = await fixture();
  const b = await fixture();
  await goTo(a.link);
  await waitShown(a.ref);
  requests.length = 0;
  responseRules = [once(isFor('accept', a.token), 'fail')];
  await acceptOnPage();
  await waitFor(() => visible('[data-q-retry]'), 'A unresolved');
  responseRules = [];
  await goTo(b.link); // replacement
  await waitShown(b.ref);
  await reloadPage();
  await waitShown(b.ref);
  expectEqual([await visible('[data-q-retry]'), await visible('[data-q-decision]')], [false, true], 'B after reload: no recovery from A');
  // A pending action for B, then an explicitly invalid link, then a reload: nothing comes back.
  responseRules = [once(isFor('accept', b.token), 'fail')];
  await acceptOnPage();
  await waitFor(() => visible('[data-q-retry]'), 'B unresolved');
  responseRules = [];
  await goTo(`${site}/quote/#t=broken`);
  await waitFor(() => visible('[data-q-problem]'), 'invalid link');
  await reloadPage();
  await waitFor(() => visible('[data-q-problem]'), 'after reload');
  expectEqual(await visible('[data-q-retry]'), false, 'no resurrected recovery');
  // A tampered record for the current link is ignored, not trusted.
  const c = await fixture();
  await goTo(c.link);
  await waitShown(c.ref);
  await evaluate(`sessionStorage.setItem('buildtrack-quote-pending', JSON.stringify({ v: 1, action: 'accept', fields: { token: ${JSON.stringify(c.token)}, version: '2', extra: 'x' } }))`);
  await reloadPage();
  await waitShown(c.ref);
  expectEqual([await visible('[data-q-retry]'), await visible('[data-q-decision]')], [false, true], 'tampered record ignored');
  expectEqual(
    mutationsSent().map((m) => [m.action, m.fields.token]),
    [['accept', a.token], ['accept', b.token]],
    'only the two original acceptances were ever sent: nothing resurrected or retried',
  );
});

await scenario('Reload repair: if the record cannot be stored, nothing is sent', async () => {
  const q = await fixture();
  await goTo(q.link);
  await waitShown(q.ref);
  requests.length = 0;
  await evaluate(`(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function (key, value) { if (key === 'buildtrack-quote-pending') throw new Error('quota'); return original.call(this, key, value); }; })()`);
  await acceptOnPage();
  await waitFor(async () => (await text('[data-q-status]')).startsWith('Nothing was sent: this browser did not let the page keep'), 'storage message');
  expectEqual(mutationsSent(), [], 'no acceptance or other change sent');
  expectEqual((await quoteState(q.ref)).status, 'approved', 'nothing recorded');
});


await scenario('Owner lifecycle (real runtime, manual email): revoke → customer told; new link → fresh prepared invitation works, old link refused; delete → link invalid', async () => {
  const who = { name: 'TEST Customer Lifecycle', email: 'test-customer-lifecycle@example.test' };
  const reference = await httpRequest(who.name);
  await ownerApprove(reference);
  const first = await preparedLink(reference);
  const list = await (await ownerGet('/')).text();
  const id = new RegExp(`href="/requests/([0-9a-f-]{36})">${reference}<`).exec(list)![1]!;
  const act = async (kind: string) => {
    const page = await (await ownerGet(`/requests/${id}/${kind}`)).text();
    return (await ownerPost(`/requests/${id}/${kind}`, formOf(page))).status;
  };
  expectEqual(await act('revoke'), 303, 'revoke');
  await goTo(first);
  await waitFor(() => visible('[data-q-problem]'), 'revoked link on the page');
  if (!(await text('[data-q-problem-text]')).startsWith('BuildTrack has withdrawn this quotation link.')) throw new Error('revoked text');
  expectEqual(await visible('[data-q-quote]'), false, 'no details');
  expectEqual(await act('new-link'), 303, 'new link');
  const second = await preparedLink(reference); // a fresh invitation for the owner to send
  if (second === first) throw new Error('the new link is the old one');
  await goTo(second);
  await waitFor(() => visible('[data-q-decision]'), 'new link opens the quotation');
  await goTo(first);
  await waitFor(() => visible('[data-q-problem]'), 'old link still refused');
  expectEqual(await act('delete'), 303, 'delete');
  await goTo(second);
  await waitFor(() => visible('[data-q-problem]'), 'deleted');
  if (!(await text('[data-q-problem-text]')).startsWith('This quotation link is not valid.')) throw new Error('deleted text');
});

await stopDev();
const firstToken = tokenOf(link);
await scenario('D1 (server stopped): accepted, not paid; one simulated row per attempt; no token stored', async () => {
  const quotes = query<{ snap_email: string; status: string; accepted_at: number | null; declined_at: number | null }>(
    "SELECT snap_email, status, accepted_at, declined_at FROM quotes WHERE snap_email <> 'fixture@example.test' ORDER BY created_at",
  );
  expectEqual(quotes.map((q) => [q.snap_email, q.status]), [
    [customer.email, 'accepted'],
    [second.email, 'declined'],
    [third.email, 'accepted'],
    [fourth.email, 'approved'], // manual email mode: never "emailed"
  ], 'quotation states (never "paid")');
  const sims = query<{ email: string; method: string; outcome: string; simulated: number }>(
    "SELECT q.snap_email AS email, s.method, s.outcome, s.simulated FROM simulated_checkouts s JOIN quotes q ON q.id = s.quote_id WHERE q.snap_email <> 'fixture@example.test' ORDER BY s.created_at",
  );
  expectEqual(sims.map((s) => [s.email, s.method, s.outcome, s.simulated]), [
    [customer.email, 'card', 'success', 1],
    [third.email, 'bank', 'failure', 1],
  ], 'simulated outcomes');
  expectEqual(
    query<{ n: number }>("SELECT COUNT(*) AS n FROM quote_events e JOIN quotes q ON q.id = e.quote_id WHERE e.actor = 'customer' AND e.event = 'accepted' AND q.snap_email <> 'fixture@example.test'")[0]!.n,
    2,
    'one acceptance event per accepted quotation',
  );
  const everything = JSON.stringify(['quotes', 'quote_links', 'email_jobs', 'email_attempts', 'quote_events', 'simulated_checkouts'].map((t) => query(`SELECT * FROM ${t}`)));
  for (const token of [firstToken, thirdToken, fourthToken]) if (everything.includes(token)) throw new Error('a link token is stored');
  if (everything.includes('12345678')) throw new Error('the demo code is stored');
  // Revoke the fourth link and supersede the third (the future owner actions), for the next check.
  query(`UPDATE quote_links SET revoked_at = ${Date.now()} WHERE quote_id = (SELECT id FROM quotes WHERE snap_email = '${fourth.email}')`);
  query(`INSERT INTO quote_links (token_hash, quote_id, link_generation, link_key_version, created_at)
         SELECT '${'0'.repeat(64)}', id, 2, 1, ${Date.now()} FROM quotes WHERE snap_email = '${third.email}'`);
  query(`UPDATE quotes SET link_generation = 2, token_hash = '${'0'.repeat(64)}' WHERE snap_email = '${third.email}'`);
});
await startDev();
await scenario('Revoked and superseded links (real runtime) say so, and cannot act', async () => {
  const revoked = await api('view', { token: fourthToken });
  expectEqual([revoked.status, ((await revoked.json()) as { error: string }).error], [410, 'revoked'], 'revoked');
  const superseded = await api('simulate', { token: thirdToken, version: '3', method: 'card', outcome: 'success', attempt_id: crypto.randomUUID() });
  expectEqual([superseded.status, ((await superseded.json()) as { error: string }).error], [410, 'superseded'], 'superseded');
  await open(`${site}/quote/#t=${fourthToken}`);
  await waitFor(() => visible('[data-q-problem]'), 'revoked page');
  if (!(await text('[data-q-problem-text]')).startsWith('BuildTrack has withdrawn this quotation link.')) throw new Error('revoked text');
});
await scenario('/payment-demo/ is unchanged and still independent', async () => {
  requests.length = 0;
  await open(`${site}/payment-demo/`);
  await waitFor(() => evaluate<boolean>(`!!document.querySelector('[data-pay-action="next"]')`), 'payment demo');
  expectEqual(requests.filter((r) => r.url.includes('/api/')).length, 0, 'the payment demo calls no API');
});
await stopDev();

await scenario('Browser: no request outside the two local origins; no CSP violation or script error', async () => {
  expectEqual(blocked, [], 'blocked requests');
  expectEqual(securityMessages, [], 'CSP messages and exceptions');
});
await scenario('Harness: every CDP interception error in the run was an exact, browser-confirmed cancellation', async () => {
  await settleInterceptions();
  expectEqual(harnessErrors, [], 'harness errors not attributed to a scenario');
});
await scenario('Worker log lines contain no tokens, names or addresses', async () => {
  const lines = devOutput.split(/\r?\n/).filter((line) => line.startsWith('{'));
  if (!lines.some((line) => line.includes('"quote_action"'))) throw new Error('no quote log lines captured');
  for (const value of [firstToken, thirdToken, fourthToken, customer.name, customer.email, second.email, third.email, 'TEST Customer', '12345678']) {
    if (lines.some((line) => line.includes(value))) throw new Error(`a log line contains ${value.slice(0, 30)}`);
  }
});

ws.close();
cleanup();
for (const result of results) console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.name}${result.detail ? `\n      ${result.detail}` : ''}`);
const failed = results.filter((result) => !result.ok).length;
console.log(`\n${results.length - failed}/${results.length} end-to-end checks passed.`);
process.exit(failed ? 1 : 0);
