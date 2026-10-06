// Browser regression tests for Home and Product Demo interaction: `npm run test:browser`
// (runs after the inquiry form test).
//
// Builds a temporary copy of the site (the real `dist/` is never touched), serves it locally
// and drives Chromium over the DevTools protocol. The local server can hold the hero MP4
// response until a scenario releases it. Every request to any other origin is blocked and
// fails the run; no form is submitted.
//
// Covers: reduced motion turned on while automatic hero playback is still loading (no
// automatic `playing` event afterwards, explicit Play/Pause kept); reflow at 320/390 px with a
// genuine 32 px browser default font (Page.setFontSizes, not CSS); the demo drawer's focus
// wrap in both directions; the Home workflow steps; and the "Who we serve" collage and its
// static fallbacks.
//
// Requires CHROME_PATH (docs/ARCHITECTURE.md §8) pointing at a Chromium build that can play
// H.264 MP4 (the video scenarios fail with an explanation otherwise).
// Uses only Node built-ins and Astro.

import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'astro';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

const chromePath = process.env.CHROME_PATH;
if (!chromePath || !existsSync(chromePath)) {
  console.error(`CHROME_PATH ${chromePath ? `does not exist: ${chromePath}` : 'is not set'} (see docs/ARCHITECTURE.md §8).`);
  process.exit(2);
}

// ---- 1. Build and serve ------------------------------------------------------------------
const work = mkdtempSync(join(tmpdir(), 'buildtrack-ui-'));
const outDir = join(work, 'site');
await build({ root, outDir, logLevel: 'warn' });

const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
};
let holdVideo = false;
const heldVideo: (() => void)[] = [];
let videoRequests = 0;
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  let file = join(outDir, path);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!file.startsWith(outDir) || !existsSync(file)) {
    res.writeHead(404).end('Not found');
    return;
  }
  const send = (response: ServerResponse) =>
    response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
  if (extname(file) === '.mp4') {
    videoRequests++;
    if (holdVideo) {
      heldVideo.push(() => send(res));
      return;
    }
  }
  send(res);
});
await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
const address = server.address();
const origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
const releaseVideo = () => {
  holdVideo = false;
  for (const release of heldVideo.splice(0)) release();
};

// ---- 2. Chromium over CDP ----------------------------------------------------------------
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

const blocked: string[] = [];
const pageErrors: string[] = [];
listeners.push((message) => {
  if (message.method === 'Runtime.exceptionThrown')
    pageErrors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
  if (message.method !== 'Fetch.requestPaused') return;
  const { requestId, request } = message.params;
  if (request.url.startsWith(`${origin}/`)) void send('Fetch.continueRequest', { requestId });
  else {
    blocked.push(`${request.method} ${request.url}`);
    void send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' });
  }
});
await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setFocusEmulationEnabled', { enabled: true });
await send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });

async function waitFor(check: () => Promise<boolean> | boolean, label: string, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await check()) return;
    await sleep(40);
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

interface OpenOptions {
  width?: number;
  height?: number;
  fontSize?: number;
  reduced?: boolean;
  js?: boolean;
}
const setReducedMotion = (reduced: boolean) =>
  send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }] });

// Counts every `playing` event on any media element from the start of each document.
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `window.__playing = 0; document.addEventListener('playing', () => window.__playing++, true);`,
});

async function open(path: string, { width = 1280, height = 800, fontSize = 16, reduced = false, js = true }: OpenOptions = {}) {
  await send('Emulation.setScriptExecutionDisabled', { value: !js });
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 800 });
  await send('Page.setFontSizes', { fontSizes: { standard: fontSize, fixed: 13 } });
  await setReducedMotion(reduced);
  const loaded = new Promise<void>((done) => {
    const listener = (m: any) => {
      if (m.method !== 'Page.loadEventFired') return;
      listeners.splice(listeners.indexOf(listener), 1);
      done();
    };
    listeners.push(listener);
  });
  await send('Page.navigate', { url: origin + path });
  await loaded;
  const url = origin + path;
  await waitFor(() => evaluate<boolean>(`location.href === ${JSON.stringify(url)} && document.readyState === 'complete'`), `page ${url}`);
  await evaluate(`document.fonts.ready.then(() => true)`);
  const actual = await evaluate<string>(`getComputedStyle(document.documentElement).fontSize`);
  if (actual !== `${fontSize}px`) throw new Error(`browser default font is ${actual}, expected ${fontSize}px`);
}

