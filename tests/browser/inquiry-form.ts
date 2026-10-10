// Browser test for the Contact inquiry form, plus the disclosure copy and pricing table
// semantics that depend on configuration: `npm run test:browser`.
//
// Builds two temporary copies of the site with fixture modules swapped in for
// src/config/*.ts by a Vite resolve hook: "configured" (`fixtures/inquiry-configured.ts`:
// synthetic endpoint https://form-test.invalid/…, 1.5 s time limit; and
// `fixtures/site-with-production-url.ts`: a synthetic production URL) and "unconfigured"
// (`fixtures/inquiry-unconfigured.ts`: no endpoint). The real config, whatever it holds,
// and `dist/` are never modified or used. Both copies are served locally and driven in
// headless Chromium over the DevTools protocol. Every request the page makes is
// intercepted: local test-server requests continue, requests to the synthetic endpoint
// are answered or failed by this script, and anything else is blocked and fails the run.
//
// Requires CHROME_PATH (standalone setup in docs/ARCHITECTURE.md §8).
// Uses only Node built-ins and Astro.

import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'astro';
import { TEST_ENDPOINT } from './fixtures/inquiry-configured.ts';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

// ---- 0. Browser selection: explicit CHROME_PATH only ---------------------------------
const chromePath = process.env.CHROME_PATH;
if (!chromePath || !existsSync(chromePath)) {
  console.error(
    [
      `CHROME_PATH ${chromePath ? `does not exist: ${chromePath}` : 'is not set'}.`,
      'Install a standalone browser and point CHROME_PATH at it, for example:',
      '  npx @puppeteer/browsers install chrome-headless-shell@154.0.8037.92 --path "$LOCALAPPDATA/buildtrack-browser"',
      'then set CHROME_PATH to the chrome-headless-shell.exe path it prints (docs/ARCHITECTURE.md §8).',
    ].join('\n'),
  );
  process.exit(2);
}

const work = mkdtempSync(join(tmpdir(), 'buildtrack-inquiry-'));

// ---- 1. Fixture builds ---------------------------------------------------------------
const normalize = (path: string) => path.split('?')[0]!.replaceAll('\\', '/').toLowerCase();
const fixturePath = (name: string) => join(root, 'tests', 'browser', 'fixtures', name);

