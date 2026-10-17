// Public academic demo: the three-tab journey in headless Chromium (`npm run test:browser:academic-demo`).
//
// Builds a temporary copy of the site with the COMMITTED configuration (the real quotation workflow
// stays off), serves it on 127.0.0.1 with the demo pages' Content-Security-Policy from
// public/_headers, and drives three tabs of one browser (shared localStorage), as a presenter would:
//   tab 1 /academic-demo/        send a demo request (fictional sample customer)
//   tab 2 /academic-demo/owner/  review, draft, confirm, approve; the invitation link
//   tab 3 /academic-demo/quote/  accept; demo checkout; confirmation; reload; a declined quotation
// Checks: live updates between tabs (storage events), the approved wording, no request other than
// same-origin GETs for pages and assets (no POST, no /api/, nothing to any other origin), the demo
// code never stored, no horizontal overflow at 390 px, and that the real workflow pages are not built.
// Requires CHROME_PATH (docs/ARCHITECTURE.md §8). Optional argument: a folder for screenshots.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'astro';

const chromePath = process.env.CHROME_PATH;
if (!chromePath || !existsSync(chromePath)) {
  console.error(`CHROME_PATH ${chromePath ? `does not exist: ${chromePath}` : 'is not set'} (see docs/ARCHITECTURE.md §8).`);
  process.exit(2);
}
const shots = process.argv[2];
if (shots) mkdirSync(shots, { recursive: true });
const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const work = mkdtempSync(join(tmpdir(), 'buildtrack-academic-demo-'));
const outDir = join(work, 'site');
await build({ root, outDir, logLevel: 'warn' });

// The demo pages' policy, read from public/_headers so the test follows the deployed rule.
const headersFile = readFileSync(join(root, 'public', '_headers'), 'utf8');
const demoPolicy = /^\/academic-demo\/\*\r?\n\s+Content-Security-Policy: (.+)$/m.exec(headersFile)?.[1]?.trim();
if (!demoPolicy) throw new Error('no academic-demo policy in public/_headers');
const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.xml': 'application/xml', '.txt': 'text/plain' };
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  let file = join(outDir, path);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!file.startsWith(outDir) || !existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('not found');
  }
  const headers: Record<string, string> = { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' };
  if (path.startsWith('/academic-demo/')) headers['Content-Security-Policy'] = demoPolicy;
  res.writeHead(200, headers);
  res.end(readFileSync(file));
});
await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
const site = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

const profile = join(work, 'profile');
const chrome = spawn(chromePath, ['--headless', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
let port = '';
for (let i = 0; i < 100 && !port; i++) {
  const f = join(profile, 'DevToolsActivePort');
  if (existsSync(f)) port = readFileSync(f, 'utf8').split('\n')[0]!.trim();
  else await sleep(100);
}
const version = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()) as { webSocketDebuggerUrl: string };
const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let nextId = 0;
const pending = new Map<number, (m: any) => void>();
const events: ((m: any) => void)[] = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(String(e.data));
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)!(m);
    pending.delete(m.id);
  } else events.forEach((listener) => listener(m));
});
const send = (method: string, params: object = {}, sessionId?: string) =>
  new Promise<any>((done, fail) => {
    const id = ++nextId;
    pending.set(id, (m) => (m.error ? fail(new Error(`${method}: ${m.error.message}`)) : done(m.result)));
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

const requests: { tab: string; url: string; method: string }[] = [];
const errors: string[] = [];
async function tab(name: string) {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  events.push((m) => {
    if (m.sessionId !== sessionId) return;
    if (m.method === 'Network.requestWillBeSent') requests.push({ tab: name, url: m.params.request.url, method: m.params.request.method });
    if (m.method === 'Runtime.exceptionThrown') errors.push(`${name}: ${JSON.stringify(m.params.exceptionDetails).slice(0, 200)}`);
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(`${name}: ${m.params.entry.text}`);
  });
  for (const domain of ['Page', 'Runtime', 'Network', 'Log']) await send(`${domain}.enable`, {}, sessionId);
  const evaluate = async <T = unknown>(expression: string): Promise<T> => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
    if (r.exceptionDetails) throw new Error(`${name} eval: ${JSON.stringify(r.exceptionDetails).slice(0, 200)}`);
    return r.result.value as T;
  };
  return {
    evaluate,
    async go(url: string) {
      await send('Page.navigate', { url }, sessionId);
      await sleep(150);
      await waitFor(() => evaluate<boolean>(`document.readyState === 'complete'`), `${name} load ${url}`);
    },
    async reload() {
      await send('Page.reload', {}, sessionId);
      await sleep(200);
      await waitFor(() => evaluate<boolean>(`document.readyState === 'complete'`), `${name} reload`);
    },
    click: (selector: string) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`),
    text: (selector: string) => evaluate<string>(`(document.querySelector(${JSON.stringify(selector)})?.textContent ?? '').replace(/\\s+/g, ' ').trim()`),
    visible: (selector: string) => evaluate<boolean>(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); return !!el && el.checkVisibility(); })()`),
    async width(w: number) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: w < 800 }, sessionId);
      await sleep(200);
    },
    async shot(file: string) {
      if (!shots) return;
      const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, sessionId);
      writeFileSync(join(shots, `${file}.png`), Buffer.from(data, 'base64'));
    },
  };
}
async function waitFor(check: () => Promise<boolean>, label: string, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      if (await check()) return;
    } catch {}
    await sleep(60);
  }
  throw new Error(`timed out: ${label}`);
}