const keyCodes: Record<string, number> = { Tab: 9, Enter: 13, Escape: 27, ' ': 32 };
async function press(key: string, shift = false) {
  const params = { key, code: key === ' ' ? 'Space' : key, windowsVirtualKeyCode: keyCodes[key], modifiers: shift ? 8 : 0 };
  const text = key === 'Enter' ? '\r' : key === ' ' ? ' ' : undefined;
  await send('Input.dispatchKeyEvent', { type: 'keyDown', ...params, ...(text ? { text } : {}) });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
}
async function click(selector: string) {
  const point = await evaluate<{ x: number; y: number } | null>(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null;
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  if (!point) throw new Error(`no element ${selector}`);
  for (const type of ['mousePressed', 'mouseReleased'])
    await send('Input.dispatchMouseEvent', { type, x: point.x, y: point.y, button: 'left', clickCount: 1 });
}
/** A short, stable description of the focused element. */
const focused = () =>
  evaluate<string>(`(() => { const el = document.activeElement; if (!el || el === document.body) return 'body';
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + ':' + (el.textContent || el.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim().slice(0, 40); })()`);

const results: { name: string; ok: boolean; detail?: string }[] = [];
async function scenario(name: string, run: () => Promise<void>) {
  pageErrors.length = 0;
  try {
    await run();
    if (pageErrors.length) throw new Error(`script errors: ${pageErrors.join(' | ')}`);
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, detail: error instanceof Error ? error.message : String(error) });
  }
  releaseVideo();
}
function expectEqual(actual: unknown, expected: unknown, label: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ---- 3. Hero video: pending autoplay and reduced motion ---------------------------------
const video = () =>
  evaluate<{ exists: boolean; paused: boolean; playing: number; label: string; classPlaying: boolean }>(`(() => {
    const v = document.querySelector('[data-hero-media] video');
    return { exists: !!v, paused: v ? v.paused : true, playing: window.__playing,
      label: document.querySelector('[data-video-label]')?.textContent ?? '',
      classPlaying: document.querySelector('[data-hero-media]').classList.contains('is-playing') };
  })()`);
const canPlayMp4 = async () => (await evaluate<string>(`document.createElement('video').canPlayType('video/mp4')`)) !== '';

/** Opens Home with the MP4 response held, so automatic playback is still loading. */
async function openWithHeldVideo() {
  holdVideo = true;
  videoRequests = 0;
  await open('/');
  if (!(await canPlayMp4())) throw new Error('this browser cannot play MP4; use a Chromium build with H.264 (CHROME_PATH)');
  await waitFor(() => heldVideo.length > 0, 'the held MP4 request');
  const state = await video();
  if (!state.exists || state.paused !== false || state.playing !== 0) throw new Error(`not pending: ${JSON.stringify(state)}`);
}

await scenario('video: reduced motion during a held MP4 response pauses at once; no automatic playing event after release', async () => {
  await openWithHeldVideo();
  await setReducedMotion(true);
  // The media query change event fires on the next rendering update; the response stays held.
  await evaluate(`new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))`);
  expectEqual(heldVideo.length > 0, true, 'response still held');
  const now = await video();
  expectEqual(now.paused, true, 'paused immediately (before the response)');
  expectEqual(now.label, 'Play background video', 'control offers Play');
  releaseVideo();
  await sleep(1500);
  const after = await video();
  expectEqual([after.playing, after.paused, after.classPlaying, after.label], [0, true, false, 'Play background video'], 'after release');
});

await scenario('video: after that cancellation the visitor can still press Play (stale callbacks do not override it)', async () => {
  await openWithHeldVideo();
  await setReducedMotion(true);
  await click('[data-video-toggle]');
  releaseVideo();
  await waitFor(async () => (await video()).playing > 0, 'playing after the visitor pressed Play');
  await sleep(500);
  const state = await video();
  expectEqual([state.paused, state.label], [false, 'Pause background video'], 'visitor Play kept under reduced motion');
});

await scenario('video: a visitor Pause while automatic playback is loading is kept after the response arrives', async () => {
  await openWithHeldVideo();
  expectEqual((await video()).label, 'Pause background video', 'loading autoplay offers Pause');
  await click('[data-video-toggle]');
  releaseVideo();
  await sleep(1500);
  await setReducedMotion(true);
  await setReducedMotion(false);
  await sleep(800);
  const state = await video();
  expectEqual([state.playing, state.paused, state.label], [0, true, 'Play background video'], 'visitor Pause kept');
});

await scenario('video: reduced motion on then off while loading lets the newer automatic playback start once', async () => {
  await openWithHeldVideo();
  await setReducedMotion(true);
  await setReducedMotion(false);
  releaseVideo();
  await waitFor(async () => (await video()).playing > 0, 'automatic playback resumed');
  const state = await video();
  expectEqual([state.paused, state.label], [false, 'Pause background video'], 'playing');
});

await scenario('video: reduced motion from the start makes no MP4 request and a visitor Play works', async () => {
  videoRequests = 0;
  await open('/', { reduced: true });
  await sleep(600);
  expectEqual(videoRequests, 0, 'MP4 requests');
  await click('[data-video-toggle]');
  await waitFor(async () => (await video()).playing > 0, 'visitor playback');
  await click('[data-video-toggle]');
  expectEqual((await video()).paused, true, 'visitor Pause');
});

// ---- 4. Reflow with a genuine 32 px browser default font --------------------------------
/** Document overflow, clipped headings, and page-level overflow concealment. */
// Hyphenation is switched off first: not every browser has hyphenation dictionaries, so long
// words must fit by wrapping, not by relying on hyphens: auto.
const reflowProblems = () =>
  evaluate<string[]>(`(() => {
    const style = document.createElement('style');
    style.textContent = '* { hyphens: manual !important; }';
    document.head.append(style);
    const problems = [];
    const width = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > width) problems.push('document scrollWidth ' + document.documentElement.scrollWidth + ' > ' + width);
    for (const el of [document.documentElement, document.body, document.querySelector('main')])
      if (el && /hidden|clip/.test(getComputedStyle(el).overflowX)) problems.push(el.tagName + ' overflow-x ' + getComputedStyle(el).overflowX);
    const range = document.createRange();
    for (const el of document.querySelectorAll('h1, h2, h3, .panel-label, .step-label')) {
      if (!el.checkVisibility() || el.clientWidth <= 1 || el.closest('.visually-hidden')) continue;
      if (el.scrollWidth > el.clientWidth + 1) problems.push(el.tagName + ' "' + el.textContent.trim().slice(0, 30) + '" scrollWidth ' + el.scrollWidth + ' > ' + el.clientWidth);
      range.selectNodeContents(el);
      for (const r of range.getClientRects()) if (r.width && (r.left < -0.5 || r.right > width + 0.5)) {
        problems.push(el.tagName + ' "' + el.textContent.trim().slice(0, 30) + '" text spans ' + Math.round(r.left) + '–' + Math.round(r.right)); break; }
      // Clipped by an ancestor that hides overflow (e.g. a card or a scroller).
      const box = el.getBoundingClientRect();
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const s = getComputedStyle(a);
        if (!/hidden|clip/.test(s.overflowX) || a.matches('.scrolly-viewport, [data-scrolly-sticky]')) continue;
        const ab = a.getBoundingClientRect();
        if (ab.width <= 1) break; // a visually hidden wrapper
        if (box.left < ab.left - 0.5 || box.right > ab.right + 0.5) { problems.push(el.tagName + ' "' + el.textContent.trim().slice(0, 30) + '" clipped by ' + a.className); break; }
      }
    }
    return problems;
  })()`);

const routes = ['/', '/solutions/', '/how-it-works/', '/product-demo/', '/pricing/', '/about/', '/contact/'];
for (const width of [320, 390]) {
  for (const js of [true, false]) {
    await scenario(`reflow: ${width} px, 32 px default font, JavaScript ${js ? 'on' : 'off'}: no overflow or clipped headings on ${routes.length} routes`, async () => {
      const problems: string[] = [];
      for (const route of routes) {
        await open(route, { width, height: 700, fontSize: 32, js });
        for (const problem of await reflowProblems()) problems.push(`${route} ${problem}`);
      }
      if (problems.length) throw new Error(problems.slice(0, 8).join('; '));
    });
  }
}

await scenario('reflow: Home at 768, 1024 and 1280 px with a 32 px default font', async () => {
  const problems: string[] = [];
  for (const width of [768, 1024, 1280]) {
    await open('/', { width, height: 800, fontSize: 32 });
    for (const problem of await reflowProblems()) problems.push(`${width} ${problem}`);
  }
  if (problems.length) throw new Error(problems.slice(0, 8).join('; '));
});

// ---- 5. Demo drawer focus containment ---------------------------------------------------
await scenario('demo drawer: Tab and Shift+Tab wrap inside the open drawer; Escape restores focus', async () => {
  await open('/product-demo/', { width: 390, height: 844 });
  await click('[data-drawer-toggle]');
  await waitFor(() => evaluate<boolean>(`document.querySelector('[data-demo-sidebar]').matches('[role=dialog][data-open]')`), 'drawer open');
  const focusables = await evaluate<string[]>(`[...document.querySelector('[data-demo-sidebar]').querySelectorAll('a[href], button:not([disabled])')]
    .filter((el) => el.checkVisibility()).map((el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + ':' + (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40))`);
  const inside = () => evaluate<boolean>(`document.querySelector('[data-demo-sidebar]').contains(document.activeElement)`);
  const count = focusables.length;
  if (count < 3) throw new Error(`too few drawer controls: ${count}`);
  // Forward: two full rounds; every stop is inside and the sequence wraps last → first.
  const forward: string[] = [];
  for (let i = 0; i < count * 2 + 1; i++) {
    await press('Tab');
    if (!(await inside())) throw new Error(`Tab ${i + 1} left the drawer: ${await focused()}`);
    forward.push(await focused());
  }
  await evaluate(`document.querySelector('[data-demo-sidebar]').querySelectorAll('a[href]')[0].focus()`);
  expectEqual(await focused(), focusables[0], 'first control');
  await press('Tab', true);
  expectEqual(await focused(), focusables[count - 1], 'Shift+Tab from the first goes to the last');
  await press('Tab');
  expectEqual(await focused(), focusables[0], 'Tab from the last goes to the first');
  for (let i = 0; i < count * 2 + 1; i++) {
    await press('Tab', true);
    if (!(await inside())) throw new Error(`Shift+Tab ${i + 1} left the drawer: ${await focused()}`);
  }
  // The outside stays inert and Escape closes and returns focus.
  expectEqual(await evaluate(`document.querySelector('.app-workspace').inert`), true, 'workspace inert');
  await press('Escape');
  expectEqual(await evaluate(`document.querySelector('[data-demo-sidebar]').hasAttribute('data-open')`), false, 'closed');
  expectEqual(await evaluate(`document.activeElement === document.querySelector('[data-drawer-toggle]')`), true, 'focus back on Sections');
  expectEqual(await evaluate(`document.querySelector('.app-workspace').inert`), false, 'workspace no longer inert');
});

// ---- 6. Home workflow --------------------------------------------------------------------
await scenario('workflow: three image-led steps with number, heading and one sentence; simulation disclosure kept', async () => {
  for (const width of [1440, 390]) {
    await open('/', { width, height: 900 });
    const steps = await evaluate<{ image: boolean; heading: string; texts: number }[]>(`Promise.all([...document.querySelectorAll('.steps > li')].map(async (li) => {
      const img = li.querySelector('img'); img.loading = 'eager'; await img.decode().catch(() => {});
      return { image: img.naturalWidth > 0 && img.checkVisibility() && img.getBoundingClientRect().width > 0.8 * li.getBoundingClientRect().width,
        heading: li.querySelector('.step-number').textContent + '|' + [...li.querySelector('h3').childNodes]
          .filter((n) => !n.classList?.contains('step-number')).map((n) => n.textContent).join('').replace(/\\s+/g, ' ').trim(), texts: li.querySelectorAll('p').length };
    }))`);
    expectEqual(steps, [
      { image: true, heading: '01|Step 1: Record site activity', texts: 1 },
      { image: true, heading: '02|Step 2: Monitor resources', texts: 1 },
      { image: true, heading: '03|Step 3: Review project information', texts: 1 },
    ], `steps at ${width}`);
    const lead = await evaluate<string>(`document.querySelector('.workflow .lead').textContent.replace(/\\s+/g, ' ')`);
    if (!lead.includes('No QR, RFID or IoT hardware is connected') || !lead.includes('proposed concept')) throw new Error(`lead: ${lead}`);
    if (!(await evaluate<boolean>(`/not BuildTrack projects, customers or working hardware/.test(document.querySelector('.workflow').textContent)`)))
      throw new Error('stock photo disclaimer missing');
  }
});

// ---- 7. "Who we serve" collage -----------------------------------------------------------
const collage = () =>
  evaluate<{ enhanced: boolean; buttons: number; hints: number; descriptions: number; labels: number; detail: boolean; p: string }>(`(() => {
    const section = document.querySelector('[data-collage]');
    const items = [...section.querySelectorAll('[data-audience]')];
    return { enhanced: section.classList.contains('is-collage'),
      buttons: items.filter((li) => li.querySelector('[data-audience-select]').checkVisibility()).length,
      hints: items.filter((li) => { const h = li.querySelector('.audience-hint'); return h.checkVisibility() && h.textContent.includes('View details'); }).length,
      descriptions: items.filter((li) => li.querySelector('[data-audience-need]').checkVisibility()).length,
      labels: items.filter((li) => li.querySelector('[data-audience-label]').checkVisibility()).length,
      detail: section.querySelector('[data-collage-detail]').checkVisibility(),
      p: section.querySelector('[data-collage-stage]').style.getPropertyValue('--p') };
  })()`);
const centreCollage = (offset = 0) =>
  evaluate(`(() => { const r = document.querySelector('.collage-layout').getBoundingClientRect();
    window.scrollTo({ top: r.top + scrollY - 64 - (innerHeight - 64 - r.height) / 2 + ${offset}, behavior: 'instant' }); })()`).then(() => sleep(250));
const readP = async () => Number((await collage()).p);
const staticCollage = { enhanced: false, buttons: 0, hints: 0, descriptions: 7, labels: 7, detail: false, p: '' };

await scenario('collage: desktop shows all seven tilted photos at rest with upright labels and View details indicators', async () => {
  await open('/', { width: 1440, height: 900 });
  await centreCollage();
  const state = await collage();
  expectEqual([state.enhanced, state.buttons, state.hints, state.labels, state.descriptions, state.detail], [true, 7, 7, 7, 0, true], 'collage state');
  const layout = await evaluate<{ inView: number; upright: boolean; tilted: number; overflow: boolean }>(`(() => {
    const items = [...document.querySelectorAll('[data-audience]')];
    const angle = (el) => { const m = new DOMMatrix(getComputedStyle(el).transform); return Math.abs(Math.atan2(m.b, m.a) * 180 / Math.PI); };
    return { inView: items.filter((li) => { const r = li.getBoundingClientRect(); return r.top >= 64 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; }).length,
      upright: items.every((li) => angle(li) < 0.01 && angle(li.querySelector('h3')) < 0.01),
      tilted: items.filter((li) => angle(li.querySelector('.audience-media')) > 0.5).length,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
  })()`);
  expectEqual(layout, { inView: 7, upright: true, tilted: 7, overflow: false }, 'all seven in view, labels upright, photos tilted');
});

await scenario('collage: motion follows ordinary scrolling (wheel not captured) and never runs on its own', async () => {
  await open('/', { width: 1440, height: 900 });
  await centreCollage(-200);
  const before = await readP();
  await sleep(800);
  expectEqual(await readP(), before, 'no movement without scrolling');
  const y = await evaluate<number>('scrollY');
  const point = await evaluate<{ x: number; y: number }>(`(() => { const r = document.querySelector('[data-audience]').getBoundingClientRect(); return { x: r.left + 20, y: r.top + 20 }; })()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: point.x, y: point.y, deltaX: 0, deltaY: 300 });
  await waitFor(async () => (await evaluate<number>('scrollY')) > y + 100, 'the wheel scrolls the page');
  await sleep(200);
  if (!((await readP()) > before + 0.2)) throw new Error(`progress did not follow scrolling: ${before} → ${await readP()}`);
});

await scenario('collage: Enter, Space and click select an audience and show its approved description in the adjacent area', async () => {
  await open('/', { width: 1440, height: 900 });
  await centreCollage();
  const detail = () => evaluate<string>(`document.querySelector('[data-collage-detail]').innerText.replace(/\\s+/g, ' ').trim()`);
  const pressed = () => evaluate<string[]>(`[...document.querySelectorAll('[data-audience-select]')].map((b) => b.getAttribute('aria-pressed'))`);
  // Position within the collage layout (the click helper may scroll the page).
  const box = () =>
    evaluate<number>(`document.querySelector('[data-collage-detail]').getBoundingClientRect().top - document.querySelector('.collage-layout').getBoundingClientRect().top`);
  const top = await box();
  await evaluate(`document.querySelector('.segments h2').setAttribute('tabindex', '-1'); document.querySelector('.segments h2').focus()`);
  await press('Tab');
  expectEqual(
    await evaluate(`document.activeElement === document.querySelector('[data-audience="construction-companies"] [data-audience-select]')`),
    true,
    'first Tab stop is the first audience',
  );
  await press('Enter');
  expectEqual(await detail(), 'Construction companies (small, medium and large) One view of materials and equipment across every active site.', 'Enter');
  await press('Tab');
  await press(' ');
  expectEqual(await detail(), 'Contractors and subcontractors Know what is on hand before work starts and account for what was used.', 'Space');
  expectEqual(await pressed(), ['false', 'true', 'false', 'false', 'false', 'false', 'false'], 'aria-pressed');
  await click('[data-audience="equipment-rental"] .audience-media');
  expectEqual(await detail(), 'Equipment rental companies Track where rented units are, how they are used and when they are due back.', 'click');
  expectEqual(await evaluate(`document.querySelector('[data-collage-detail]').getAttribute('aria-live')`), 'polite', 'live region');
  if (Math.abs((await box()) - top) > 1) throw new Error('description area moved');
  // Every audience is reachable by keyboard.
  const names = await evaluate<string[]>(`[...document.querySelectorAll('[data-audience-select]')].map((b) => b.textContent.replace(/\\s+/g, ' ').trim())`);
  expectEqual(names.length, 7, 'seven buttons');
});

await scenario('collage: movement pauses while focus is inside and resumes without a positional jump', async () => {
  await open('/', { width: 1440, height: 900 });
  await centreCollage(-150);
  await evaluate(`document.querySelector('[data-audience-select]').focus()`);
  await press('Enter');
  const frozen = await readP();
  await evaluate(`scrollBy({ top: 250, behavior: 'instant' })`);
  await sleep(250);
  expectEqual(await readP(), frozen, 'paused while a selected description is being read');
  await evaluate(`document.activeElement.blur()`);
  await evaluate(`scrollBy({ top: 10, behavior: 'instant' })`);
  await sleep(250);
  const resumed = await readP();
  if (Math.abs(resumed - frozen) > 0.05) throw new Error(`jumped on resume: ${frozen} → ${resumed}`);
  await evaluate(`scrollBy({ top: 120, behavior: 'instant' })`);
  await sleep(250);
  if (!((await readP()) > resumed + 0.1)) throw new Error('did not continue after resuming');
});

await scenario('collage: static image-led grid on mobile, with reduced motion, without JavaScript, on short screens and with 32 px text', async () => {
  const cases: [string, OpenOptions][] = [
    ['390 px', { width: 390, height: 844 }],
    ['768 px', { width: 768, height: 1024 }],
    ['reduced motion', { width: 1440, height: 900, reduced: true }],
    ['short 1440×600', { width: 1440, height: 600 }],
    ['32 px text at 1280', { width: 1280, height: 800, fontSize: 32 }],
  ];
  for (const [label, options] of cases) {
    await open('/', options);
    expectEqual(await collage(), staticCollage, label);
    if (await evaluate<boolean>(`document.documentElement.scrollWidth > document.documentElement.clientWidth`)) throw new Error(`${label}: overflow`);
  }
  await open('/', { width: 1440, height: 900, js: false });
  expectEqual(await collage(), { ...staticCollage, p: '' }, 'no JavaScript');
});

await scenario('collage: reduced motion turned on and off while open switches static ↔ collage and keeps the selection', async () => {
  await open('/', { width: 1440, height: 900 });
  await centreCollage();
  await evaluate(`document.querySelectorAll('[data-audience-select]')[3].click(); document.activeElement.blur()`);
  await setReducedMotion(true);
  await waitFor(async () => !(await collage()).enhanced, 'static under reduced motion');
  expectEqual(await collage(), staticCollage, 'static');
  await setReducedMotion(false);
  await waitFor(async () => (await collage()).enhanced, 'collage again');
  expectEqual(await evaluate(`document.querySelector('[data-collage-detail]').innerText.includes('Civil engineering firms')`), true, 'selection kept');
});

// Focus on an audience button when the collage switches to the static grid: it must move to
// that audience's heading (never BODY), keep the selection, stay visible below the sticky
// header, and Tab must continue from there. Focus is not blurred before the transition.
const collageTransitions: [string, () => Promise<unknown>][] = [
  ['reduced motion turned on', () => setReducedMotion(true)],
  ['window resized to 768 px', () => send('Emulation.setDeviceMetricsOverride', { width: 768, height: 900, deviceScaleFactor: 1, mobile: false })],
  ['browser default text raised to 32 px', () => send('Page.setFontSizes', { fontSizes: { standard: 32, fixed: 13 } })],
];
for (const [label, transition] of collageTransitions) {
  await scenario(`collage focus: ${label} while "Equipment rental companies" has focus moves focus to its heading`, async () => {
    await open('/', { width: 1440, height: 900 });
    await centreCollage();
    await click('[data-audience="equipment-rental"] .audience-media');
    const button = `document.querySelector('[data-audience="equipment-rental"] [data-audience-select]')`;
    expectEqual(await evaluate(`document.activeElement === ${button}`), true, 'button focused before the transition');
    // Records any moment at which focus has fallen to BODY.
    await evaluate(`window.__bodyFocus = 0; document.addEventListener('focusout', () => setTimeout(() => {
      if (!document.activeElement || document.activeElement === document.body) window.__bodyFocus++; }), true)`);
    await transition();
    await waitFor(async () => !(await collage()).enhanced, 'static grid');
    await evaluate(`new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 50))))`);
    const state = await evaluate<Record<string, unknown>>(`(() => {
      const item = document.querySelector('[data-audience="equipment-rental"]');
      const heading = item.querySelector('[data-audience-label]');
      const text = item.querySelector('.audience-text');
      const header = document.querySelector('[data-site-header]').getBoundingClientRect().bottom;
      const r = text.getBoundingClientRect();
      return { onHeading: document.activeElement === heading, bodyFocus: window.__bodyFocus,
        notTabStop: heading.tabIndex < 0, selected: ${button}.getAttribute('aria-pressed') === 'true' && item.classList.contains('is-selected'),
        visible: heading.checkVisibility() && item.querySelector('[data-audience-need]').checkVisibility(),
        belowHeader: r.top >= header - 0.5, inViewport: r.bottom <= innerHeight + 0.5 };
    })()`);
    expectEqual(state, { onHeading: true, bodyFocus: 0, notTabStop: true, selected: true, visible: true, belowHeader: true, inViewport: true }, 'after the transition');
    await press('Tab');
    const next = await evaluate<{ body: boolean; after: boolean; visible: boolean; text: string }>(`(() => {
      const el = document.activeElement; const section = document.querySelector('[data-collage]');
      const r = el.getBoundingClientRect(); const header = document.querySelector('[data-site-header]').getBoundingClientRect().bottom;
      return { body: el === document.body, after: !!(section.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) && !section.contains(el),
        visible: r.top >= header - 0.5 && r.bottom <= innerHeight + 0.5, text: el.textContent.replace(/\\s+/g, ' ').trim() };
    })()`);
    if (next.body || !next.after || !next.visible) throw new Error(`Tab after the transition: ${JSON.stringify(next)}`);
  });
}

await scenario('collage focus: focus elsewhere is not moved when the collage switches to the static grid', async () => {
  await open('/', { width: 1440, height: 900 });
  await centreCollage();
  await evaluate(`document.querySelector('.workflow-foot a').focus({ preventScroll: true })`);
  await setReducedMotion(true);
  await waitFor(async () => !(await collage()).enhanced, 'static grid');
  await sleep(100);
  expectEqual(await evaluate(`document.activeElement === document.querySelector('.workflow-foot a')`), true, 'focus kept');
  expectEqual(await evaluate(`[...document.querySelectorAll('[data-audience-label]')].some((h) => h.hasAttribute('tabindex'))`), false, 'no heading made focusable');
});

// ---- 8. Capability showcase under live text-size changes ----------------------------------
// The browser default text size changes without a resize or reload (Page.setFontSizes).
const setTextSize = async (size: number) => {
  await send('Page.setFontSizes', { fontSizes: { standard: size, fixed: 13 } });
  await waitFor(() => evaluate<boolean>(`getComputedStyle(document.documentElement).fontSize === '${size}px'`), `${size} px text`);
  // Settled once two frames apart give the same layout (bounded by waitFor).
  let last = '';
  await waitFor(async () => {
    const now = await evaluate<string>(`new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => {
      const s = document.querySelector('[data-scrolly]'); done([s.className, s.style.height, scrollY, document.querySelector('[data-scrolly-track]').style.transform].join('|')); })))`);
    const stable = now === last;
    last = now;
    return stable;
  }, 'layout settled');
};
const scrolly = () =>
  evaluate<{ pinned: boolean; consistent: boolean; overflow: boolean }>(`(() => {
    const s = document.querySelector('[data-scrolly]'), track = document.querySelector('[data-scrolly-track]');
    const vp = document.querySelector('[data-scrolly-viewport]'), sticky = document.querySelector('[data-scrolly-sticky]');
    const content = document.querySelector('[data-scrolly-content]');
    const pinned = s.classList.contains('is-scrolly');
    const travel = Math.ceil(track.offsetWidth - vp.clientWidth);
    const offset = -new DOMMatrix(getComputedStyle(track).transform).m41;
    const consistent = pinned
      ? Math.abs(parseFloat(s.style.height) - (sticky.clientHeight + travel)) <= 1 && content.getBoundingClientRect().height <= sticky.clientHeight && offset >= -0.5 && offset <= travel + 0.5
      : s.style.height === '' && getComputedStyle(track).transform === 'none';
    return { pinned, consistent, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
  })()`);
/** Whether the element is actually rendered on screen: below the header, inside the viewport and not clipped by the pinned track's viewport. */
const onScreen = (expression: string) =>
  evaluate<boolean>(`(() => {
    const el = ${expression}; if (!el || !el.checkVisibility()) return false;
    const r = el.getBoundingClientRect(); const header = document.querySelector('[data-site-header]').getBoundingClientRect().bottom;
    if (r.top < header - 0.5 || r.bottom > innerHeight + 0.5 || r.left < -0.5 || r.right > innerWidth + 0.5) return false;
    const vp = el.closest('[data-scrolly-viewport]');
    if (vp && document.querySelector('[data-scrolly]').classList.contains('is-scrolly')) {
      const v = vp.getBoundingClientRect(); if (r.left < v.left - 0.5 || r.right > v.right + 0.5 || r.top < v.top - 0.5 || r.bottom > v.bottom + 0.5) return false;
    }
    return true;
  })()`);
const lastLink = `[...document.querySelectorAll('.scrolly-panel a')].at(-1)`;
/** At the end of the pinned range the last panel must be fully shown (travel is current). */
const lastPanelAtEnd = async () => {
  await evaluate(`(() => { const s = document.querySelector('[data-scrolly]'); const header = document.querySelector('[data-site-header]').getBoundingClientRect().height;
    const track = document.querySelector('[data-scrolly-track]'), vp = document.querySelector('[data-scrolly-viewport]');
    scrollTo({ top: s.getBoundingClientRect().top + scrollY - header + Math.ceil(track.offsetWidth - vp.clientWidth), behavior: 'instant' }); })()`);
  await evaluate(`new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))`);
  return onScreen(`document.querySelector('.scrolly-panel:last-child')`);
};

await scenario('capabilities: live text 16→20→32→16 px with focus on the final capability link keeps it focused and visible', async () => {
  await open('/', { width: 1440, height: 900 });
  await evaluate(`[...document.querySelectorAll('.scrolly-panel a')].at(-2).focus()`);
  await press('Tab');
  expectEqual(await evaluate(`document.activeElement === ${lastLink}`), true, 'final link focused by Tab');
  await evaluate(`new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))`);
  expectEqual([(await scrolly()).pinned, await onScreen(lastLink)], [true, true], '16 px');
  for (const [size, pinned] of [[20, true], [32, false], [16, true]] as const) {
    await setTextSize(size);
    const state = await scrolly();
    const focus = await evaluate<boolean>(`document.activeElement === ${lastLink}`);
    expectEqual({ ...state, focus, visible: await onScreen(lastLink) }, { pinned, consistent: true, overflow: false, focus: true, visible: true }, `${size} px`);
  }
});

await scenario('capabilities: midway through the pinned section with focus elsewhere, live 16→20→32→16 px re-measures travel and pinning', async () => {
  await open('/', { width: 1440, height: 900 });
  await evaluate(`(() => { const s = document.querySelector('[data-scrolly]'); scrollTo({ top: s.getBoundingClientRect().top + scrollY - 64 + 1100, behavior: 'instant' }); })()`);
  // The header's home link stays visible at every text size (nav links fold into the menu).
  const elsewhere = `document.querySelector('[data-site-header] a[href="/"]')`;
  await evaluate(`${elsewhere}.focus({ preventScroll: true })`);
  for (const [size, pinned] of [[20, true], [32, false], [16, true]] as const) {
    await setTextSize(size);
    const state = await scrolly();
    expectEqual({ ...state, focus: await evaluate<boolean>(`document.activeElement === ${elsewhere}`) }, { pinned, consistent: true, overflow: false, focus: true }, `${size} px`);
    if (pinned) {
      // Within the pinned range the whole block is shown below the header.
      const y = await evaluate<number>('scrollY');
      await evaluate(`(() => { const s = document.querySelector('[data-scrolly]'); scrollTo({ top: s.getBoundingClientRect().top + scrollY - 64 + 600, behavior: 'instant' }); })()`);
      await evaluate(`new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))`);
      expectEqual(await onScreen(`document.querySelector('[data-scrolly-content]')`), true, `${size} px: pinned block fully shown`);
      expectEqual(await lastPanelAtEnd(), true, `${size} px: last panel fully shown at the end of the pinned range`);
      await evaluate(`scrollTo({ top: ${y}, behavior: 'instant' })`);
    }
  }
});

// A page-wide text-size change reflows everything above; Chromium's scroll anchoring does not keep
// a focused element far down the page in view even when the showcase never pins (reduced
// motion), so on-screen position across a text change is not asserted here. What the showcase
// controls is asserted: it never scrolls the page while focus is elsewhere, and its own
// pinned ↔ stacked switch leaves content below it where it was.
await scenario('layout switches keep content below in place: workflow and pricing links, pinned ↔ stacked and collage ↔ grid, three runs each', async () => {
  // Intermittent before the fix (Chromium's scroll anchoring sometimes moved these by 400–600 px).
  for (const target of ['.workflow-foot a', '.price-list a']) {
    for (let run = 1; run <= 3; run++) {
      await open('/', { width: 1440, height: 900 });
      const link = `document.querySelector('${target}')`;
      await evaluate(`${link}.scrollIntoView({ block: 'center', behavior: 'instant' }); ${link}.focus({ preventScroll: true })`);
      const top = () => evaluate<number>(`Math.round(${link}.getBoundingClientRect().top)`);
      const before = await top();
      for (const reduced of [true, false]) {
        await setReducedMotion(reduced);
        await waitFor(async () => (await scrolly()).pinned === !reduced, reduced ? 'stacked' : 'pinned');
        await evaluate(`new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 100))))`);
        const now = await top();
        // ±1 px allows sub-pixel layout rounding.
        if (Math.abs(now - before) > 1) throw new Error(`${target} run ${run}, reduced motion ${reduced}: moved ${before} → ${now}`);
      }
      expectEqual(await evaluate<boolean>(`document.activeElement === ${link}`), true, `${target} run ${run}: focus kept`);
    }
  }
});

// A page-wide text-size change reflows everything above; Chromium's scroll anchoring does not keep
// a focused element far down the page in view even when the showcase never pins (reduced
// motion), so on-screen position across a text change is not asserted here. What the showcase
// controls is asserted: it never scrolls the page while focus is elsewhere below it.
await scenario('capabilities: focus below the section (a pricing link) is kept and the showcase never scrolls the page through live 32→16→20→16 px', async () => {
  await open('/', { width: 1440, height: 900 });
  const link = `document.querySelector('.price-list a')`;
  await evaluate(`${link}.scrollIntoView({ block: 'center', behavior: 'instant' }); ${link}.focus({ preventScroll: true })`);
  await evaluate(`window.__scrollCalls = []; for (const [o, m] of [[window, 'scrollTo'], [Element.prototype, 'scrollIntoView']]) {
    const f = o[m]; o[m] = function (...a) { window.__scrollCalls.push(m); return f.apply(this, a); }; }`);
  for (const size of [32, 16, 20, 16]) {
    await setTextSize(size);
    expectEqual(await evaluate<boolean>(`document.activeElement === ${link}`), true, `${size} px: focus kept`);
  }
  expectEqual(await evaluate(`window.__scrollCalls`), [], 'focus-driven scroll calls while focus was elsewhere');
});

await scenario('capabilities: no repeated re-evaluation or ResizeObserver loop errors once a text-size change has settled', async () => {
  await open('/', { width: 1440, height: 900 });
  await evaluate(`window.__roErrors = []; addEventListener('error', (e) => { if (/ResizeObserver/.test(e.message)) __roErrors.push(e.message); })`);
  for (const size of [20, 32, 16]) {
    await setTextSize(size);
    const mutations = await evaluate<number>(`new Promise((done) => { let n = 0;
      const mo = new MutationObserver((list) => { n += list.length; });
      mo.observe(document.querySelector('[data-scrolly]'), { attributes: true, subtree: true, attributeFilter: ['class', 'style'] });
      setTimeout(() => { mo.disconnect(); done(n); }, 700); })`);
    expectEqual(mutations, 0, `${size} px: attribute changes while idle`);
  }
  expectEqual(await evaluate(`__roErrors`), [], 'ResizeObserver errors');
});

await scenario('capabilities: reduced motion and no JavaScript stay stacked through live 16→20→32→16 px', async () => {
  for (const options of [{ reduced: true }, { js: false }]) {
    await open('/', { width: 1440, height: 900, ...options });
    for (const size of [20, 32, 16]) {
      await send('Page.setFontSizes', { fontSizes: { standard: size, fixed: 13 } });
      await sleep(300);
      expectEqual(await scrolly(), { pinned: false, consistent: true, overflow: false }, `${JSON.stringify(options)} ${size} px`);
    }
  }
});

// ---- 9. Report and clean up -------------------------------------------------------------
if (blocked.length) results.push({ name: 'request guard: no off-site requests', ok: false, detail: blocked.join(', ') });
ws.close();
chrome.kill();
server.closeAllConnections();
server.close();
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