/** Builds a copy in which each `src/config/<module>.ts` is replaced by the given fixture. */
async function buildWithFixtures(name: string, swaps: Record<string, string>): Promise<string> {
  const outDir = join(work, name);
  const targets = Object.entries(swaps).map(([module, fixture]) => ({
    module,
    real: normalize(join(root, 'src', 'config', `${module}.ts`)),
    fixture: fixturePath(fixture),
    redirected: 0,
  }));
  await build({
    root,
    outDir,
    logLevel: 'warn',
    vite: {
      plugins: [
        {
          name: 'buildtrack-config-fixtures',
          enforce: 'pre',
          async resolveId(this: any, source: string, importer: string | undefined, options: object) {
            if (!importer) return null;
            const target = targets.find((t) => new RegExp(`${t.module}(\\.ts)?$`).test(source));
            // A fixture imports its real module; every other importer gets the fixture.
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
// The configured copy also has a synthetic production URL: configuration alone must not
// change what the site claims about publication or delivery.
const configuredDir = await buildWithFixtures('configured', {
  inquiry: 'inquiry-configured.ts',
  site: 'site-with-production-url.ts',
});
const unconfiguredDir = await buildWithFixtures('unconfigured', { inquiry: 'inquiry-unconfigured.ts' });

// ---- 2. Static servers (+ a route whose body never finishes, for the body timeout) ---
const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
};
const STALL_PATH = '/__test-stalled-body';
async function serve(dir: string): Promise<{ server: Server; origin: string }> {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    if (path === STALL_PATH) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.write('{"ne'); // Headers and part of a body, then nothing more.
      return;
    }
    let file = join(dir, path);
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!file.startsWith(dir) || !existsSync(file)) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  return { server, origin: `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}` };
}
const configured = await serve(configuredDir);
const unconfigured = await serve(unconfiguredDir);
const localOrigins = [configured.origin, unconfigured.origin];

// ---- 3. Chromium over CDP ------------------------------------------------------------
const profile = join(work, 'profile');
const chrome = spawn(
  chromePath,
  ['--headless', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'],
  { stdio: 'ignore' },
);
let port: string | undefined;
for (let i = 0; i < 100 && !port; i++) {
  const file = join(profile, 'DevToolsActivePort');
  if (existsSync(file)) port = readFileSync(file, 'utf8').split('\n')[0]?.trim() || undefined;
  if (!port) await sleep(100);
}
if (!port) throw new Error(`Chromium did not start: ${chromePath}`);
const version = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()) as { Browser: string };
console.log(`Browser: ${version.Browser}\nPath:    ${chromePath}\n`);

interface CdpMessage {
  id?: number;
  method?: string;
  params?: any;
  result?: any;
  error?: { message: string };
}
let wsUrl: string | undefined;
for (let i = 0; i < 50 && !wsUrl; i++) {
  const targets = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as any[];
  wsUrl = targets.find((target) => target.type === 'page')?.webSocketDebuggerUrl;
  if (!wsUrl) await sleep(100);
}
if (!wsUrl) throw new Error('No page target in Chromium.');
const ws = new WebSocket(wsUrl);
await new Promise((done) => ws.addEventListener('open', done));
let nextId = 0;
const pending = new Map<number, (message: CdpMessage) => void>();
const events: ((message: CdpMessage) => void)[] = [];
ws.addEventListener('message', (event) => {
  const message = JSON.parse(String(event.data)) as CdpMessage;
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)!(message);
    pending.delete(message.id);
  } else events.forEach((listener) => listener(message));
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

// Request guard: every request from the page pauses here first.
interface Paused {
  requestId: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  resourceType: string;
}
const paused: Paused[] = [];
const blocked: string[] = [];
events.push((message) => {
  if (message.method !== 'Fetch.requestPaused') return;
  const { requestId, request, resourceType } = message.params;
  const url: string = request.url;
  if (localOrigins.some((origin) => url.startsWith(`${origin}/`))) {
    void send('Fetch.continueRequest', { requestId });
    return;
  }
  if (url === TEST_ENDPOINT) {
    const entries = (request.postDataEntries ?? []) as { bytes?: string }[];
    const body =
      request.postData ?? entries.map((entry) => Buffer.from(entry.bytes ?? '', 'base64').toString('utf8')).join('');
    paused.push({ requestId, url, method: request.method, headers: request.headers, body, resourceType });
    return;
  }
  blocked.push(`${request.method} ${url}`);
  void send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' });
});
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setFocusEmulationEnabled', { enabled: true }); // focus/blur events in headless mode
await send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });

const cors = [
  { name: 'Access-Control-Allow-Origin', value: '*' },
  { name: 'Content-Type', value: 'application/json' },
];
const respond = (request: Paused, status: number, body: unknown) =>
  send('Fetch.fulfillRequest', {
    requestId: request.requestId,
    responseCode: status,
    responseHeaders: cors,
    body: Buffer.from(JSON.stringify(body)).toString('base64'),
  });
const failNetwork = (request: Paused) =>
  send('Fetch.failRequest', { requestId: request.requestId, errorReason: 'InternetDisconnected' });
/** Answers from the local stall route: headers and part of a body arrive, the rest never does. */
const stallBody = (request: Paused) =>
  send('Fetch.continueRequest', { requestId: request.requestId, url: configured.origin + STALL_PATH });

async function waitFor(check: () => Promise<boolean> | boolean, label: string, timeout = 4000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await check()) return;
    await sleep(40);
  }
  throw new Error(`Timed out waiting for: ${label}`);
}
const nextRequest = async () => {
  await waitFor(() => paused.length > 0, 'an intercepted provider request');
  return paused.shift()!;
};

async function open(site: { origin: string }, path: string, { js = true, width = 1280 } = {}) {
  paused.length = 0;
  await send('Emulation.setScriptExecutionDisabled', { value: !js });
  await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 800 });
  const loaded = new Promise<void>((done) => {
    const listener = (m: CdpMessage) => {
      if (m.method !== 'Page.loadEventFired') return;
      events.splice(events.indexOf(listener), 1);
      done();
    };
    events.push(listener);
  });
  await send('Page.navigate', { url: site.origin + path });
  await loaded;
  // A late load event from a previous page must not count: confirm this document is the one requested.
  const url = site.origin + path;
  await waitFor(
    () => evaluate<boolean>(`location.href === ${JSON.stringify(url)} && document.readyState === 'complete'`),
    `page ${url} loaded`,
  );
}