const results: string[] = [];
let failed = 0;
const ok = (cond: boolean, label: string) => {
  results.push(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failed++;
};

try {
  const t1 = await tab('tab 1');
  const t2 = await tab('tab 2');
  const t3 = await tab('tab 3');
  for (const t of [t1, t2, t3]) await t.width(1280);

  // ---- The website leads to the demo --------------------------------------------------------
  await t1.go(`${site}/pricing/`);
  ok(await t1.evaluate<boolean>(`!!document.querySelector('a[href="/academic-demo/"]')`), 'Pricing links to the academic quotation demo');
  await t1.click('a[href="/academic-demo/"]');
  await waitFor(() => t1.evaluate<boolean>(`location.pathname === '/academic-demo/' && document.readyState === 'complete'`), 'demo request page');
  ok((await t1.text('.eyebrow')).startsWith('Academic demo'), 'tab 1 is labelled "Academic demo"');
  ok(!(await t1.evaluate<boolean>(`!!document.querySelector('input[type=text], input[type=email], input[type=tel], textarea')`)), 'tab 1 asks for no personal data (no free-text fields)');

  // ---- Tab 1: a demo request ----------------------------------------------------------------
  await t1.click('input[name="identity"][value="jose"]');
  await t1.evaluate(`document.querySelector('#demo-plan').value = 'professional'`);
  await t1.shot('a1-request');
  await t1.click('[data-demo-form] button[type=submit]');
  await waitFor(() => t1.visible('[data-demo-confirmation]'), 'request confirmation');
  ok((await t1.text('[data-demo-reference]')) === 'DEMO-R-0001', 'demo request stored with reference DEMO-R-0001');
  ok((await t1.evaluate<string>(`document.querySelector('[data-demo-confirmation] a').getAttribute('href')`)) === '/academic-demo/owner/', 'confirmation opens the demo owner dashboard');

  // ---- Tab 2: owner dashboard; a new request appears live -----------------------------------
  await t2.go(`${site}/academic-demo/owner/`);
  ok((await t2.text('.tag')) === 'ACADEMIC DEMO', 'tab 2 is labelled ACADEMIC DEMO');
  ok((await t2.evaluate<number>(`document.querySelectorAll('[data-rows] tr').length`)) === 1, 'owner dashboard lists the demo request');
  await t1.click('[data-demo-again]');
  await t1.click('input[name="identity"][value="ana"]');
  await t1.click('[data-demo-form] button[type=submit]');
  await waitFor(async () => (await t2.evaluate<number>(`document.querySelectorAll('[data-rows] tr').length`)) === 2, 'second request appears in tab 2 without reload');
  ok(true, 'a request from tab 1 appears in tab 2 without a reload');
  await t2.shot('a2-owner-list');
  await t2.evaluate(`[...document.querySelectorAll('[data-rows] button')].find((b) => b.textContent === 'DEMO-R-0001').click()`);
  await waitFor(() => t2.visible('[data-part="draft"]'), 'draft form');
  ok((await t2.evaluate<string>(`document.querySelector('#demo-amount').value`)) === '7,990', 'amount prefilled from the proposed plan price');
  await t2.click('[data-draft-form] button[type=submit]');
  ok((await t2.text('#demo-scope-error')).length > 0, 'an empty scope is refused with a field error');
  await t2.evaluate(`document.querySelector('#demo-scope').value = 'Professional setup for two sites: material tagging, dashboards and staff training (academic demo).'`);
  await t2.click('[data-draft-form] button[type=submit]');
  await waitFor(() => t2.visible('[data-part="confirm"]'), 'confirmation');
  await t2.shot('a3-owner-confirm');
  await t2.click('[data-approve]');
  await waitFor(() => t2.visible('[data-part="approved"]'), 'approved');
  ok((await t2.text('[data-quote-heading]')) === 'Quotation DEMO-Q-0001: approved', 'owner approved DEMO-Q-0001');
  const link = await t2.evaluate<string>(`document.querySelector('[data-open-invitation]').href`);
  ok(/^http:\/\/127\.0\.0\.1:\d+\/academic-demo\/quote\/#d=[A-Za-z0-9_-]{22}$/.test(link), 'the demo invitation link is a browser-only demo link');
  ok((await t2.evaluate<string>(`document.querySelector('#demo-invitation-text').value`)).includes('ACADEMIC DEMO: this invitation is fictional and is not emailed.'), 'invitation text is marked academic demo, not emailed');
  ok((await t2.text('[data-part="approved"] .notice')).includes('Nothing is emailed.'), 'owner page says nothing is emailed');
  await t2.shot('a4-owner-approved');

  // ---- Tab 3: the customer -------------------------------------------------------------------
  await t3.go(link);
  await waitFor(() => t3.visible('[data-q-quote]'), 'customer quotation');
  ok((await t3.text('[data-q-ref]')) === 'DEMO-Q-0001' && (await t3.visible('[data-demo-disclosure]')), 'tab 3 shows DEMO-Q-0001 with the academic demo notice');
  ok((await t3.evaluate<string>('location.hash')) === '', 'the demo link id is removed from the address bar');
  await t3.click('[data-q-ask="accept"]');
  await waitFor(() => t3.visible('[data-q-confirm]'), 'accept confirmation');
  await t3.click('[data-q-confirm-yes]');
  await waitFor(() => t3.visible('[data-q-checkout]'), 'checkout');
  await waitFor(async () => (await t2.text('[data-quote-heading]')) === 'Quotation DEMO-Q-0001: accepted', 'owner sees accepted');
  ok(true, 'acceptance in tab 3 appears in tab 2 without a reload');
  ok((await t3.text('#q-checkout-heading')) === 'Demo checkout' && (await t3.text('.demo-notice')) === 'Academic demonstration. No money moves and nothing is charged.', 'approved checkout wording');
  await t3.click('[data-q-method="bank"]');
  ok(!(await t3.evaluate<boolean>(`[...document.querySelectorAll('[data-q-checkout] input')].some((i) => i.type !== 'radio' && i !== document.querySelector('[data-q-code]'))`)), 'no card, account or other financial field');
  await t3.evaluate(`document.querySelector('[data-q-code]').value = '11112222'`);
  await t3.click('[data-q-check]');
  ok((await t3.text('[data-q-code-error]')).length > 0, 'a wrong demo code is refused');
  await t3.click('[data-q-sample]');
  await t3.click('[data-q-check]');
  await waitFor(() => t3.visible('[data-q-outcome="success"]'), 'review');
  ok((await t3.text('[data-q-outcome="success"]')) === 'Complete demo payment', '"Complete demo payment"');
  await t3.click('[data-q-outcome="success"]');
  await waitFor(async () => (await t3.text('[data-q-result-title]')) === 'Simulated success', 'demo confirmation');
  ok((await t3.text('.result h3')) === 'Demo confirmation' && (await t3.text('[data-q-checkout] .disclaimer')) === 'Simulated—no money moved. Not a payment receipt.', 'Demo confirmation with the exact disclaimer');
  await t3.shot('a5-customer-confirmation');
  await waitFor(() => t2.visible('[data-history]'), 'owner sees the simulated result');
  ok(
    (await t2.text('[data-quote-heading]')) === 'Quotation DEMO-Q-0001: accepted' &&
      (await t2.text('[data-history-list]')).length > 0 &&
      (await t2.text('[data-history] .hint')) === 'Simulated only. The quotation is never marked as paid.',
    'owner: accepted, simulated result listed, never paid',
  );
  await t3.reload();
  await waitFor(() => t3.visible('[data-q-checkout]'), 'after reload');
  ok((await t3.text('[data-q-ref]')) === 'DEMO-Q-0001' && (await t3.text('[data-q-answer]')).startsWith('You accepted'), 'a reload keeps the same demo quotation, accepted');

  // A second quotation, declined: no checkout.
  await t2.click('[data-back]');
  await t2.evaluate(`[...document.querySelectorAll('[data-rows] button')].find((b) => b.textContent === 'DEMO-R-0002').click()`);
  await t2.evaluate(`document.querySelector('#demo-scope').value = 'Starter setup for one residential project with training (academic demo).'`);
  await t2.click('[data-draft-form] button[type=submit]');
  await t2.click('[data-approve]');
  await waitFor(() => t2.visible('[data-part="approved"]'), 'second approval');
  await t3.go(await t2.evaluate<string>(`document.querySelector('[data-open-invitation]').href`));
  await waitFor(async () => (await t3.text('[data-q-ref]')) === 'DEMO-Q-0002', 'second quotation');
  await t3.click('[data-q-ask="decline"]');
  await t3.click('[data-q-confirm-yes]');
  await waitFor(async () => (await t3.text('[data-q-answer]')).startsWith('You declined'), 'declined');
  ok(!(await t3.visible('[data-q-checkout]')), 'a declined quotation offers no checkout');

  // ---- Unknown link, mobile, isolation --------------------------------------------------------
  await t3.go(`${site}/academic-demo/quote/#d=AAAAAAAAAAAAAAAAAAAAAA`);
  await waitFor(() => t3.visible('[data-q-problem]'), 'unknown link');
  ok(true, 'an unknown demo link shows a problem, no quotation');
  for (const [t, path] of [[t1, '/academic-demo/'], [t2, '/academic-demo/owner/'], [t3, link]] as const) {
    await t.width(390);
    if (path.startsWith('/')) await t.go(`${site}${path}`);
    else await t.go(path);
    ok(await t.evaluate<boolean>(`document.documentElement.scrollWidth <= document.documentElement.clientWidth`), `no horizontal overflow at 390 px: ${path.replace(/#.*/, '')}`);
  }
  const storage = await t1.evaluate<string>(`JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)])`);
  ok(!storage.includes('12345678') && !storage.includes('11112222'), 'the demo code is not stored');
  const offsite = requests.filter((r) => !r.url.startsWith(`${site}/`) && !r.url.startsWith('data:') && r.url !== 'about:blank');
  ok(offsite.length === 0, `no request to any other origin (${offsite.map((r) => r.url).slice(0, 3).join(', ')})`);
  ok(requests.every((r) => r.method === 'GET'), `only GET requests (${requests.filter((r) => r.method !== 'GET').length} other)`);
  ok(!requests.some((r) => r.url.includes('/api/')), 'no request to any /api/ endpoint');
  for (const path of ['/quote/', '/contact/quotation/']) ok((await fetch(`${site}${path}`)).status === 404, `the real workflow page ${path} is not built`);
  ok(errors.length === 0, `no script errors (${errors.slice(0, 2).join(' | ')})`);
} catch (error) {
  ok(false, `journey stopped: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  ws.close();
  chrome.kill();
  server.close();
  await sleep(500);
  try {
    rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  } catch {}
}
console.log(results.join('\n'));
console.log(`\n${results.length - failed}/${results.length} academic demo checks passed.`);
process.exit(failed ? 1 : 0);
