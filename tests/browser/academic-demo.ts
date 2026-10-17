// Public academic demo: the website quotation journey in headless Chromium (`npm run test:browser:academic-demo`).
//
// Builds a temporary copy of the site with the COMMITTED configuration (the real quotation workflow
// stays off), serves it on 127.0.0.1 with the demo pages' Content-Security-Policy from
// public/_headers, and drives three tabs of one browser (shared localStorage), as a presenter would:
//   tab 1 Home → Pricing → plan's "Request a quotation" → demo quotation form → request received
//         (and Home → Contact → "Request a quotation — academic demo" with ?service=&plan= carried)
//   tab 2 /academic-demo/owner/  Demo owner dashboard: review, draft, approve; the invitation link
//   tab 3 /academic-demo/quote/  accept; demo checkout; confirmation; reload; a declined quotation
// Checks: service/plan continuity, live updates between tabs (storage events), reloads, reset,
// keyboard use, the approved wording, the real Contact form left as it was, only same-origin GET
// requests (no POST, no /api/, nothing to any other origin), the demo code never stored, no
// horizontal overflow at 390 px, and that the real workflow pages are not built.
// Requires CHROME_PATH (docs/ARCHITECTURE.md §8). Optional argument: a folder for screenshots.
// ACADEMIC_DEMO_SITE=https://… runs the same journey against a deployed site instead of a local build.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
const remote = process.env.ACADEMIC_DEMO_SITE?.replace(/\/$/, '');
let server: Server | null = null;
let site: string;
if (remote) {
  site = remote;
} else {
  const outDir = join(work, 'site');
  const { build } = await import('astro');
  await build({ root, outDir, logLevel: 'warn' });
  // The demo pages' policy, read from public/_headers so the test follows the deployed rule.
  const headersFile = readFileSync(join(root, 'public', '_headers'), 'utf8');
  const demoPolicy = /^\/academic-demo\/\*\r?\n\s+Content-Security-Policy: (.+)$/m.exec(headersFile)?.[1]?.trim();
  if (!demoPolicy) throw new Error('no academic-demo policy in public/_headers');
  const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.xml': 'application/xml', '.txt': 'text/plain' };
  server = createServer((req, res) => {
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
  await new Promise<void>((done) => server!.listen(0, '127.0.0.1', done));
  site = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}

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
const keys: Record<string, { code: string; keyCode: number; text?: string }> = {
  Tab: { code: 'Tab', keyCode: 9 },
  Enter: { code: 'Enter', keyCode: 13, text: '\r' },
  ' ': { code: 'Space', keyCode: 32, text: ' ' },
};
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
  const loaded = async (label: string) => {
    await sleep(200);
    await waitFor(() => evaluate<boolean>(`document.readyState === 'complete'`), `${name} ${label}`);
  };
  return {
    evaluate,
    async go(url: string) {
      await send('Page.navigate', { url }, sessionId);
      await loaded(`load ${url}`);
    },
    async reload() {
      await send('Page.reload', {}, sessionId);
      await loaded('reload');
    },
    /** Follows a link by clicking it, then waits for the new page. */
    async follow(selector: string, path: string) {
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
      await waitFor(() => evaluate<boolean>(`location.pathname === ${JSON.stringify(path)} && document.readyState === 'complete'`), `${name} follow ${selector}`);
      await sleep(150);
    },
    async press(key: keyof typeof keys) {
      const k = keys[key]!;
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: k.code, windowsVirtualKeyCode: k.keyCode, ...(k.text ? { text: k.text } : {}) }, sessionId);
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: k.code, windowsVirtualKeyCode: k.keyCode }, sessionId);
      await sleep(80);
    },
    focus: (selector: string) => evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`),
    click: (selector: string) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`),
    text: (selector: string) => evaluate<string>(`(document.querySelector(${JSON.stringify(selector)})?.textContent ?? '').replace(/\\s+/g, ' ').trim()`),
    value: (selector: string) => evaluate<string>(`document.querySelector(${JSON.stringify(selector)})?.value ?? ''`),
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
const rows = (t: Awaited<ReturnType<typeof tab>>) => t.evaluate<string[]>(`[...document.querySelectorAll('[data-rows] tr')].map((tr) => tr.textContent.replace(/\\s+/g, ' ').trim())`);