/** Opens the configured Contact page; refuses to continue unless the form posts to the synthetic endpoint. */
async function openForm(path: string, options: { js?: boolean } = {}) {
  await open(configured, path, options);
  const action = await evaluate<string | null>(`document.querySelector('form')?.getAttribute('action') ?? null`);
  if (action !== TEST_ENDPOINT)
    throw new Error(`Form action is ${JSON.stringify(action)}, not the synthetic test endpoint; refusing to submit.`);
}

// ---- 4. Assertions and page helpers --------------------------------------------------
const results: { name: string; ok: boolean; detail?: string }[] = [];
async function scenario(name: string, run: () => Promise<void>) {
  try {
    await run();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, detail: error instanceof Error ? error.message : String(error) });
  }
  // Release anything a scenario left paused (e.g. a request held past the time limit).
  for (const request of paused.splice(0)) await failNetwork(request).catch(() => {});
}
function expectEqual(actual: unknown, expected: unknown, label: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const visible = (selector: string) =>
  evaluate<boolean>(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); return !!el && el.checkVisibility(); })()`);
const text = (selector: string) =>
  evaluate<string>(`(document.querySelector(${JSON.stringify(selector)})?.textContent ?? '').replace(/\\s+/g, ' ').trim()`);
const focusedIs = (selector: string) =>
  evaluate<boolean>(`document.activeElement === document.querySelector(${JSON.stringify(selector)})`);
const formState = () =>
  evaluate<Record<string, string>>(
    `Object.fromEntries([...new FormData(document.querySelector('[data-inquiry-form]'))].filter(([k]) => k !== '_gotcha' && k !== 'subject'))`,
  );

/** Fills a valid synthetic, clearly labelled test inquiry. */
const fillValid = (type = 'quotation') =>
  evaluate(`(() => {
    const form = document.querySelector('[data-inquiry-form]');
    const set = (name, value) => { const el = form.elements.namedItem(name); el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    form.querySelector('input[name="request_type"][value="${type}"]').click();
    set('name', '  TEST Automated Browser Check  ');
    set('email', 'test@example.com');
    set('organization', 'TEST ONLY - not a real organization');
    set('organization_type', 'other');
    set('project_need', 'TEST ONLY: automated form check');
    set('message', 'Synthetic test message <b>not bold</b> & "quoted"');
    const ack = form.querySelector('#inquiry-privacy_ack'); if (!ack.checked) ack.click();
  })()`);
const submit = () => evaluate(`document.querySelector('[data-inquiry-form]').requestSubmit()`);

/** Shared checks for outcomes where the request may or may not have arrived. */
async function expectUncertain(before: Record<string, string>, phrase: string) {
  if (await visible('[data-confirmation]')) throw new Error('confirmation shown for an uncertain outcome');
  if (!(await focusedIs('[data-error-summary]'))) throw new Error('error summary not focused');
  expectEqual(await text('[data-error-heading]'), "We couldn't confirm your request", 'heading');
  const message = await text('[data-error-message]');
  if (!message.includes(phrase) || !message.includes('may receive it twice')) throw new Error(`unexpected message: ${message}`);
  if (/couldn't send|was not sent|not received/i.test(message)) throw new Error('message claims definite non-delivery');
  expectEqual(await formState(), before, 'values preserved');
  if (!(await visible('[data-retry]'))) throw new Error('retry not offered');
  expectEqual(await evaluate(`document.querySelector('[data-submit]').disabled`), false, 'submit re-enabled');
}

// ---- 5. Scenarios --------------------------------------------------------------------
await scenario('request guard: destinations other than the test servers and synthetic endpoint are blocked', async () => {
  await open(configured, '/contact/');
  const outcome = await evaluate<string>(
    `fetch('https://guard-check.invalid/probe', { method: 'POST' }).then(() => 'reached', () => 'blocked')`,
  );
  expectEqual(outcome, 'blocked', 'probe outcome');
  expectEqual(blocked.splice(0), ['POST https://guard-check.invalid/probe'], 'blocked list');
});

await scenario('preselection: allowlisted values select editable controls', async () => {
  await openForm('/contact/?type=quotation&service=equipment-tracking&plan=professional');
  const state = await evaluate(`({
    type: document.querySelector('input[name="request_type"]:checked')?.value,
    service: document.querySelector('#inquiry-service').value,
    plan: document.querySelector('#inquiry-plan').value,
    label: document.querySelector('[data-submit-label]').textContent,
    noValidate: document.querySelector('[data-inquiry-form]').noValidate,
  })`);
  expectEqual(
    state,
    { type: 'quotation', service: 'equipment-tracking', plan: 'professional', label: 'Send quotation request', noValidate: true },
    'preselected state',
  );
  await evaluate(`document.querySelector('#inquiry-request_type-demo').click(); document.querySelector('#inquiry-plan').value = '';`);
  expectEqual(await text('[data-submit-label]'), 'Send demo request', 'label after editing type');
  expectEqual(await evaluate(`document.querySelector('input[name="request_type"]:checked').value`), 'demo', 'edited type');
});

await scenario('preselection: plan alone implies Avail a Service', async () => {
  await openForm('/contact/?plan=enterprise');
  expectEqual(
    await evaluate(`[document.querySelector('input[name="request_type"]:checked')?.value, document.querySelector('#inquiry-plan').value]`),
    ['service', 'enterprise'],
    'inferred type and plan',
  );
});

await scenario('preselection: invalid and script-like values are ignored and never echoed', async () => {
  await openForm('/contact/?type=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E&service=Equipment-Tracking&plan=gold&plan=starter');
  const state = await evaluate(`({
    type: document.querySelector('input[name="request_type"]:checked')?.value ?? null,
    service: document.querySelector('#inquiry-service').value,
    plan: document.querySelector('#inquiry-plan').value,
    echoed: document.body.innerHTML.includes('onerror'),
    images: document.querySelectorAll('main img[src="x"]').length,
    label: document.querySelector('[data-submit-label]').textContent,
  })`);
  expectEqual(state, { type: null, service: '', plan: '', echoed: false, images: 0, label: 'Send request' }, 'state');
});

await scenario('validation: empty submit shows a focused error summary and field errors, sends nothing', async () => {
  await openForm('/contact/');
  await submit();
  if (!(await visible('[data-error-summary]'))) throw new Error('error summary not visible');
  if (!(await focusedIs('[data-error-summary]'))) throw new Error('error summary not focused');
  expectEqual(await text('[data-error-heading]'), 'Please fix the following', 'heading');
  const links = await evaluate<string[]>(`[...document.querySelectorAll('[data-error-list] a')].map((a) => a.getAttribute('href'))`);
  expectEqual(
    links,
    ['#inquiry-request_type-demo', '#inquiry-name', '#inquiry-email', '#inquiry-organization', '#inquiry-organization_type', '#inquiry-project_need', '#inquiry-privacy_ack'],
    'summary links',
  );
  const email = await evaluate(`(() => { const el = document.querySelector('#inquiry-email'); return { invalid: el.getAttribute('aria-invalid'), describedby: el.getAttribute('aria-describedby'), error: document.querySelector('#inquiry-email-error').checkVisibility() }; })()`);
  expectEqual(email, { invalid: 'true', describedby: 'inquiry-email-hint inquiry-email-error', error: true }, 'email error wiring');
  if (await visible('[data-retry]')) throw new Error('retry button shown for client validation');
  await sleep(150);
  expectEqual(paused.length, 0, 'requests sent');
});

await scenario('validation: summary link focuses the field; fixing a field clears its error on blur', async () => {
  await openForm('/contact/');
  await submit();
  await evaluate(`document.querySelector('[data-error-list] a[href="#inquiry-email"]').click()`);
  if (!(await focusedIs('#inquiry-email'))) throw new Error('email not focused after summary link');
  await evaluate(`(() => { const el = document.querySelector('#inquiry-email'); el.value = 'not-an-email'; document.querySelector('#inquiry-organization').focus(); })()`);
  expectEqual(await text('#inquiry-email-error'), 'Enter a valid email address, like name@company.com.', 'invalid email message');
  await evaluate(`(() => { const el = document.querySelector('#inquiry-email'); el.focus(); el.value = 'test@example.com'; document.querySelector('#inquiry-organization').focus(); })()`);
  if (await visible('#inquiry-email-error')) throw new Error('email error still visible after fix');
  expectEqual(await evaluate(`document.querySelector('#inquiry-email').hasAttribute('aria-invalid')`), false, 'aria-invalid removed');
});

await scenario('submission: single in-flight request, submitting state, then accepted confirmation', async () => {
  await openForm('/contact/?type=quotation&plan=professional');
  await fillValid('quotation');
  await submit();
  const request = await nextRequest();
  const during = await evaluate(`({
    disabled: document.querySelector('[data-submit]').disabled,
    label: document.querySelector('[data-submit-label]').textContent,
    busy: document.querySelector('[data-inquiry-form]').getAttribute('aria-busy'),
    status: document.querySelector('[data-status]').textContent,
    spinner: document.querySelector('[data-spinner]').checkVisibility(),
  })`);
  expectEqual(during, { disabled: true, label: 'Sending request…', busy: 'true', status: 'Sending your request', spinner: true }, 'submitting state');
  await submit();
  await submit();
  await sleep(200);
  expectEqual(paused.length, 0, 'extra requests while in flight');
  expectEqual([request.method, request.url, request.headers.Accept ?? request.headers.accept], ['POST', TEST_ENDPOINT, 'application/json'], 'request line');
  for (const expected of [
    'name="request_type"\r\n\r\nquotation',
    'name="plan"\r\n\r\nprofessional',
    'name="name"\r\n\r\nTEST Automated Browser Check\r\n',
    'name="email"\r\n\r\ntest@example.com',
    'name="privacy_ack"\r\n\r\nyes',
    'name="_gotcha"\r\n\r\n\r\n',
    'name="subject"\r\n\r\nBuildTrack: Request a Quotation (Professional plan)',
  ])
    if (!request.body.includes(expected)) throw new Error(`posted body missing ${JSON.stringify(expected)}`);
  const pageBefore = await evaluate<string>('location.href');
  await respond(request, 200, { next: 'https://formspree.io/thanks?language=en' });
  await waitFor(() => visible('[data-confirmation]'), 'confirmation');
  expectEqual(await evaluate<string>('location.href'), pageBefore, 'stayed on the page (next is not followed)');
  if (await visible('[data-inquiry-form]')) throw new Error('form still visible after acceptance');
  if (!(await focusedIs('[data-confirmation-heading]'))) throw new Error('confirmation heading not focused');
  const confirmation = await text('[data-confirmation]');
  for (const phrase of ['Request submitted', 'accepted your quotation request', 'does not confirm that the request has reached', 'No payment, booking or subscription has been made'])
    if (!confirmation.includes(phrase)) throw new Error(`confirmation missing "${phrase}"`);
  expectEqual(
    await evaluate(`[...document.querySelectorAll('[data-confirmation] dd')].map((dd) => dd.textContent)`),
    ['Request a Quotation', 'Not sure yet', 'Professional (₱7,990 / month)'],
    'confirmation summary',
  );
  if (/\b(paid|activated|booked|scheduled|guarantee)/i.test(confirmation)) throw new Error('confirmation overclaims');
});

await scenario('failure: provider validation errors map to fields; values preserved', async () => {
  await openForm('/contact/');
  await fillValid('demo');
  const before = await formState();
  await submit();
  await respond(await nextRequest(), 422, {
    errors: [{ field: 'email', code: 'TYPE_EMAIL', message: 'should be an email <script>' }, { message: 'Form-level <b>note</b>' }],
  });
  await waitFor(() => visible('[data-error-summary]'), 'error summary');
  if (!(await focusedIs('[data-error-summary]'))) throw new Error('summary not focused');
  expectEqual(await text('#inquiry-email-error'), 'should be an email <script>', 'provider field message as text');
  expectEqual(await evaluate(`document.querySelectorAll('[data-error-summary] script, [data-error-summary] b').length`), 0, 'no markup injected');
  expectEqual(await formState(), before, 'values preserved');
  expectEqual([await text('[data-submit-label]'), await evaluate(`document.querySelector('[data-submit]').disabled`)], ['Send demo request', false], 'button restored');
});

await scenario('failure: server error offers retry that resubmits and can succeed', async () => {
  await openForm('/contact/');
  await fillValid('service');
  const before = await formState();
  await submit();
  await respond(await nextRequest(), 500, {});
  await waitFor(() => visible('[data-retry]'), 'retry button');
  expectEqual(await text('[data-error-message]'), "We couldn't send your request. Your details are still here. Please try again.", 'provider message');
  expectEqual(await formState(), before, 'values preserved');
  await evaluate(`document.querySelector('[data-retry]').click()`);
  await respond(await nextRequest(), 200, { next: '/thanks' });
  await waitFor(() => visible('[data-confirmation]'), 'confirmation after retry');
  if (!(await text('[data-confirmation]')).includes('accepted your service request')) throw new Error('wrong confirmation noun');
});

await scenario('failure: network error explains connection problem; values preserved', async () => {
  await openForm('/contact/');
  await fillValid();
  const before = await formState();
  await submit();
  await failNetwork(await nextRequest());
  await waitFor(() => visible('[data-error-summary]'), 'error summary');
  expectEqual(await text('[data-error-message]'), "We couldn't reach the form service. Check your connection and try again.", 'network message');
  if (!(await visible('[data-retry]'))) throw new Error('retry not offered');
  if (await visible('[data-confirmation]')) throw new Error('confirmation shown on failure');
  expectEqual(await formState(), before, 'values preserved');
});

await scenario('failure: rate limit asks the visitor to wait and retry', async () => {
  await openForm('/contact/');
  await fillValid();
  await submit();
  await respond(await nextRequest(), 429, { error: 'Too many requests' });
  await waitFor(() => visible('[data-error-summary]'), 'error summary');
  if (!(await text('[data-error-message]')).includes('wait a minute and try again')) throw new Error('rate-limit message missing');
});

for (const [name, body] of [
  ['an empty object', {}],
  ['a non-string next', { next: 42 }],
  ['ok without next', { ok: true }],
] as const) {
  await scenario(`uncertain: 2xx with ${name} is unconfirmed, not success or definite failure`, async () => {
    await openForm('/contact/');
    await fillValid('quotation');
    const before = await formState();
    await submit();
    await respond(await nextRequest(), 200, body);
    await waitFor(() => visible('[data-error-summary]'), 'error summary');
    await expectUncertain(before, "can't tell whether your request was accepted");
  });
}

await scenario('uncertain: no headers within the time limit is a timeout', async () => {
  await openForm('/contact/');
  await fillValid();
  const before = await formState();
  await submit();
  await nextRequest(); // Held unanswered; released after the scenario.
  await waitFor(() => visible('[data-error-summary]'), 'timeout summary', 5000);
  await expectUncertain(before, 'did not finish responding in time');
});

await scenario('uncertain: headers received but the body stalls past the time limit is still a timeout', async () => {
  await openForm('/contact/');
  await fillValid();
  const before = await formState();
  await submit();
  await stallBody(await nextRequest());
  await waitFor(() => visible('[data-error-summary]'), 'timeout summary', 5000);
  await expectUncertain(before, 'did not finish responding in time');
});

await scenario('no JavaScript: native POST to the endpoint with native validation', async () => {
  await openForm('/contact/?type=demo', { js: false });
  const shape = await evaluate(`(() => { const f = document.querySelector('form'); return { method: f.method, noValidate: f.noValidate, checked: !!f.querySelector('input[name="request_type"]:checked'), submit: !!f.querySelector('button[type="submit"]'), summaryVisible: document.querySelector('[data-error-summary]').checkVisibility() }; })()`);
  expectEqual(shape, { method: 'post', noValidate: false, checked: false, submit: true, summaryVisible: false }, 'form shape');
  expectEqual(await evaluate(`document.querySelector('form').checkValidity()`), false, 'empty form natively invalid');
  await evaluate(`(() => { const f = document.querySelector('form');
    f.querySelector('#inquiry-request_type-demo').checked = true;
    for (const [k, v] of [['name', 'TEST No-JS Check'], ['email', 'test@example.com'], ['organization', 'TEST ONLY'], ['organization_type', 'other'], ['project_need', 'TEST ONLY: no-JS path']]) f.elements.namedItem(k).value = v;
    f.querySelector('#inquiry-privacy_ack').checked = true; })()`);
  expectEqual(await evaluate(`document.querySelector('form').checkValidity()`), true, 'filled form natively valid');
  await evaluate(`document.querySelector('form').requestSubmit()`);
  const request = await nextRequest();
  expectEqual([request.method, request.url, request.resourceType], ['POST', TEST_ENDPOINT, 'Document'], 'native navigation POST');
  if (!request.body.includes('name=TEST+No-JS+Check')) throw new Error('native body missing name');
  await send('Fetch.fulfillRequest', {
    requestId: request.requestId,
    responseCode: 200,
    responseHeaders: [{ name: 'Content-Type', value: 'text/html' }],
    // The inline icon stops the browser fetching /favicon.ico from the synthetic host.
    body: Buffer.from('<link rel="icon" href="data:,"><p>Provider page (test)</p>').toString('base64'),
  });
  await waitFor(() => evaluate<boolean>(`document.body?.textContent === 'Provider page (test)'`), 'provider page shown');
});

await scenario('unconfigured build: notice only, no form, no submit control, no inquiry script', async () => {
  for (const js of [true, false]) {
    await open(unconfigured, '/contact/?type=demo', { js });
    const state = await evaluate(`({
      forms: document.querySelectorAll('form').length,
      submits: document.querySelectorAll('button[type="submit"], input[type="submit"]').length,
      notice: document.querySelector('.not-connected')?.checkVisibility() ?? false,
      inquiryScript: [...document.scripts].some((s) => /InquiryForm/.test(s.src)),
    })`);
    expectEqual(state, { forms: 0, submits: 0, notice: true, inquiryScript: false }, `unconfigured state (js ${js})`);
  }
});

/** Role, accessible name and description from Chromium's accessibility tree. */
async function axNode(selector: string) {
  const { root: doc } = await send('DOM.getDocument', { depth: 0 });
  const { nodeId } = await send('DOM.querySelector', { nodeId: doc.nodeId, selector });
  if (!nodeId) throw new Error(`no element for ${selector}`);
  const { nodes } = await send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
  const node = nodes[0];
  return { role: node?.role?.value ?? null, name: node?.name?.value ?? '', description: node?.description?.value ?? '' };
}

// Publication is human-verified (2026-10-04) and stated in the copy; delivery or testing claims are not.
const UNSUPPORTED_CLAIM = /\b(was|were|has been|have been|is|are) (received|delivered|verified|tested|confirmed)\b|\btest request\b/i;

await scenario('disclosure: an endpoint and production URL do not produce delivery claims; receipt stays pending', async () => {
  for (const [label, site] of [['configured (endpoint + production URL)', configured], ['unconfigured', unconfigured]] as const) {
    await open(site, '/how-it-works/');
    const columns = await evaluate<Record<string, string[]>>(
      `Object.fromEntries([...document.querySelectorAll('#reality h3')].map((h) => [h.textContent.trim(), [...h.parentElement.querySelectorAll('li')].map((li) => li.textContent.trim())]))`,
    );
    const pending = columns['Still to come for this website'] ?? [];
    if (!pending.includes('Confirming that requests sent from the published website reach the BuildTrack contact'))
      throw new Error(`${label}: How It Works no longer lists production receipt as still to come`);
    if (pending.includes('Publication at a public web address')) throw new Error(`${label}: verified publication still listed as pending`);
    const howText = Object.values(columns).flat().join(' | ');
    if (UNSUPPORTED_CLAIM.test(howText)) throw new Error(`${label}: How It Works claims verification: ${howText.match(UNSUPPORTED_CLAIM)?.[0]}`);
    const formWorking = (columns['Working in this prototype'] ?? []).some((item) => item.startsWith('An editable request form'));
    expectEqual(formWorking, site === configured, `${label}: form listed as working`);

    await open(site, '/about/');
    const about = await text('#disclosure');
    if (UNSUPPORTED_CLAIM.test(about)) throw new Error(`${label}: About claims verification: ${about.match(UNSUPPORTED_CLAIM)?.[0]}`);
    if (!about.includes('published at a public web address')) throw new Error(`${label}: About does not state the verified publication`);
    if (site === configured && !about.includes('Confirming that requests from the published website arrive is still to come'))
      throw new Error(`${label}: About no longer says production receipt is pending`);
  }
});

await scenario('pricing table: every cell is associated with its plan column, category and feature row', async () => {
  await open(configured, '/pricing/');
  const report = await evaluate<{ problems: string[]; cells: number; groups: number; colgroupHeaders: number }>(`(() => {
    const table = document.querySelector('#comparison table');
    const problems = [];
    const planHeads = [...table.querySelectorAll('thead th')];
    const bodies = [...table.tBodies];
    for (const body of bodies) {
      const groupHead = body.rows[0].cells[0];
      if (groupHead.tagName !== 'TH' || groupHead.getAttribute('scope') !== 'rowgroup' || groupHead.colSpan !== planHeads.length) problems.push('bad group header ' + groupHead.textContent);
      for (const row of [...body.rows].slice(1)) {
        const rowHead = row.cells[0];
        if (rowHead.tagName !== 'TH' || rowHead.getAttribute('scope') !== 'row') problems.push('bad row header ' + rowHead.textContent);
        [...row.cells].slice(1).forEach((cell, index) => {
          const ids = (cell.getAttribute('headers') || '').split(' ').filter(Boolean);
          const heads = ids.map((id) => document.getElementById(id));
          const expected = [planHeads[index + 1], groupHead, rowHead];
          if (heads.length !== 3 || heads.some((h, i) => h !== expected[i])) problems.push('cell ' + rowHead.textContent.trim() + ' / ' + planHeads[index + 1].textContent.trim() + ' headers=' + ids.join(','));
        });
      }
    }
    return { problems: problems.slice(0, 5), cells: table.querySelectorAll('td').length, groups: bodies.length, colgroupHeaders: table.querySelectorAll('[scope="colgroup"]').length };
  })()`);
  expectEqual(report.problems, [], 'header association problems');
  expectEqual([report.groups, report.colgroupHeaders], [4, 0], 'row groups / stray colgroup headers');
  if (report.cells < 3 * 16) throw new Error(`only ${report.cells} data cells`);
  const roles = {
    plan: (await axNode('#comparison thead th:nth-child(2)')).role,
    category: (await axNode('#comparison tbody th[scope="rowgroup"]')).role,
    feature: (await axNode('#comparison tbody th[scope="row"]')).role,
    cell: (await axNode('#comparison tbody td')).role,
  };
  expectEqual(roles, { plan: 'columnheader', category: 'rowheader', feature: 'rowheader', cell: 'cell' }, 'accessibility roles');
});

await scenario('error summary: a named, described group that takes focus, with no duplicate live announcement', async () => {
  await openForm('/contact/');
  await submit();
  await waitFor(() => visible('[data-error-summary]'), 'validation summary');
  if (!(await focusedIs('[data-error-summary]'))) throw new Error('summary not focused');
  expectEqual(await axNode('[data-error-summary]'), { role: 'group', name: 'Please fix the following', description: '' }, 'validation summary semantics');
  expectEqual(await text('[data-status]'), '', 'live region empty while summary is announced');
  expectEqual(await evaluate(`document.querySelector('[data-error-summary]').querySelectorAll('[aria-live], [role="alert"], [role="status"]').length`), 0, 'no live region inside the summary');

  await fillValid();
  await submit();
  await respond(await nextRequest(), 500, {});
  await waitFor(() => evaluate<boolean>(`document.querySelector('[data-error-heading]').textContent.startsWith("We couldn't send")`), 'failure summary');
  if (!(await focusedIs('[data-error-summary]'))) throw new Error('failure summary not focused');
  expectEqual(
    await axNode('[data-error-summary]'),
    { role: 'group', name: "We couldn't send your request", description: "We couldn't send your request. Your details are still here. Please try again." },
    'failure summary semantics',
  );
  expectEqual(await text('[data-status]'), '', 'live region cleared after the response');
});

// ---- 6. Report and clean up ----------------------------------------------------------
if (blocked.length) results.push({ name: 'request guard: no unexpected destinations', ok: false, detail: blocked.join(', ') });
ws.close();
chrome.kill();
for (const { server } of [configured, unconfigured]) {
  server.closeAllConnections();
  server.close();
}
await sleep(300);
try {
  rmSync(work, { recursive: true, force: true });
} catch {
  // Chromium may still hold profile files briefly on Windows.
}
for (const result of results) console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.name}${result.detail ? `\n      ${result.detail}` : ''}`);
const failed = results.filter((result) => !result.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