try {
  const t1 = await tab('tab 1');
  const t2 = await tab('tab 2');
  const t3 = await tab('tab 3');
  for (const t of [t1, t2, t3]) await t.width(1280);

  // ---- Tab 1: the website, from the actual Home page ------------------------------------------
  await t1.go(`${site}/`);
  ok((await t1.evaluate<string[]>(`[...document.querySelectorAll('main a')].filter((a) => a.textContent.trim() === 'Request a Quotation').map((a) => a.getAttribute('href'))`)).every((href) => href === '/academic-demo/'), 'Home: "Request a Quotation" opens the academic quotation demo');
  await t1.follow('#site-nav a[href="/pricing/"]', '/pricing/');
  ok((await t1.evaluate<string>(`document.querySelector('a[href="/academic-demo/?plan=professional"]')?.textContent.trim()`)).startsWith('Request a quotation'), 'Pricing: each plan\'s "Request a quotation" carries the plan');
  ok((await t1.evaluate<string>(`[...document.querySelectorAll('a')].find((a) => a.textContent.trim().startsWith('Avail Professional')).getAttribute('href')`)) === '/contact/?type=service&plan=professional', 'Pricing: "Avail" still opens the real service request');
  await t1.follow('a[href="/academic-demo/?plan=professional"]', '/academic-demo/');
  ok((await t1.text('.eyebrow')) === 'Contact · Quotation · Academic demo' && (await t1.text('h1')) === 'Request a quotation' && (await t1.text('.intro .notice-bar')).startsWith('Academic demo.'), 'demo form: website banner with the academic-demo notice before anything is sent');
  ok((await t1.evaluate<boolean>(`!!document.querySelector('header nav#site-nav') && !!document.querySelector('footer')`)), 'demo form: normal website header and footer');
  ok((await t1.value('#demo-plan')) === 'professional' && (await t1.value('#demo-service')) === '', 'demo form: plan Professional preselected from Pricing; service "Not sure yet"');
  ok(!(await t1.evaluate<boolean>(`!!document.querySelector('input:not([type=checkbox]), textarea')`)), 'demo form: no text, email or phone inputs (fictional sample details only)');

  // Keyboard: choose a service and a sample customer, try to send without the acknowledgment, then send.
  await t1.evaluate(`(() => { const s = document.querySelector('#demo-service'); s.value = 'delivery-monitoring'; s.dispatchEvent(new Event('change')); })()`);
  await t1.evaluate(`(() => { const s = document.querySelector('#demo-identity'); s.value = 'jose'; s.dispatchEvent(new Event('change')); })()`);
  ok((await t1.text('[data-sample="name"]')) === 'Jose Reyes' && (await t1.text('[data-sample="email"]')) === 'jose.reyes@example.test', 'demo form: sample details follow the chosen fictional customer');
  await t1.focus('[data-demo-form] .submit');
  await t1.press('Enter');
  ok((await t1.visible('#demo-ack-error')) && (await t1.evaluate<boolean>(`document.activeElement?.id === 'demo-ack'`)), 'keyboard: sending without the acknowledgment shows an error and focuses the box');
  await t1.press(' ');
  ok((await t1.evaluate<boolean>(`document.querySelector('#demo-ack').checked`)) && !(await t1.visible('#demo-ack-error')), 'keyboard: Space ticks the acknowledgment and clears the error');
  await t1.press('Tab');
  ok((await t1.evaluate<boolean>(`document.activeElement?.matches('[data-demo-form] .submit')`)), 'keyboard: Tab reaches "Send demo quotation request"');
  await t1.shot('b1-request-form');
  await t1.press('Enter');
  await waitFor(() => t1.visible('[data-demo-confirmation]'), 'request received');
  ok((await t1.text('[data-demo-confirmation-heading]')) === 'Quotation request received (academic demo)' && (await t1.evaluate<boolean>(`document.activeElement?.matches('[data-demo-confirmation-heading]')`)), 'request received: heading shown and focused');
  ok(
    (await t1.text('[data-demo-reference]')) === 'DEMO-R-0001' &&
      (await t1.text('[data-confirm-service]')) === 'Delivery monitoring' &&
      (await t1.text('[data-confirm-plan]')) === 'Professional' &&
      (await t1.text('[data-confirm-customer]')) === 'Jose Reyes, Demo Hardware Supply (fictional)',
    'request received: DEMO-R-0001 with service, plan and sample customer',
  );
  const ownerLink = await t1.evaluate<{ text: string; href: string; target: string }>(`(() => { const a = document.querySelector('[data-demo-confirmation] a.button-primary'); return { text: a.textContent.trim(), href: a.getAttribute('href'), target: a.target }; })()`);
  ok(ownerLink.text === 'Open demo owner dashboard' && ownerLink.href === '/academic-demo/owner/' && ownerLink.target === '_blank', 'request received: "Open demo owner dashboard" opens a new tab');
  await t1.shot('b2-request-received');
  await t1.reload();
  ok((await t1.visible('[data-demo-confirmation]')) && (await t1.text('[data-demo-reference]')) === 'DEMO-R-0001', 'reload keeps the request-received view');

  // ---- Tab 2: Demo owner dashboard --------------------------------------------------------------
  await t2.go(`${site}/academic-demo/owner/`);
  ok((await t2.text('.top')).includes('Demo owner dashboard') && (await t2.text('.notice')).includes("represents Sunny's review and approval"), 'owner: labelled "Demo owner dashboard", representing Sunny\'s review and approval');
  ok((await rows(t2))[0]?.includes('Delivery monitoring') && (await rows(t2))[0]?.includes('Professional'), 'owner: the request lists its service and plan');
  await t2.evaluate(`[...document.querySelectorAll('[data-rows] button')].find((b) => b.textContent === 'DEMO-R-0001').click()`);
  await waitFor(() => t2.visible('[data-part="draft"]'), 'draft form');
  ok((await t2.text('[data-request-details]')).includes('Service of interestDelivery monitoring') && (await t2.text('[data-request-details]')).includes('Plan of interestProfessional'), 'owner review: service and plan of interest shown');
  ok((await t2.value('#demo-amount')) === '7,990' && (await t2.value('#demo-scope')).startsWith('BuildTrack Professional plan with delivery monitoring for Demo Hardware Supply (fictional).'), 'owner draft: amount and scope prefilled from plan and service');
  await t2.evaluate(`document.querySelector('#demo-scope').value = ''`);
  await t2.click('[data-draft-form] button[type=submit]');
  ok((await t2.text('#demo-scope-error')).length > 0, 'owner draft: an empty scope is refused with a field error');
  await t2.evaluate(`document.querySelector('#demo-scope').value = 'BuildTrack Professional plan with delivery monitoring for two sites, onboarding and staff training (academic demo).'`);
  await t2.click('[data-draft-form] button[type=submit]');
  await waitFor(() => t2.visible('[data-part="confirm"]'), 'review');
  ok((await t2.text('[data-confirm-details]')).startsWith('ServiceDelivery monitoringPlanProfessional'), 'owner review step: service and plan in the summary');
  await t2.shot('b3-owner-review');
  await t2.focus('[data-approve]');
  await t2.press('Enter');
  await waitFor(() => t2.visible('[data-part="approved"]'), 'approved');
  ok((await t2.text('[data-quote-heading]')) === 'Quotation DEMO-Q-0001: approved', 'owner: approved DEMO-Q-0001 (keyboard)');
  ok((await t2.text('[data-quote-details]')).includes('ServiceDelivery monitoringPlanProfessional'), 'owner: quotation summary keeps service and plan');
  const link = await t2.evaluate<string>(`document.querySelector('[data-open-invitation]').href`);
  ok(link.startsWith(`${site}/academic-demo/quote/#d=`) && /#d=[A-Za-z0-9_-]{22}$/.test(link) && (await t2.text('[data-open-invitation]')) === 'Open demo customer invitation', '"Open demo customer invitation" holds a browser-only demo link');
  ok((await t2.text('[data-part="approved"] .notice')).includes('represents that emailed link') && (await t2.text('[data-part="approved"] .notice')).includes('No email is sent.'), 'owner: the invitation button represents the emailed link; no email is sent');
  await t2.shot('b4-owner-approved');
  await t2.reload();
  ok((await t2.text('[data-quote-heading]')) === 'Quotation DEMO-Q-0001: approved', 'reload keeps the owner on the open request');

  // ---- Tab 3: the customer ---------------------------------------------------------------------
  await t3.go(link);
  await waitFor(() => t3.visible('[data-q-quote]'), 'customer quotation');
  ok((await t3.text('[data-q-ref]')) === 'DEMO-Q-0001' && (await t3.visible('[data-demo-disclosure]')) && (await t3.evaluate<boolean>(`!!document.querySelector('header nav#site-nav') && !!document.querySelector('footer')`)), 'customer: DEMO-Q-0001 on the website layout with the academic demo notice');
  ok((await t3.text('[data-q-service]')) === 'Delivery monitoring' && (await t3.text('[data-q-plan]')) === 'Professional', 'customer: quotation summary shows service and plan');
  ok((await t3.evaluate<string>('location.hash')) === '', 'customer: the demo link id is removed from the address bar');
  await t3.focus('[data-q-ask="accept"]');
  await t3.press('Enter');
  await waitFor(() => t3.visible('[data-q-confirm]'), 'accept confirmation');
  ok((await t3.text('[data-q-confirm-yes]')) === 'Yes, accept this quotation', 'customer: confirmation "Yes, accept this quotation"');
  await t3.click('[data-q-confirm-yes]');
  await waitFor(() => t3.visible('[data-q-checkout]'), 'checkout');
  await waitFor(async () => (await t2.text('[data-quote-heading]')) === 'Quotation DEMO-Q-0001: accepted', 'owner sees accepted');
  ok(true, 'acceptance in tab 3 appears in tab 2 without a reload');
  ok((await t3.text('#q-checkout-heading')) === 'Demo checkout' && (await t3.text('.demo-notice')) === 'Academic demonstration. No money moves and nothing is charged.', 'checkout: "Demo checkout" and its notice');
  await t3.click('[data-q-method="card"]');
  ok(!(await t3.evaluate<boolean>(`[...document.querySelectorAll('[data-q-checkout] input')].some((i) => i.type !== 'radio' && i !== document.querySelector('[data-q-code]'))`)), 'checkout: no card, account or other financial field');
  await t3.evaluate(`document.querySelector('[data-q-code]').value = '11112222'`);
  await t3.click('[data-q-check]');
  ok((await t3.text('[data-q-code-error]')).length > 0, 'checkout: a wrong demo code is refused');
  await t3.click('[data-q-sample]');
  await t3.click('[data-q-check]');
  await waitFor(() => t3.visible('[data-q-outcome="success"]'), 'review');
  ok((await t3.text('[data-q-outcome="success"]')) === 'Complete demo payment', 'checkout: "Complete demo payment"');
  await t3.click('[data-q-outcome="success"]');
  await waitFor(async () => (await t3.text('[data-q-result-title]')) === 'Simulated success', 'demo confirmation');
  ok((await t3.text('.result h3')) === 'Demo confirmation' && (await t3.text('[data-q-checkout] .disclaimer')) === 'Simulated—no money moved. Not a payment receipt.', 'confirmation: "Demo confirmation" with the exact disclaimer');
  await t3.shot('b5-customer-confirmation');
  await waitFor(() => t2.visible('[data-history]'), 'owner sees the simulated result');
  ok((await t2.text('[data-quote-heading]')) === 'Quotation DEMO-Q-0001: accepted' && (await t2.text('[data-history-list]')).length > 0 && (await t2.text('[data-history] .hint')) === 'Simulated only. The quotation is never marked as paid.', 'owner: accepted, simulated result listed, never paid');
  await t3.reload();
  await waitFor(() => t3.visible('[data-q-checkout]'), 'after reload');
  ok((await t3.text('[data-q-ref]')) === 'DEMO-Q-0001' && (await t3.text('[data-q-answer]')).startsWith('You accepted'), 'reload keeps the same demo quotation, accepted');

  // ---- Home → Contact → "Request a quotation — academic demo", with service and plan carried ----
  await t1.go(`${site}/`);
  await t1.follow('#site-nav a[href="/contact/"]', '/contact/');
  ok((await t1.text('#demo-quotation-heading')) === 'Request a quotation — academic demo' && (await t1.visible('[data-quotation-demo-link]')), 'Contact: prominent "Request a quotation — academic demo" entry');
  const realForm = await t1.evaluate<{ action: string; method: string; types: string[] }>(`(() => { const f = document.querySelector('[data-inquiry-form]'); return { action: f.getAttribute('action'), method: f.getAttribute('method'), types: [...f.querySelectorAll('[name=request_type]')].map((i) => i.value) }; })()`);
  ok(realForm.action === 'https://formspree.io/f/mljgrgjr' && realForm.method === 'POST' && realForm.types.join() === 'demo,quotation,service', 'Contact: the real request form is unchanged (Formspree, demo/quotation/service)');
  await t1.go(`${site}/contact/?type=quotation&service=equipment-tracking&plan=enterprise`);
  ok((await t1.evaluate<string>(`document.querySelector('[data-quotation-demo-link]').getAttribute('href')`)) === '/academic-demo/?service=equipment-tracking&plan=enterprise', 'Contact: the academic demo entry carries the selected service and plan');
  ok((await t1.evaluate<boolean>(`document.querySelector('#inquiry-request_type-quotation').checked`)), 'Contact: the real form still preselects its own quotation option');
  await t1.shot('b6-contact');
  await t1.follow('[data-quotation-demo-link]', '/academic-demo/');
  ok((await t1.value('#demo-service')) === 'equipment-tracking' && (await t1.value('#demo-plan')) === 'enterprise', 'demo form: service and plan carried from Contact');
  await t1.evaluate(`(() => { const s = document.querySelector('#demo-identity'); s.value = 'ana'; s.dispatchEvent(new Event('change')); })()`);
  await t1.click('#demo-ack');
  await t1.click('[data-demo-form] .submit');
  await waitFor(async () => (await t1.text('[data-demo-reference]')) === 'DEMO-R-0002', 'second request');
  await waitFor(async () => (await t2.evaluate<number>(`document.querySelectorAll('[data-rows] tr').length`)) === 2 || (await t2.visible('[data-view="detail"]')), 'tab 2 updated');
  // A second quotation, declined: no checkout.
  await t2.click('[data-back]');
  await waitFor(async () => (await rows(t2)).length === 2, 'second request listed');
  ok((await rows(t2))[0]!.includes('Equipment tracking and utilization') && (await rows(t2))[0]!.includes('Enterprise'), 'owner: the second request appears with its service and plan');
  await t2.evaluate(`[...document.querySelectorAll('[data-rows] button')].find((b) => b.textContent === 'DEMO-R-0002').click()`);
  await waitFor(() => t2.visible('[data-part="draft"]'), 'second draft');
  ok((await t2.value('#demo-amount')) === '19,990', 'owner draft: Enterprise amount prefilled');
  await t2.click('[data-draft-form] button[type=submit]');
  await t2.click('[data-approve]');
  await waitFor(() => t2.visible('[data-part="approved"]'), 'second approval');
  await t3.go(await t2.evaluate<string>(`document.querySelector('[data-open-invitation]').href`));
  await waitFor(async () => (await t3.text('[data-q-ref]')) === 'DEMO-Q-0002', 'second quotation');
  await t3.click('[data-q-ask="decline"]');
  await t3.click('[data-q-confirm-yes]');
  await waitFor(async () => (await t3.text('[data-q-answer]')).startsWith('You declined'), 'declined');
  ok(!(await t3.visible('[data-q-checkout]')), 'a declined quotation offers no checkout');
  await waitFor(async () => (await t2.text('[data-quote-heading]')) === 'Quotation DEMO-Q-0002: declined', 'owner sees declined');

  // ---- Mobile layout --------------------------------------------------------------------------
  for (const [t, path] of [[t1, '/'], [t1, '/contact/'], [t1, '/academic-demo/'], [t2, '/academic-demo/owner/'], [t3, link]] as const) {
    await t.width(390);
    await t.go(path.startsWith('/') ? `${site}${path}` : path);
    ok(await t.evaluate<boolean>(`document.documentElement.scrollWidth <= document.documentElement.clientWidth`), `no horizontal overflow at 390 px: ${path.replace(/^https?:\/\/[^/]+/, '').replace(/#.*/, '')}`);
  }
  await t1.shot('b7-mobile-request-received');

  // ---- Reset --------------------------------------------------------------------------------------
  await t2.click('[data-back]');
  await t2.evaluate(`window.confirm = () => true`);
  await t2.click('[data-reset]');
  ok((await rows(t2)).length === 0 && (await t2.visible('[data-empty]')), 'reset: the dashboard is empty');
  await t1.reload();
  ok((await t1.visible('[data-demo-form]')) && !(await t1.visible('[data-demo-confirmation]')), 'reset: the request page shows the form again');
  await t3.go(link);
  await waitFor(() => t3.visible('[data-q-problem]'), 'link after reset');
  ok(true, 'reset: an old demo link shows a problem, no quotation');

  // ---- Isolation ----------------------------------------------------------------------------------
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
  server?.close();
  await sleep(500);
  try {
    rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  } catch {}
}
console.log(results.join('\n'));
console.log(`\n${results.length - failed}/${results.length} academic demo checks passed${remote ? ` on ${remote}` : ''}.`);
process.exit(failed ? 1 : 0);
