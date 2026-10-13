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
// wrap in both directions; the Home workflow steps; and the "Who we serve" full-frame audience sequence and static title fallbacks.
//
// Requires CHROME_PATH (docs/ARCHITECTURE.md §8) pointing at a Chromium build that can play
// H.264 MP4 (the video scenarios fail with an explanation otherwise).
// Uses only Node built-ins and Astro.

import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
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
let holdAudience = false;
const heldAudience: (() => void)[] = [];
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
    if (path.startsWith('/media/home/audience-')) {
      if (holdAudience) { heldAudience.push(() => send(res)); return; }
    }
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
  holdAudience = false;
  for (const release of heldAudience.splice(0)) release();
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
const audienceNetwork: { loaderId: string; url: string }[] = [];
let pageLoader = '';
const audienceTransfers = () => audienceNetwork.filter(request => request.loaderId === pageLoader).length;
listeners.push((message) => {
  if (message.method === 'Network.requestWillBeSent' && message.params.request.url.includes('/media/home/audience-'))
    audienceNetwork.push({ loaderId: message.params.loaderId, url: message.params.request.url });
  if (message.method === 'Runtime.exceptionThrown')
    pageErrors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
  if (message.method !== 'Fetch.requestPaused') return;
  const { requestId, request } = message.params;
  // A paused same-origin request can be cancelled by the page (navigation, removed video src)
  // before it is continued; that is not a failure.
  if (request.url.startsWith(`${origin}/`)) send('Fetch.continueRequest', { requestId }).catch(() => {});
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
  const navigation = await send('Page.navigate', { url: origin + path });
  pageLoader = navigation.loaderId;
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
    for (const el of document.querySelectorAll('h1, h2, h3, .cap-label, .step-label')) {
      if (!el.checkVisibility() || el.clientWidth <= 1 || el.closest('.visually-hidden')) continue;
      if (el.scrollWidth > el.clientWidth + 1) problems.push(el.tagName + ' "' + el.textContent.trim().slice(0, 30) + '" scrollWidth ' + el.scrollWidth + ' > ' + el.clientWidth);
      range.selectNodeContents(el);
      for (const r of range.getClientRects()) if (r.width && (r.left < -0.5 || r.right > width + 0.5)) {
        problems.push(el.tagName + ' "' + el.textContent.trim().slice(0, 30) + '" text spans ' + Math.round(r.left) + '–' + Math.round(r.right)); break; }
      // Clipped by an ancestor that hides overflow (e.g. a card or a scroller).
      const box = el.getBoundingClientRect();
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const s = getComputedStyle(a);
        if (!/hidden|clip/.test(s.overflowX) || a.matches('[data-cap-pin]')) continue;
        const ab = a.getBoundingClientRect();
        if (ab.width <= 1) break; // a visually hidden wrapper
        if (box.left < ab.left - 0.5 || box.right > ab.right + 0.5) { problems.push(el.tagName + ' "' + el.textContent.trim().slice(0, 30) + '" clipped by ' + a.className); break; }
      }
    }
    return problems;
  })()`);

const routes = ['/', '/solutions/', '/how-it-works/', '/product-demo/', '/pricing/', '/about/', '/contact/', '/payment-demo/'];
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

// ---- 7. Full-frame audience sequence (selection/description UI retired) -------------------
const audience = () => evaluate<any>(`(()=>{const s=document.querySelector('[data-audience-orbit]'),t=s.querySelector('[data-orbit-scroll]');return{enhanced:s.classList.contains('is-orbit'),titles:s.querySelectorAll('[data-audience-label]').length,removed:s.querySelectorAll('[data-audience-select],[data-orbit-detail],[data-audience-need],[data-orbit-centre]').length,motion:+t.dataset.motionTravel,fade:+t.dataset.titleTravel,hold:+t.dataset.holdTravel,start:t.getBoundingClientRect().top+scrollY-parseFloat(s.style.getPropertyValue('--orbit-top'))}})()`);
const stageDistance = async(distance:number) => {
  const state=await audience();await evaluate(`scrollTo({top:${state.start+distance},behavior:'instant'})`);
  await evaluate('new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))');
};
await scenario('audience sequence: continuous growth, upright full frames, settled titles, scroll hold and release',async()=>{
  for(const dimensions of[{width:1440,height:900},{width:1366,height:768}]){
    await open('/',dimensions);const a=await audience();expectEqual([a.enhanced,a.titles,a.removed],[true,7,0],'seven equal audience identities');
    for(let i=0;i<=20;i++){
      await stageDistance(a.motion*i/20);
      expectEqual(await evaluate(`(()=>{const arr=document.querySelector('[data-orbit-arrangement]'),parent=new DOMMatrix(getComputedStyle(arr).transform);return [...document.querySelectorAll('.orbit-photo')].every(photo=>{const m=parent.multiply(new DOMMatrix(getComputedStyle(photo).transform)),img=photo.querySelector('img'),r=img.getBoundingClientRect(),ratio=Number(img.getAttribute('width'))/Number(img.getAttribute('height'));return Math.abs(m.b)<.00001&&Math.abs(m.c)<.00001&&Math.abs(r.width/r.height-ratio)<.001})&&document.documentElement.scrollWidth<=innerWidth})()`),true,'upright full-frame image / overflow');
    }
    await stageDistance(a.motion+a.fade+a.hold/2);
    expectEqual(await evaluate(`(()=>{const s=getComputedStyle(document.querySelector('[data-orbit-arrangement]'));return[s.getPropertyValue('--orbit-angle'),s.getPropertyValue('--orbit-scale'),s.getPropertyValue('--orbit-titles')]})()`),['300.65deg','1','1'],'reference-matched title hold');
    expectEqual(await evaluate(`(()=>{const section=document.querySelector('[data-audience-orbit]'),art=section.querySelector('[data-orbit-art]').getBoundingClientRect(),captions=[...section.querySelectorAll('figcaption')],rects=captions.map(e=>e.getBoundingClientRect()),media=[...section.querySelectorAll('.orbit-frame')].map(e=>e.getBoundingClientRect()),clear=(a,b)=>a.right<=b.left||a.left>=b.right||a.bottom<=b.top||a.top>=b.bottom;return rects.every((r,i)=>r.left>=art.left&&r.right<=art.right&&r.top>=art.top&&r.bottom<=art.bottom&&media.every(m=>clear(r,m))&&rects.slice(i+1).every(other=>clear(r,other)))&&captions.every(e=>getComputedStyle(e).backgroundImage==='none')})()`),true,'external titles clear of all videos, each other and stage edges; no caption gradient');
    expectEqual(await evaluate(`(()=>{const p=[...document.querySelectorAll('.orbit-frame')].map(e=>e.getBoundingClientRect()),title=document.querySelector('[data-orbit-index="0"] figcaption').getBoundingClientRect(),close=(a,b)=>Math.abs(a-b)<0.1;return close(p[3].top,p[4].top)&&close(p[3].height,p[4].height)&&close(p[2].top,p[5].top)&&close(p[2].height,p[5].height)&&close(p[1].bottom,p[6].bottom)&&close(p[0].left+p[0].right,p[2].right+p[5].left)&&close(title.left+title.right,p[0].left+p[0].right)&&title.top>p[0].bottom&&title.bottom<Math.min(p[1].top,p[6].top)})()`),true,'paired edges/heights and centred below-video title with bottom clearance');
    await stageDistance(a.motion+a.fade+a.hold+150);
    expectEqual(await evaluate(`document.querySelector('[data-orbit-shell]').getBoundingClientRect().top<document.querySelector('[data-site-header]').getBoundingClientRect().bottom-100`),true,'natural release');
    await stageDistance(0);expectEqual(await evaluate(`+getComputedStyle(document.querySelector('[data-orbit-arrangement]')).getPropertyValue('--orbit-titles')<.00001`),true,'reverse restores compact title-free scene');
  }
});
await scenario('audience sequence: all seven titles/full-frame photos in static fallbacks',async()=>{
  for(const options of[{width:320,height:844},{width:390,height:844},{width:320,height:844,fontSize:32},{width:390,height:844,fontSize:32},{width:1440,height:900,reduced:true},{width:1440,height:900,js:false},{width:1440,height:500}]){
    await open('/',options);const s=await audience();expectEqual([s.enhanced,s.titles,s.removed],[false,7,0],'static audience identities');
    expectEqual(await evaluate(`document.documentElement.scrollWidth<=innerWidth&&[...document.querySelectorAll('[data-audience-label]')].every(e=>e.checkVisibility({opacityProperty:true}))`),true,'visible titles / no overflow');
  }
});
await scenario('audience sequence: live preference and text changes retain focus and reveal the matching title',async()=>{
  await open('/',{width:1440,height:900});await evaluate(`document.querySelectorAll('[data-audience-label]')[5].focus()`);
  const chosen=await evaluate<string>('document.activeElement.textContent');
  for(const reduced of[true,false]){await setReducedMotion(reduced);await waitFor(async()=>(await audience()).enhanced===!reduced,'layout');expectEqual(await evaluate('document.activeElement.textContent'),chosen,'same DOM focus');}
  await send('Page.setFontSizes',{fontSizes:{standard:32,fixed:13}});await waitFor(async()=>!(await audience()).enhanced,'enlarged text fallback');expectEqual(await evaluate('document.activeElement.textContent'),chosen,'text-change focus');
  expectEqual(await evaluate(`document.activeElement.getBoundingClientRect().top>=document.querySelector('[data-site-header]').getBoundingClientRect().bottom`),true,'focused title below actual header');
});
await scenario('audience sequence: image error retains title and reserved frame',async()=>{
  await open('/',{width:390,height:844});const before=await evaluate<number>(`document.querySelector('.orbit-frame').getBoundingClientRect().height`);
  await evaluate(`document.querySelector('.orbit-frame img').dispatchEvent(new Event('error'))`);
  expectEqual(await evaluate(`document.querySelector('.orbit-frame img').hidden&&!document.querySelector('.orbit-photo-error').hidden&&document.querySelectorAll('[data-audience-label]').length===7`),true,'title/error retained');
  expectEqual(await evaluate<number>(`document.querySelector('.orbit-frame').getBoundingClientRect().height`),before,'reserved size retained');
});
if(process.env.EVIDENCE_DIR)await scenario('audience sequence: capture final title scene and mobile grid',async()=>{
  const dir=resolve(process.env.EVIDENCE_DIR!);mkdirSync(dir,{recursive:true});
  const capture=async(name:string)=>{const shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join(dir,name),Buffer.from(shot.data,'base64'));};
  await open('/',{width:1440,height:900});const a=await audience();await stageDistance(a.motion+a.fade+a.hold/2);await capture('desktop.png');
  await open('/',{width:390,height:844,reduced:true});await evaluate(`document.querySelector('[data-audience-orbit]').scrollIntoView({behavior:'instant'})`);await capture('mobile.png');
});

// Audience playback: test decoded pixels as well as lifecycle/control state.
const audienceMedia = () => evaluate<any>(`(()=>{const vs=[...document.querySelectorAll('.orbit-frame video')],b=document.querySelector('[data-audience-video-toggle]');return{count:vs.length,paused:vs.every(v=>v.paused),label:b.textContent,disabled:b.getAttribute('aria-disabled'),shown:document.querySelectorAll('.orbit-frame.is-video-playing').length}})()`);
const awaitAudiencePlayback = () => waitFor(async () => {
  const s=await audienceMedia();return s.count===7&&!s.paused&&s.shown===7;
},'seven audience decoders',10000);
await scenario('audience videos: load only near stage; all seven deliver changing decoded pixels with natural dimensions',async()=>{
  await open('/',{width:1440,height:900});await sleep(200);
  expectEqual(audienceTransfers(),0,'no audience transfer at page top');
  await stageDistance(0);await awaitAudiencePlayback();
  const decoded=await evaluate<any>(`Promise.all([...document.querySelectorAll('.orbit-frame video')].map(v=>new Promise(done=>{let first=null;const c=document.createElement('canvas');c.width=48;c.height=27;const ctx=c.getContext('2d');function frame(now,m){ctx.drawImage(v,0,0,48,27);const bytes=ctx.getImageData(0,0,48,27).data;let hash=0;for(const byte of bytes)hash=(Math.imul(hash,31)+byte)|0;if(!first){first={hash,time:now,frames:m.presentedFrames};v.requestVideoFrameCallback(frame);}else if(now-first.time<800)v.requestVideoFrameCallback(frame);else done({changed:hash!==first.hash,frames:m.presentedFrames-first.frames,ratio:m.width/m.height,muted:v.muted,loop:v.loop,inline:v.playsInline});}v.requestVideoFrameCallback(frame)})))`);
  expectEqual(decoded.length,7,'seven decoded streams');
  if(!decoded.every((d:any,i:number)=>d.changed&&d.frames>5&&d.muted&&d.loop&&d.inline&&Math.abs(d.ratio-(i===1?9/16:16/9))<.001))throw Error('Decoded pixels / natural proportions mismatch: '+JSON.stringify(decoded));
  await evaluate('scrollTo(0,0)');await waitFor(async()=>(await audienceMedia()).paused,'off-screen pause');
  await stageDistance(0);await awaitAudiencePlayback();
});
await scenario('audience videos: native Space/Enter, rapid toggles and explicit Pause persist across scroll, preference and text reflow',async()=>{
  await open('/',{width:1440,height:900});await stageDistance(0);await awaitAudiencePlayback();
  await evaluate(`document.querySelector('[data-audience-video-toggle]').focus({preventScroll:true})`);await press(' ');
  expectEqual((await audienceMedia()).paused,true,'keyboard Pause');
  expectEqual(await evaluate(`document.activeElement===document.querySelector('[data-audience-video-toggle]')`),true,'control focus retained');
  await evaluate(`scrollTo(0,0)`);await stageDistance(500);await sleep(100);expectEqual((await audienceMedia()).paused,true,'Pause after scroll');
  await setReducedMotion(true);await waitFor(async()=>(await audienceMedia()).count===0,'reduced unload');
  await setReducedMotion(false);await waitFor(async()=>(await audience()).enhanced,'restored layout');await stageDistance(0);
  expectEqual([(await audienceMedia()).count,(await audienceMedia()).label],[0,'Play videos'],'Pause after preference restore');
  await send('Page.setFontSizes',{fontSizes:{standard:32,fixed:13}});await waitFor(async()=>!(await audience()).enhanced,'text fallback');
  expectEqual(await evaluate(`document.activeElement===document.querySelector('[data-audience-video-toggle]')&&document.activeElement.getBoundingClientRect().top>=document.querySelector('[data-site-header]').getBoundingClientRect().bottom`),true,'visible control focus in fallback');
  await send('Page.setFontSizes',{fontSizes:{standard:16,fixed:13}});await waitFor(async()=>(await audience()).enhanced,'text restore');await stageDistance(0);
  await press('Enter');await awaitAudiencePlayback();
  await evaluate(`const b=document.querySelector('[data-audience-video-toggle]');for(let i=0;i<9;i++)b.click()`);await sleep(150);
  expectEqual([(await audienceMedia()).paused,(await audienceMedia()).label],[true,'Play videos'],'latest rapid toggle wins');
});
await scenario('audience videos: pending fetch/autoplay cancelled synchronously by reduced motion and never revived by stale completion',async()=>{
  holdAudience=true;await open('/',{width:1440,height:900});await stageDistance(0);
  // HTTP/1.1 may cap concurrent held responses at six. One pending response is
  // enough to exercise cancellation; all seven video elements must be pending.
  await waitFor(()=>heldAudience.length>=1,'held audience requests');
  expectEqual((await audienceMedia()).count,7,'seven pending elements');
  await evaluate(`const m=matchMedia('(prefers-reduced-motion: reduce)');m.addEventListener('change',()=>window.__audienceImmediatelyDetached=!document.querySelector('.orbit-frame video'),{once:true})`);
  await setReducedMotion(true);await waitFor(()=>evaluate<boolean>('window.__audienceImmediatelyDetached===true'),'synchronous cancellation');
  releaseVideo();await sleep(200);expectEqual((await audienceMedia()).count,0,'no stale playing after release');
  await setReducedMotion(false);await waitFor(async()=>(await audience()).enhanced,'preference restore');await stageDistance(0);await awaitAudiencePlayback();
});
await scenario('audience videos: initial poster fallbacks never request video on mobile, enlarged text, reduced motion, short viewport or no JS',async()=>{
  for(const options of[{width:320,height:844},{width:390,height:844},{width:320,height:844,fontSize:32},{width:390,height:844,fontSize:32},{width:1440,height:900,fontSize:32},{width:1440,height:900,reduced:true},{width:1440,height:500},{width:1440,height:900,js:false}]){
    await open('/',options);await evaluate(`document.querySelector('.segments').scrollIntoView()`);await sleep(150);
    expectEqual([audienceTransfers(),(await audienceMedia()).count],[0,0],'no video downloads '+JSON.stringify(options));
  }
});
await scenario('audience videos: explicit Pause during pending loads survives completion and Play starts the newer request',async()=>{
  holdAudience=true;await open('/',{width:1440,height:900});await stageDistance(0);
  await waitFor(()=>heldAudience.length>=1,'pending response');
  await evaluate(`document.querySelector('[data-audience-video-toggle]').focus({preventScroll:true})`);await press(' ');
  releaseVideo();await sleep(250);expectEqual([(await audienceMedia()).paused,(await audienceMedia()).label,(await audienceMedia()).shown],[true,'Play videos',0],'pending Pause retained');
  await press('Enter');await awaitAudiencePlayback();
});
await scenario('audience videos: Save-Data prevents requests; live Save-Data cancels and explicit Pause survives return',async()=>{
  const injection=await send('Page.addScriptToEvaluateOnNewDocument',{source:`Object.defineProperty(navigator,'connection',{value:Object.assign(new EventTarget(),{saveData:true})})`});
  try{
    await open('/',{width:1440,height:900});await evaluate(`document.querySelector('.segments').scrollIntoView()`);await sleep(100);expectEqual([audienceTransfers(),(await audienceMedia()).count],[0,0],'Save-Data poster only');
    await evaluate(`navigator.connection.saveData=false;navigator.connection.dispatchEvent(new Event('change'))`);await waitFor(async()=>(await audience()).enhanced,'Save-Data restore');await stageDistance(0);await awaitAudiencePlayback();
    await evaluate(`document.querySelector('[data-audience-video-toggle]').click();navigator.connection.saveData=true;navigator.connection.dispatchEvent(new Event('change'));window.__detached=!document.querySelector('.orbit-frame video')`);expectEqual(await evaluate('window.__detached'),true,'live immediate unload');
    await evaluate(`navigator.connection.saveData=false;navigator.connection.dispatchEvent(new Event('change'))`);await waitFor(async()=>(await audience()).enhanced,'layout restore');await stageDistance(0);expectEqual((await audienceMedia()).count,0,'explicit Pause persists');
  }finally{await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:injection.identifier});}
});
await scenario('audience videos: refused autoplay keeps posters; native Play retries; one failed stream preserves poster/title and other playback',async()=>{
  const injection=await send('Page.addScriptToEvaluateOnNewDocument',{source:`const originalPlay=HTMLMediaElement.prototype.play;window.__allowAudience=false;HTMLMediaElement.prototype.play=function(){if(this.src.includes('/media/home/audience-')&&!window.__allowAudience)return Promise.reject(new DOMException('Test refusal','NotAllowedError'));return originalPlay.call(this)}`});
  try{
    await open('/',{width:1440,height:900});await stageDistance(0);await waitFor(async()=>(await audienceMedia()).label==='Play videos','refusal');
    expectEqual((await audienceMedia()).shown,0,'posters on refusal');
    await evaluate(`window.__allowAudience=true;document.querySelector('[data-audience-video-toggle]').focus({preventScroll:true})`);await press('Enter');await awaitAudiencePlayback();
    const before=await evaluate(`document.querySelector('.orbit-frame').getBoundingClientRect().height`);
    await evaluate(`document.querySelector('.orbit-frame video').src='/media/home/intentionally-missing-test.mp4'`);
    await waitFor(async()=>(await audienceMedia()).count===6,'failed clip removed');
    expectEqual(await evaluate(`!document.querySelector('.orbit-frame').classList.contains('is-video-playing')&&!document.querySelector('.orbit-frame img').hidden&&document.querySelectorAll('[data-audience-label]').length===7&&[...document.querySelectorAll('.orbit-frame video')].every(v=>!v.paused)`),true,'poster/title/other clips retained');
    expectEqual(await evaluate(`document.querySelector('.orbit-frame').getBoundingClientRect().height`),before,'error reserves geometry');
  }finally{await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:injection.identifier});}
});
await scenario('audience videos: hidden document immediately pauses and visible document resumes without overriding user Pause',async()=>{
  await open('/',{width:1440,height:900});await stageDistance(0);await awaitAudiencePlayback();
  // Deterministic visibility event: headless focus emulation keeps real tabs visible.
  await evaluate(`Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));window.__allPaused=[...document.querySelectorAll('.orbit-frame video')].every(v=>v.paused)`);
  expectEqual(await evaluate('window.__allPaused'),true,'hidden synchronous pause');
  await evaluate(`Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'))`);await awaitAudiencePlayback();
  await evaluate(`document.querySelector('[data-audience-video-toggle]').click();Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'))`);
  expectEqual((await audienceMedia()).paused,true,'explicit Pause after tab return');
});

// ---- 8. Capabilities: "drawn, then built" stage under scroll, keyboard and live changes ------------
// The browser default text size changes without a resize or reload (Page.setFontSizes).
const setTextSize = async (size: number) => {
  await send('Page.setFontSizes', { fontSizes: { standard: size, fixed: 13 } });
  await waitFor(() => evaluate<boolean>(`getComputedStyle(document.documentElement).fontSize === '${size}px'`), `${size} px text`);
  // Settled once two frames apart give the same layout (bounded by waitFor).
  let last = '';
  await waitFor(async () => {
    const now = await evaluate<string>(`new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => {
      const s = document.querySelector('[data-cap]'); done([s.className, s.querySelector('[data-cap-track]').style.height, scrollY, [...s.querySelectorAll('[data-cap-figure]')].map(f => f.getAttribute('style')).join()].join('|')); })))`);
    const stable = now === last;
    last = now;
    return stable;
  }, 'layout settled');
};
/** Pinned or static, and whether that layout is internally consistent. */
const capStage = () =>
  evaluate<{ pinned: boolean; consistent: boolean; overflow: boolean }>(`(() => {
    const s = document.querySelector('[data-cap]'), track = s.querySelector('[data-cap-track]'), pin = s.querySelector('[data-cap-pin]'), stage = s.querySelector('[data-cap-stage]');
    const items = [...s.querySelectorAll('[data-cap-item]')], figures = [...s.querySelectorAll('[data-cap-figure]')];
    const details = [...s.querySelectorAll('[data-cap-detail]')];
    const pinned = s.classList.contains('is-drawn');
    // Each description directly under its own heading in both layouts.
    const underHeading = details.every((d, i) => items[i].contains(d) && d.previousElementSibling === items[i].querySelector('h3'));
    const consistent = underHeading && (pinned
      ? parseFloat(track.style.height) > pin.clientHeight && !stage.hidden && figures.every(f => stage.contains(f))
        && s.querySelector('.cap-text').getBoundingClientRect().height <= pin.clientHeight && items.filter(i => i.classList.contains('is-active')).length === 1
      : track.style.height === '' && stage.hidden && figures.every((f, i) => items[i].contains(f) && f.checkVisibility()) && details.every(d => d.checkVisibility() && d.getBoundingClientRect().height > 1) && items.every(i => !i.classList.contains('is-active')));
    return { pinned, consistent, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
  })()`);
/** Rendered on screen: below the header, inside the viewport and not clipped by any clipping ancestor (e.g. a closed description). */
const onScreen = (expression: string) =>
  evaluate<boolean>(`(() => {
    const el = ${expression}; if (!el || !el.checkVisibility()) return false;
    const r = el.getBoundingClientRect(); const header = document.querySelector('[data-site-header]').getBoundingClientRect().bottom;
    if (r.height < 1 || r.top < header - 0.5 || r.bottom > innerHeight + 0.5 || r.left < -0.5 || r.right > innerWidth + 0.5) return false;
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a); if (!/(hidden|clip)/.test(cs.overflowX + cs.overflowY)) continue;
      const c = a.getBoundingClientRect(); if (r.top < c.top - 0.5 || r.bottom > c.bottom + 0.5 || r.left < c.left - 0.5 || r.right > c.right + 0.5) return false;
    }
    return true;
  })()`);
const capLink = (i: number) => `document.querySelectorAll('[data-cap-detail] a')[${i}]`;
const lastLink = capLink(3);
/** Scroll to a progress value (capability index + fraction) within the pinned range, then read the stage. */
const capAt = async (progress: number) => {
  await evaluate(`(() => { const track = document.querySelector('[data-cap-track]'), pin = track.querySelector('[data-cap-pin]');
    const header = document.querySelector('[data-site-header]').getBoundingClientRect().height;
    const segment = (parseFloat(track.style.height) - pin.clientHeight) / 4;
    scrollTo({ top: track.getBoundingClientRect().top + scrollY - header + ${progress} * segment, behavior: 'instant' }); })()`);
  await evaluate(`new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))`);
  return evaluate<{ active: number[]; d: number[]; strokes: number[]; r: number[]; outline: number[]; done: number; shown: number[]; note: number; openDetails: number[]; stage: string; column: number }>(`(() => {
    const s = document.querySelector('[data-cap]'), items = [...s.querySelectorAll('[data-cap-item]')];
    const figures = [...s.querySelectorAll('[data-cap-figure]')];
    const v = (el, k) => parseFloat(getComputedStyle(el).getPropertyValue(k)) || 0;
    const cur = figures.find(f => getComputedStyle(f).visibility === 'visible' && v(f, '--caption') === 1);
    const bands = cur ? [...cur.querySelectorAll('.cap-band')] : [];
    return { active: items.flatMap((it, i) => it.classList.contains('is-active') ? [i] : []),
      // Per band: how much of its outlines is drawn (rendered dash offsets), its reveal progress, and the rendered opacity of its outlines.
      // Chromium reports the computed offset as e.g. "calc(0.35px)".
      d: bands.map(g => { const p = [...g.querySelectorAll('.cap-strokes path')]; return +(p.reduce((a, e) => a + 1 - parseFloat(getComputedStyle(e).strokeDashoffset.replace('calc(', '')), 0) / p.length).toFixed(3); }),
      strokes: bands.flatMap(g => [...g.querySelectorAll('.cap-strokes path')].map(e => +(1 - parseFloat(getComputedStyle(e).strokeDashoffset.replace('calc(', ''))).toFixed(3))),
      r: bands.map(g => v(g, '--r')), outline: bands.map(g => +parseFloat(getComputedStyle(g.querySelector('.cap-strokes')).opacity).toFixed(3)),
      done: cur ? v(cur, '--done') : -1,
      shown: figures.flatMap((f, i) => getComputedStyle(f).visibility === 'visible' ? [i] : []),
      note: v(s.querySelector('[data-cap-stage-frame]'), '--note'),
      openDetails: [...s.querySelectorAll('[data-cap-detail]')].flatMap((d, i) => parseFloat(getComputedStyle(d).opacity) > 0.9 && d.checkVisibility() && d.getBoundingClientRect().height > 1 ? [i] : []),
      stage: [s.querySelector('[data-cap-stage] .sim-label'), s.querySelector('[data-cap-stage-frame]')].map(e => { const r = e.getBoundingClientRect(); return [r.top, r.left, r.width, r.height].map(Math.round).join(','); }).join(' '),
      column: Math.round(s.querySelector('.cap-text').getBoundingClientRect().height) };
  })()`);
};

await scenario('capabilities: each screen is drawn band by band and revealed region by region with overlapping phases, then holds exactly; one open description under its own heading; reverse scrolling restores earlier states', async () => {
  await open('/', { width: 1440, height: 900 });
  expectEqual((await capStage()).pinned, true, 'pinned at 1440x900');
  // Before scrolling into the section the stage already shows the faint drawing (it fades as each band is revealed).
  expectEqual(await evaluate(`(() => { const g = document.querySelector('[data-cap-figure] .cap-ghost'); return getComputedStyle(g.closest('[data-cap-figure]')).visibility === 'visible' && parseFloat(getComputedStyle(g).opacity) > 0.1 && g.closest('svg').getBoundingClientRect().width > 300; })()`), true, 'faint schematic shown from the start');
  await waitFor(async () => (await capAt(0.75)).openDetails.length === 1, 'first description open');
  expectEqual(await evaluate(`document.querySelectorAll('.cap-build-line').length`), 0, 'no yellow wipe edge');
  const stages: string[] = [];
  const columns: number[] = [];
  for (let i = 0; i < 4; i++) {
    const n = (await capAt(i + 0.75)).d.length;
    if (n < 4 || n > 5) throw new Error(`capability ${i + 1}: expected 4-5 bands, got ${n}`);
    // Early: the first outlines are drawing one after another, nothing is revealed yet.
    const early = await capAt(i + 0.07);
    const inProgress = early.strokes.filter((x) => x > 0 && x < 1).length;
    if (!(early.d[0]! > 0 && early.d[0]! < 1 && inProgress >= 2 && inProgress <= 6 && early.strokes.some((x) => x === 0) && early.r.every((r) => r === 0) && early.done === 0 && early.note === 1))
      throw new Error(`capability ${i + 1} early drawing: ${JSON.stringify(early)}`);
    // Progressive: outlines complete in reading order over roughly the first 40% of the segment.
    let drawn = 0;
    for (const t of [0.12, 0.2, 0.28, 0.36]) {
      const now = (await capAt(i + t)).strokes.filter((x) => x === 1).length;
      if (!(now > drawn)) throw new Error(`capability ${i + 1}: outlines should keep completing at ${t} (${drawn} -> ${now})`);
      drawn = now;
    }
    // Overlap: one band is being revealed while a later band is still drawing; revealed bands' outlines fade.
    const mid = await capAt(i + 0.3);
    const revealing = mid.r.findIndex((r) => r > 0 && r < 1);
    const drawing = mid.d.findIndex((d) => d > 0 && d < 1);
    if (!(revealing >= 0 && drawing > revealing && mid.done === 0)) throw new Error(`capability ${i + 1} overlapping phases: ${JSON.stringify(mid)}`);
    if (!(mid.outline[revealing]! < 1 && mid.outline[revealing]! > 0)) throw new Error(`capability ${i + 1}: revealing band's outline should be fading: ${JSON.stringify(mid)}`);
    // Gradual: reveal progress never jumps by more than 0.15 between samples 2% of the segment apart.
    let last = (await capAt(i + 0.06)).r;
    for (let t = 0.08; t <= 0.76; t += 0.02) {
      const now = (await capAt(i + t)).r;
      const jump = Math.max(...now.map((r, k) => Math.abs(r - last[k]!)));
      if (jump > 0.15) throw new Error(`capability ${i + 1}: reveal jumped by ${jump.toFixed(2)} at ${t.toFixed(2)}`);
      last = now;
    }
    // Not finished before 70% of the segment; finished, exact and held from 75%.
    expectEqual((await capAt(i + 0.7)).done, 0, `capability ${i + 1}: still revealing at 0.70`);
    for (const t of [0.77, 0.87, 0.97]) {
      const hold = await capAt(i + t);
      expectEqual({ active: hold.active, d: hold.d.every((d) => d === 1), r: hold.r.every((r) => r === 1), outline: hold.outline.every((o) => o === 0), done: hold.done, note: hold.note, shown: hold.shown },
        { active: [i], d: true, r: true, outline: true, done: 1, note: 0, shown: [i] }, `capability ${i + 1} hold at ${t}: the exact screenshot`);
    }
    await waitFor(async () => (await capAt(i + 0.75)).openDetails.join() === String(i), `capability ${i + 1}: only its description open`);
    await sleep(300); // the description's 200 ms opacity transition
    const hold = await capAt(i + 0.75);
    stages.push(hold.stage);
    columns.push(hold.column);
    expectEqual(await onScreen(capLink(i)), true, `capability ${i + 1}: its demo link fully visible`);
    // The open description sits between its own heading and the next capability.
    expectEqual(await evaluate(`(() => { const items = [...document.querySelectorAll('[data-cap-item]')]; const d = items[${i}].querySelector('[data-cap-detail]').getBoundingClientRect();
      const h = items[${i}].querySelector('h3').getBoundingClientRect(); const next = items[${i} + 1]?.getBoundingClientRect();
      return d.top >= h.bottom - 0.5 && (!next || d.bottom <= next.top + 0.5); })()`), true, `capability ${i + 1}: description directly under its heading`);
  }
  expectEqual(new Set(stages).size, 1, 'the stage (label and frame) does not move between capabilities');
  expectEqual(new Set(columns).size, 1, 'the text column keeps one height');
  // Reverse: back through 3 -> 1 restores the earlier phases.
  for (const [p, i, held] of [[2.85, 2, true], [1.4, 1, false], [0.3, 0, false]] as const) {
    const state = await capAt(p);
    expectEqual({ active: state.active, done: state.done }, { active: [i], done: held ? 1 : 0 }, `reverse to ${p}`);
    if (!held && !state.r.some((r) => r < 1)) throw new Error(`reverse to ${p}: expected unrevealed bands, got ${JSON.stringify(state.r)}`);
  }
  const hrefs = await evaluate<string[]>(`[...document.querySelectorAll('[data-cap-detail] a')].map(a => a.getAttribute('href'))`);
  expectEqual(hrefs, ['/product-demo/#demo-panel-inventory', '/product-demo/#demo-panel-equipment', '/product-demo/#demo-panel-deliveries', '/product-demo/#demo-panel-overview'], 'demo link targets');
  expectEqual(await evaluate(`[...document.querySelectorAll('[data-cap-figure] figcaption')].every(c => /Fictional sample data/.test(c.textContent)) && /Simulated platform demo/i.test(document.querySelector('[data-cap-stage] .sim-label').textContent) && /Illustrative/.test(document.querySelector('.cap-drawing-note').textContent)`), true, 'simulation and drawing disclosures');
});

await scenario('capabilities: Tab reaches all four demo links without scrolling through animation; each lands on its finished screenshot', async () => {
  await open('/', { width: 1440, height: 900 });
  await evaluate(`(() => { const h = document.getElementById('capabilities-heading'); h.setAttribute('tabindex', '-1'); h.focus(); return true; })()`);
  for (let i = 0; i < 4; i++) {
    await press('Tab');
    await evaluate(`new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))`);
    expectEqual(await evaluate(`document.activeElement === ${capLink(i)}`), true, `Tab ${i + 1} reaches capability link ${i + 1}`);
    const state = await evaluate<{ active: number[]; done: number }>(`(() => { const items = [...document.querySelectorAll('[data-cap-item]')]; const f = document.querySelectorAll('[data-cap-figure]')[${i}];
      return { active: items.flatMap((it, j) => it.classList.contains('is-active') ? [j] : []), done: parseFloat(getComputedStyle(f).getPropertyValue('--done')) }; })()`);
    expectEqual(state, { active: [i], done: 1 }, `capability ${i + 1}: active and finished on focus`);
    expectEqual(await evaluate(`parseFloat(getComputedStyle(document.activeElement.closest('[data-cap-detail]')).opacity)`), 1, `capability ${i + 1}: its description fully shown at once`);
    expectEqual(await onScreen(`document.activeElement`), true, `capability ${i + 1}: focused link fully visible`);
    expectEqual(await evaluate(`getComputedStyle(document.activeElement).outlineStyle !== 'none'`), true, `capability ${i + 1}: focus outline`);
  }
  await press('Tab');
  expectEqual(await evaluate(`document.activeElement.textContent.includes('Explore all solutions')`), true, 'Tab continues to the solutions link');
  await press('Tab', true);
  expectEqual(await evaluate(`document.activeElement === ${lastLink}`), true, 'Shift+Tab returns to the last capability link');
});

/** Indices of the capability descriptions that are rendered and visibly shown (any opacity). */
const shownDetails = () =>
  evaluate<number[]>(`[...document.querySelectorAll('[data-cap-detail]')].flatMap((d, i) => d.checkVisibility() && parseFloat(getComputedStyle(d).opacity) > 0.01 ? [i] : [])`);
const settled = () => evaluate(`new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 300))))`);
/** Presses (and later releases) the mouse on capability link `i`, with Ctrl when `ctrl`; the click itself is cancelled so nothing navigates or opens. */
async function pointerOnCapLink(i: number, ctrl: boolean) {
  const point = await evaluate<{ x: number; y: number }>(`(() => { const r = ${capLink(i)}.getBoundingClientRect(); return { x: r.left + 24, y: r.top + r.height / 2 }; })()`);
  await evaluate(`document.addEventListener('click', (e) => e.preventDefault(), { capture: true, once: true })`);
  const event = { x: point.x, y: point.y, button: 'left', clickCount: 1, modifiers: ctrl ? 2 : 0 };
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...event });
  return () => send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...event });
}

await scenario('capabilities: exactly one description is shown after keyboard focus, scrolling, click and Ctrl+click; pointer focus never moves the page', async () => {
  await open('/', { width: 1440, height: 900 });
  // Keyboard focus on the first link, then scrolling on to the third capability.
  await evaluate(`(() => { const h = document.getElementById('capabilities-heading'); h.setAttribute('tabindex', '-1'); h.focus(); return true; })()`);
  await press('Tab');
  await settled();
  expectEqual([await evaluate(`document.activeElement === ${capLink(0)}`), await shownDetails()], [true, [0]], 'Tab to link 1');
  await capAt(2.75);
  await settled();
  expectEqual(await shownDetails(), [2], 'link 1 still focused, scrolled to capability 3');
  for (const ctrl of [false, true]) {
    // Pointer on the second link while its drawing is still in progress: no jump before (or after) navigation.
    await capAt(1.2);
    await settled();
    const y = await evaluate<number>('scrollY');
    const release = await pointerOnCapLink(1, ctrl);
    await settled();
    expectEqual({ focus: await evaluate(`document.activeElement === ${capLink(1)}`), y: await evaluate('scrollY'), shown: await shownDetails() }, { focus: true, y, shown: [1] }, `${ctrl ? 'Ctrl+' : ''}mouse down on link 2`);
    await release();
    await settled();
    expectEqual({ y: await evaluate('scrollY'), shown: await shownDetails(), url: await evaluate('location.pathname') }, { y, shown: [1], url: '/' }, `${ctrl ? 'Ctrl+' : ''}click on link 2`);
    await capAt(3.75);
    await settled();
    expectEqual(await shownDetails(), [3], `after the ${ctrl ? 'Ctrl+' : ''}click, scrolled to capability 4`);
  }
  // Scrolling moved focus from link 2 to the shown link 4. Keyboard after pointer focus still jumps,
  // and Tab / Shift+Tab show their capability at once.
  expectEqual(await evaluate(`document.activeElement === ${capLink(3)}`), true, 'focus followed the shown capability to link 4');
  for (const [shift, i] of [[true, 2], [true, 1], [true, 0], [false, 1]] as const) {
    await press('Tab', shift);
    await evaluate(`new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))`);
    expectEqual({ focus: await evaluate(`document.activeElement === ${capLink(i)}`), shown: await shownDetails(), opacity: await evaluate(`parseFloat(getComputedStyle(${capLink(i)}.closest('[data-cap-detail]')).opacity)`), visible: await onScreen(capLink(i)) },
      { focus: true, shown: [i], opacity: 1, visible: true }, `${shift ? 'Shift+' : ''}Tab to link ${i + 1}`);
  }
});

/** Real wheel input (50 px notches) until the page is within 60 px of `target`, then settles. */
async function wheelTo(target: number) {
  for (let i = 0; i < 400; i++) {
    const y = await evaluate<number>('scrollY');
    if (Math.abs(y - target) < 60) break;
    await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 900, y: 400, deltaX: 0, deltaY: y < target ? 50 : -50 });
    await sleep(25);
  }
  await settled();
}
/** Page offset of a progress value (capability index + fraction) in the pinned range. */
const capY = (progress: number) =>
  evaluate<number>(`(() => { const t = document.querySelector('[data-cap-track]'), pin = t.querySelector('[data-cap-pin]');
    const header = document.querySelector('[data-site-header]').getBoundingClientRect().height; const segment = (parseFloat(t.style.height) - pin.clientHeight) / 4;
    return Math.round(t.getBoundingClientRect().top + scrollY - header + ${progress} * segment); })()`);
const focusedCapLink = () => evaluate<number>(`[...document.querySelectorAll('[data-cap-detail] a')].indexOf(document.activeElement)`);
/** Records the href of the next activated link and cancels the navigation. */
const catchActivation = () =>
  evaluate(`window.__activated = null; document.addEventListener('click', (e) => { const a = e.target.closest('a'); window.__activated = a && a.getAttribute('href'); e.preventDefault(); }, { capture: true, once: true }); true`);
const tabIntoCapabilities = async () => {
  await evaluate(`(() => { const h = document.getElementById('capabilities-heading'); h.setAttribute('tabindex', '-1'); h.focus(); return true; })()`);
  await press('Tab');
  await settled();
};
const demoHref = ['/product-demo/#demo-panel-inventory', '/product-demo/#demo-panel-equipment', '/product-demo/#demo-panel-deliveries', '/product-demo/#demo-panel-overview'];

await scenario('capabilities: retained focus follows the shown capability while scrolling, so Enter opens what is shown and no hidden link keeps focus', async () => {
  await open('/', { width: 1440, height: 790 });
  await tabIntoCapabilities();
  expectEqual(await focusedCapLink(), 0, 'Tab to Open Materials');
  for (const [progress, i] of [[2.75, 2], [1.6, 1], [3.5, 3], [0.8, 0], [2.3, 2]] as const) {
    await wheelTo(await capY(progress));
    expectEqual({ focus: await focusedCapLink(), shown: await shownDetails(), visible: await onScreen(capLink(i)), ring: await evaluate(`document.activeElement.matches(':focus-visible')`) },
      { focus: i, shown: [i], visible: true, ring: true }, `wheel to ${progress}: focus on the shown capability's link`);
  }
  // Enter right after scrolling, before another Tab.
  await catchActivation();
  await press('Enter');
  await settled();
  expectEqual(await evaluate('window.__activated'), demoHref[2], 'Enter opens the shown capability (Deliveries)');
  // Fresh keyboard interaction continues from the shown link and shows its target at once.
  const y = await evaluate<number>('scrollY');
  await press('Tab');
  await evaluate(`new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))`);
  expectEqual({ focus: await focusedCapLink(), shown: await shownDetails(), visible: await onScreen(capLink(3)) }, { focus: 3, shown: [3], visible: true }, 'Tab after scrolling');
  await press('Tab', true);
  await press('Tab', true);
  await evaluate(`new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))`);
  expectEqual({ focus: await focusedCapLink(), shown: await shownDetails(), visible: await onScreen(capLink(1)) }, { focus: 1, shown: [1], visible: true }, 'Shift+Tab twice');
  if ((await evaluate<number>('scrollY')) === y) throw new Error('keyboard focus did not jump to its capability');
  // Pointer focus is reconciled the same way and still never moves the page.
  await wheelTo(await capY(0.2));
  const release = await pointerOnCapLink(0, true);
  await release();
  await settled();
  await wheelTo(await capY(3.75));
  await catchActivation();
  await press('Enter');
  await settled();
  expectEqual({ focus: await focusedCapLink(), shown: await shownDetails(), activated: await evaluate('window.__activated') }, { focus: 3, shown: [3], activated: demoHref[3] }, 'after Ctrl+click on Materials and scrolling to Reporting');
});

// Each live change that can switch the layout, with the visitor (a) reading Deliveries inside the
// section with focus retained on its link, (b) at Pricing with focus left behind in the section, and
// (c) reading Deliveries in the static list after Tabbing to Materials and scrolling on.
const transitions: [string, () => Promise<unknown>, () => Promise<unknown>][] = [
  ['reduced motion', () => setReducedMotion(true), () => setReducedMotion(false)],
  ['viewport width 1440 → 1000 px', () => send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 790, deviceScaleFactor: 1, mobile: false }), () => send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 790, deviceScaleFactor: 1, mobile: false })],
  ['viewport height 790 → 560 px', () => send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 560, deviceScaleFactor: 1, mobile: false }), () => send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 790, deviceScaleFactor: 1, mobile: false })],
  ['default text 16 → 20 px', () => setTextSize(20), () => setTextSize(16)],
];
const pinnedIs = (pinned: boolean) => waitFor(async () => (await capStage()).pinned === pinned, pinned ? 'pinned' : 'static');
const item = (i: number) => `document.querySelectorAll('[data-cap-item]')[${i}]`;

await scenario('capabilities: retained focus never overrides the reading position across reduced-motion, viewport and text-size switches (pinned ↔ static)', async () => {
  for (const [name, toStatic, toPinned] of transitions) {
    // (a) Inside the section, Deliveries shown, focus retained on its link (moved there while scrolling).
    await open('/', { width: 1440, height: 790 });
    await tabIntoCapabilities();
    await wheelTo(await capY(2.4));
    await toStatic();
    await pinnedIs(false);
    await settled();
    expectEqual({ focus: await focusedCapLink(), heading: await onScreen(`${item(2)}.querySelector('h3')`), link: await onScreen(capLink(2)) }, { focus: 2, heading: true, link: true }, `${name}, inside: static shows Deliveries with its focused link`);
    await toPinned();
    await pinnedIs(true);
    await settled();
    expectEqual({ focus: await focusedCapLink(), shown: await shownDetails(), link: await onScreen(capLink(2)) }, { focus: 2, shown: [2], link: true }, `${name}, inside: pinned again on Deliveries`);

    // (b) Beyond the section at Pricing, focus left on a capability link.
    await open('/', { width: 1440, height: 790 });
    await tabIntoCapabilities();
    const pricing = `document.querySelector('.price-list a')`;
    await wheelTo(await evaluate<number>(`Math.round(${pricing}.getBoundingClientRect().top + scrollY - 300)`));
    const kept = await focusedCapLink();
    // A width or text-size change reflows Pricing itself, so its exact position is not compared here
    // (stable position is covered by the layout-switch scenario); the visitor must stay at Pricing.
    for (const [step, change, pinned] of [['static', toStatic, false], ['pinned', toPinned, true]] as const) {
      await change();
      await pinnedIs(pinned);
      await settled();
      const at = await evaluate<{ pricing: boolean; capabilities: boolean }>(`(() => { const p = ${pricing}.closest('section').getBoundingClientRect();
        return { pricing: p.top < innerHeight && p.bottom > 0, capabilities: document.getElementById('capabilities').getBoundingClientRect().bottom < 0 }; })()`);
      expectEqual({ ...at, focus: await focusedCapLink() }, { pricing: true, capabilities: true, focus: kept }, `${name}, at Pricing, ${step}: Pricing section still on screen, capabilities above, focus not moved`);
    }

    // (c) Static list: Tab to Materials, scroll on to Deliveries, then the layout pins.
    await open('/', { width: 1440, height: 790 });
    await toStatic();
    await pinnedIs(false);
    await tabIntoCapabilities();
    expectEqual(await focusedCapLink(), 0, `${name}, static: Tab to Materials`);
    await wheelTo(await evaluate<number>(`Math.round(${item(2)}.getBoundingClientRect().top + scrollY - 120)`));
    await toPinned();
    await pinnedIs(true);
    await settled();
    expectEqual({ shown: await shownDetails(), focus: await focusedCapLink(), link: await onScreen(capLink(2)) }, { shown: [2], focus: 2, link: true },
      `${name}, static → pinned with focus retained on Materials: Deliveries shown, and focus on its link (never on a hidden one)`);
  }
});

/** Rendered state of the stage figures: computed opacity, running animations and the entrance-reveal attribute. */
const figuresRendered = () =>
  evaluate<{ opacity: number[]; show: number[]; animations: number; entrance: number }>(`(() => {
    const figures = [...document.querySelectorAll('[data-cap-figure]')];
    return { opacity: figures.map((f) => +parseFloat(getComputedStyle(f).opacity).toFixed(3)),
      show: figures.map((f) => +(parseFloat(getComputedStyle(f).getPropertyValue('--show')) || 0).toFixed(3)),
      animations: figures.reduce((n, f) => n + f.getAnimations({ subtree: true }).length, 0),
      entrance: document.querySelectorAll('[data-cap-figure][data-reveal], [data-cap-figure] [data-reveal], [data-cap-stage][data-reveal]').length };
  })()`);
const twoFrames = () => evaluate(`new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))`);

await scenario('capabilities: figures follow the scroll position exactly (rendered opacity, no running animations, nothing changing after scrolling stops); Tab and Shift+Tab show the finished screen at full rendered opacity at once', async () => {
  await open('/', { width: 1440, height: 900 });
  expectEqual((await figuresRendered()).entrance, 0, 'no entrance-reveal attribute on the stage or its figures');
  for (let i = 0; i < 3; i++) {
    for (const p of [i + 0.97, i + 1.03, i + 1.2]) {
      await capAt(p);
      // Two frames after the scroll: the rendered opacity already equals the scroll-driven value.
      const now = await figuresRendered();
      expectEqual({ opacity: now.opacity, animations: now.animations }, { opacity: now.show, animations: 0 }, `at ${p}: rendered opacity equals progress, nothing animating`);
      await sleep(400);
      const later = await figuresRendered();
      expectEqual(later.opacity, now.opacity, `at ${p}: nothing changes after scrolling stops`);
    }
  }
  // Keyboard: the finished screen at full rendered opacity two frames after each Tab / Shift+Tab.
  await capAt(0.1);
  await evaluate(`(() => { const h = document.getElementById('capabilities-heading'); h.setAttribute('tabindex', '-1'); h.focus(); return true; })()`);
  for (const [shift, i] of [[false, 0], [false, 1], [false, 2], [true, 1], [true, 0]] as const) {
    await press('Tab', shift);
    await twoFrames();
    const state = await figuresRendered();
    const done = await evaluate<number>(`parseFloat(getComputedStyle(document.querySelectorAll('[data-cap-figure]')[${i}]).getPropertyValue('--done'))`);
    const image = await evaluate<number>(`parseFloat(getComputedStyle(document.querySelectorAll('[data-cap-figure] img')[${i}]).opacity)`);
    expectEqual({ focus: await focusedCapLink(), opacity: state.opacity[i], others: state.opacity.filter((_, j) => j !== i).every((o) => o === 0), animations: state.animations, done, image },
      { focus: i, opacity: 1, others: true, animations: 0, done: 1, image: 1 }, `${shift ? 'Shift+' : ''}Tab to capability ${i + 1}`);
  }
});

await scenario('capabilities: every description is a group named by its capability (label and title), pinned and static', async () => {
  const expected = [
    'Materials: Inventory, movements and low stock',
    'Equipment: Assignments, utilization and maintenance',
    'Deliveries: Delivery status and recorded receipts',
    'Reporting: Project summaries and comparisons',
  ];
  await send('Accessibility.enable');
  for (const reduced of [false, true]) {
    const mode = reduced ? 'static' : 'pinned';
    await open('/', { width: 1440, height: 900, reduced });
    if (!reduced) await capAt(1.75); // descriptions 1, 3 and 4 inactive
    const { root } = await send('DOM.getDocument', { depth: 0 });
    const { nodeIds } = await send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '[data-cap-detail]' });
    const groups: string[][] = [];
    for (const nodeId of nodeIds) {
      const { nodes } = await send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
      groups.push([nodes[0]?.ignored ? 'ignored' : nodes[0]?.role?.value, nodes[0]?.name?.value]);
    }
    expectEqual(groups, expected.map((name) => ['group', name]), `${mode}: description groups`);
    expectEqual(await evaluate(`[...document.querySelectorAll('[data-cap-detail]')].map((d) => d.querySelectorAll('a').length + ':' + d.querySelector('p').textContent.slice(0, 12))`),
      ['1:Stock on han', '1:Where each t', '1:Scheduled, i', '1:Low-stock, u'], `${mode}: each group holds its own description and link`);
  }
});

await scenario('capabilities: a visitor reading inside the section stays on the same capability across pinned ↔ static; focus is not moved', async () => {
  for (const [trigger, toStatic, toPinned] of [
    ['reduced motion', () => setReducedMotion(true), () => setReducedMotion(false)],
    ['text size', () => setTextSize(20), () => setTextSize(16)],
  ] as const) {
    for (const index of [1, 2]) {
      await open('/', { width: 1440, height: 900 });
      await capAt(index + 0.3); // mid-build, not at the hold point
      await settled();
      expectEqual((await capAt(index + 0.3)).active, [index], `${trigger}: reading capability ${index + 1}`);
      await toStatic();
      await waitFor(async () => !(await capStage()).pinned, 'static');
      await settled();
      const item = `document.querySelectorAll('[data-cap-item]')[${index}]`;
      expectEqual({ focus: await focused(), label: await onScreen(`${item}.querySelector('.cap-label')`), title: await onScreen(`${item}.querySelector('h3')`) },
        { focus: 'body', label: true, title: true }, `${trigger}: capability ${index + 1} shown in the static list`);
      await toPinned();
      await waitFor(async () => (await capStage()).pinned, 'pinned');
      await settled();
      const state = await evaluate<{ active: number[]; done: number }>(`(() => { const items = [...document.querySelectorAll('[data-cap-item]')]; const f = document.querySelectorAll('[data-cap-figure]')[${index}];
        return { active: items.flatMap((it, j) => it.classList.contains('is-active') ? [j] : []), done: parseFloat(getComputedStyle(f).getPropertyValue('--done')) }; })()`);
      expectEqual({ ...state, focus: await focused(), description: await onScreen(`document.querySelectorAll('[data-cap-detail]')[${index}]`) }, { active: [index], done: 1, focus: 'body', description: true }, `${trigger}: back to pinned on capability ${index + 1}`);
    }
  }
  // Reading above the section: switching neither scrolls the page nor moves focus.
  await open('/', { width: 1440, height: 900 });
  await evaluate(`scrollTo({ top: document.getElementById('capabilities').getBoundingClientRect().top + scrollY - 900, behavior: 'instant' })`);
  await settled();
  const y = await evaluate<number>('scrollY');
  await setReducedMotion(true);
  await waitFor(async () => !(await capStage()).pinned, 'static');
  await settled();
  expectEqual({ y: await evaluate('scrollY'), focus: await focused() }, { y, focus: 'body' }, 'above the section: unchanged');
  await setReducedMotion(false);
});

await scenario('capabilities: laptop content viewports 1366x650, 1440x790 and 1536x730 pin with every phase fully shown and text at full size', async () => {
  const sizes = () => evaluate<string>(`[...document.querySelectorAll('[data-cap-item] h3, [data-cap-detail] p, .cap-label')].map(e => getComputedStyle(e).fontSize).join()`);
  await open('/', { width: 1440, height: 900 });
  const reference = await sizes();
  for (const [width, height] of [[1366, 650], [1440, 790], [1536, 730]] as const) {
    await open('/', { width, height });
    expectEqual(await capStage(), { pinned: true, consistent: true, overflow: false }, `${width}x${height}: pinned`);
    expectEqual(await sizes(), reference, `${width}x${height}: text sizes equal 1440x900`);
    for (let i = 0; i < 4; i++) {
      await capAt(i + 0.75);
      await settled();
      for (const [name, el] of [['schedule', `document.querySelector('.cap-text')`], ['description link', capLink(i)], ['stage frame', `document.querySelector('[data-cap-stage-frame]')`],
        ['simulation label', `document.querySelector('[data-cap-stage] .sim-label')`], ['caption', `document.querySelectorAll('[data-cap-figure] figcaption')[${i}]`]] as const)
        expectEqual(await onScreen(el), true, `${width}x${height} capability ${i + 1}: ${name} fully shown`);
      expectEqual(await onScreen(`document.querySelectorAll('[data-cap-detail]')[${i}]`), true, `${width}x${height} capability ${i + 1}: its open description fully shown`);
    }
  }
});

await scenario('capabilities: live text 16→20→32→16 px with focus on the final capability link keeps it focused and visible', async () => {
  await open('/', { width: 1440, height: 900 });
  await evaluate(`${capLink(2)}.focus()`);
  await press('Tab');
  expectEqual(await evaluate(`document.activeElement === ${lastLink}`), true, 'final link focused by Tab');
  await evaluate(`new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))`);
  expectEqual([(await capStage()).pinned, await onScreen(lastLink)], [true, true], '16 px');
  // At 1440x900 the pinned schedule fits at 16 px only; enlarged text uses the complete static list.
  for (const [size, pinned] of [[20, false], [32, false], [16, true]] as const) {
    await setTextSize(size);
    const state = await capStage();
    const focus = await evaluate<boolean>(`document.activeElement === ${lastLink}`);
    expectEqual({ ...state, focus, visible: await onScreen(lastLink) }, { pinned, consistent: true, overflow: false, focus: true, visible: true }, `${size} px`);
  }
});

await scenario('capabilities: live reduced-motion switches with focus on a capability link keep it focused and visible', async () => {
  await open('/', { width: 1440, height: 900 });
  await evaluate(`${capLink(1)}.focus()`);
  await evaluate(`new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))`);
  for (const reduced of [true, false, true, false]) {
    await setReducedMotion(reduced);
    await waitFor(async () => (await capStage()).pinned === !reduced, reduced ? 'static' : 'pinned');
    await evaluate(`new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 100))))`);
    expectEqual({ ...(await capStage()), focus: await evaluate<boolean>(`document.activeElement === ${capLink(1)}`), visible: await onScreen(capLink(1)) },
      { pinned: !reduced, consistent: true, overflow: false, focus: true, visible: true }, `reduced motion ${reduced}`);
  }
});

await scenario('capabilities: midway through the pinned section with focus elsewhere, live 16→20→32→16 px re-measures and keeps the stage consistent', async () => {
  await open('/', { width: 1440, height: 900 });
  await evaluate(`(() => { const s = document.querySelector('[data-cap]'); scrollTo({ top: s.getBoundingClientRect().top + scrollY - 64 + 1100, behavior: 'instant' }); })()`);
  const elsewhere = `document.querySelector('[data-site-header] a[href="/"]')`;
  await evaluate(`${elsewhere}.focus({ preventScroll: true })`);
  for (const [size, pinned] of [[20, false], [32, false], [16, true]] as const) {
    await setTextSize(size);
    const state = await capStage();
    expectEqual({ ...state, focus: await evaluate<boolean>(`document.activeElement === ${elsewhere}`) }, { pinned, consistent: true, overflow: false, focus: true }, `${size} px`);
    if (pinned) {
      const y = await evaluate<number>('scrollY');
      await capAt(0.75);
      expectEqual(await onScreen(`document.querySelector('.cap-text')`), true, `${size} px: schedule fully shown`);
      expectEqual(await onScreen(`document.querySelector('[data-cap-stage-frame]')`), true, `${size} px: stage frame fully shown`);
      const end = await capAt(3.99);
      expectEqual({ active: end.active, done: end.done }, { active: [3], done: 1 }, `${size} px: last capability finished at the end of the pinned range`);
      await evaluate(`scrollTo({ top: ${y}, behavior: 'instant' })`);
    }
  }
});

// A page-wide text-size change reflows everything above; Chromium's scroll anchoring does not keep
// a focused element far down the page in view even when the stage never pins (reduced motion), so
// on-screen position across a text change is not asserted here. What the stage controls is
// asserted: it never scrolls the page while focus is elsewhere, and its own pinned ↔ static switch
// leaves content below it where it was.
await scenario('layout switches keep content below in place: workflow and pricing links, pinned ↔ static and stage ↔ list, three runs each', async () => {
  for (const target of ['.workflow-foot a', '.price-list a']) {
    for (let run = 1; run <= 3; run++) {
      await open('/', { width: 1440, height: 900 });
      const link = `document.querySelector('${target}')`;
      await evaluate(`${link}.scrollIntoView({ block: 'center', behavior: 'instant' }); ${link}.focus({ preventScroll: true })`);
      const top = () => evaluate<number>(`Math.round(${link}.getBoundingClientRect().top)`);
      const before = await top();
      for (const reduced of [true, false]) {
        await setReducedMotion(reduced);
        await waitFor(async () => (await capStage()).pinned === !reduced, reduced ? 'static' : 'pinned');
        await evaluate(`new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 100))))`);
        const now = await top();
        // ±1 px allows sub-pixel layout rounding.
        if (Math.abs(now - before) > 1) throw new Error(`${target} run ${run}, reduced motion ${reduced}: moved ${before} → ${now}`);
      }
      expectEqual(await evaluate<boolean>(`document.activeElement === ${link}`), true, `${target} run ${run}: focus kept`);
    }
  }
});

await scenario('layout switches: the trailing audience strip above Pricing never pulls reading position back to the audience heading', async () => {
  await open('/', { width: 1440, height: 900 });
  await settled();
  await evaluate(`scrollTo({top: document.querySelector('.pricing-preview').getBoundingClientRect().top + scrollY - 80, behavior:'instant'})`);
  await settled();
  const top = await evaluate<number>(`document.querySelector('.pricing-preview').getBoundingClientRect().top`);
  expectEqual(Math.abs(top - 80) < 1, true, 'Pricing at the reading position');
  for (const reduced of [true, false]) {
    await setReducedMotion(reduced);
    await settled();
    const after = await evaluate<number>(`document.querySelector('.pricing-preview').getBoundingClientRect().top`);
    expectEqual(Math.abs(after - top) < 2, true, `reduced motion ${reduced}: preserve Pricing`);
  }
});

await scenario('capabilities: focus below the section (a pricing link) is kept and the stage never scrolls the page through live 32→16→20→16 px', async () => {
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

await scenario('capabilities: no repeated re-evaluation or ResizeObserver loop errors once a text-size change has settled, and no work while idle', async () => {
  await open('/', { width: 1440, height: 900 });
  await capAt(1.4);
  await evaluate(`window.__roErrors = []; addEventListener('error', (e) => { if (/ResizeObserver/.test(e.message)) __roErrors.push(e.message); })`);
  for (const size of [20, 32, 16]) {
    await setTextSize(size);
    const mutations = await evaluate<number>(`new Promise((done) => { let n = 0;
      const mo = new MutationObserver((list) => { n += list.length; });
      mo.observe(document.querySelector('[data-cap]'), { attributes: true, subtree: true, attributeFilter: ['class', 'style'] });
      setTimeout(() => { mo.disconnect(); done(n); }, 700); })`);
    expectEqual(mutations, 0, `${size} px: attribute changes while idle`);
  }
  expectEqual(await evaluate(`__roErrors`), [], 'ResizeObserver errors');
});

await scenario('capabilities: reduced motion, no JavaScript and enlarged text keep the complete static list through live 16→20→32→16 px', async () => {
  for (const options of [{ reduced: true }, { js: false }]) {
    await open('/', { width: 1440, height: 900, ...options });
    for (const size of [20, 32, 16]) {
      await send('Page.setFontSizes', { fontSizes: { standard: size, fixed: 13 } });
      await sleep(300);
      expectEqual(await capStage(), { pinned: false, consistent: true, overflow: false }, `${JSON.stringify(options)} ${size} px`);
      expectEqual(await evaluate(`[...document.querySelectorAll('[data-cap-item]')].every(i => i.querySelector('.cap-detail p').checkVisibility() && i.querySelector('.cap-detail a').checkVisibility() && i.querySelector('img').checkVisibility())`), true, `${JSON.stringify(options)} ${size} px: every description, link and screenshot shown`);
    }
  }
  await open('/', { width: 1440, height: 900, fontSize: 32 });
  expectEqual(await capStage(), { pinned: false, consistent: true, overflow: false }, 'enlarged 32 px text from the start');
});

await scenario('capabilities: a failed start leaves the complete static list and the rest of Home still initializes', async () => {
  const { identifier } = await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const q = Element.prototype.querySelector;
    Element.prototype.querySelector = function (s) { if (s === '[data-cap-stage-frame]') throw new Error('simulated capability stage failure'); return q.call(this, s); }; })()` });
  try {
    await open('/', { width: 1440, height: 900 });
    await evaluate(`new Promise((done) => setTimeout(done, 300))`);
    expectEqual(await capStage(), { pinned: false, consistent: true, overflow: false }, 'static list after failure');
    expectEqual(await evaluate(`document.querySelector('[data-audience-orbit]').classList.contains('is-orbit')`), true, 'audience sequence still initialized');
    expectEqual(await evaluate(`[...document.querySelectorAll('[data-cap-item]')].every(i => i.querySelector('[data-cap-detail] a')?.checkVisibility())`), true, 'all four demo links shown in their rows');
  } finally {
    await send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
  }
});

await scenario('navigation: desktop routes, mobile keyboard menu, Escape and the demo return link remain usable', async () => {
  await open('/', {width:1440,height:900});
  expectEqual(await evaluate(`document.querySelector('#site-nav a[aria-current="page"]').pathname`), '/', 'Home current');
  const routes = await evaluate<string[]>(`[...document.querySelectorAll('#site-nav .nav-list a')].map(a=>a.pathname)`);
  expectEqual(routes.length, 7, 'seven public routes');
  for(const route of routes) expectEqual((await fetch(origin + route)).status, 200, route);
  await open('/', {width:390,height:844});
  await evaluate(`document.querySelector('[data-menu-toggle]').focus()`);
  await press('Enter');
  expectEqual(await evaluate(`document.querySelector('[data-menu-toggle]').getAttribute('aria-expanded')`), 'true', 'menu opened');
  await press('Tab');
  expectEqual(await evaluate(`document.activeElement.pathname`), '/', 'Home reached');
  await press('Escape');
  expectEqual(await evaluate(`document.activeElement === document.querySelector('[data-menu-toggle]')`), true, 'Escape returns focus');
  await press('Enter'); await press('Tab'); await press('Tab'); await press('Enter');
  await waitFor(()=>evaluate<boolean>(`location.pathname === '/solutions/' && document.readyState === 'complete'`), 'Solutions navigation');
  await open('/product-demo/', {width:1440,height:900});
  await click('.back-link');
  await waitFor(()=>evaluate<boolean>(`location.pathname === '/' && document.readyState === 'complete'`), 'Back to website');
});

// Solutions' capability jump links and numbered capability labels sit inside containers that clip
// overflow, so page-level overflow cannot reveal a cut-off label. Check the rendered text itself.
await scenario('solutions: jump links and capability labels stay fully visible and separate at 320/390 px with a 32 px default font, JavaScript on and off', async () => {
  for (const width of [320, 390]) for (const js of [true, false]) {
    await open('/solutions/', { width, height: 800, fontSize: 32, js });
    const problems = await evaluate<string[]>(`(() => {
      const problems = [];
      const textRects = (el) => { const range = document.createRange(); range.selectNodeContents(el); return [...range.getClientRects()].filter((r) => r.width > 0); };
      const overlap = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
      const visible = (el, name) => {
        const box = el.getBoundingClientRect();
        for (const t of textRects(el)) if (t.left < box.left - 1 || t.right > box.right + 1 || t.right > innerWidth + 1) { problems.push(name + ': text outside its box'); break; }
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
          if (!/(hidden|clip)/.test(getComputedStyle(a).overflowX)) continue;
          const clip = a.getBoundingClientRect();
          if (textRects(el).some((t) => t.left < clip.left - 1 || t.right > clip.right + 1)) { problems.push(name + ': clipped by .' + a.classList[0]); break; }
        }
      };
      const links = [...document.querySelectorAll('.jump a')];
      if (links.length !== 4) problems.push('expected four jump links, found ' + links.length);
      links.forEach((a) => visible(a, 'jump link ' + a.textContent.trim().replace(/\\s+/g, ' ')));
      links.forEach((a, i) => links.slice(i + 1).forEach((b) => { if (overlap(a.getBoundingClientRect(), b.getBoundingClientRect())) problems.push('jump links overlap: ' + a.textContent.trim() + ' / ' + b.textContent.trim()); }));
      const labels = [...document.querySelectorAll('.capability-label')];
      if (labels.length !== 4) problems.push('expected four capability labels, found ' + labels.length);
      labels.forEach((label, i) => {
        visible(label, 'capability label ' + (i + 1));
        const parts = [...label.children].map((c) => c.getBoundingClientRect());
        parts.forEach((p, j) => parts.slice(j + 1).forEach((q) => { if (overlap(p, q)) problems.push('capability label ' + (i + 1) + ': number and name overlap'); }));
      });
      return [...new Set(problems)];
    })()`);
    expectEqual(problems, [], `${width} px, JavaScript ${js ? 'on' : 'off'}`);
  }
});

// Native focus scrolling brings a link's box into view, not its outline. Check the complete
// outline extent (box + offset + width) after scrolling settles, against the visible area below a
// sticky header and every clipping ancestor.
await scenario('solutions: Tab through the jump links at 390 px / 32 px leaves each complete focus outline visible, JavaScript on and off', async () => {
  for (const js of [true, false]) {
    await open('/solutions/', { width: 390, height: 844, fontSize: 32, js });
    await evaluate(`(() => { const h = document.getElementById('solutions-heading'); h.setAttribute('tabindex', '-1'); h.focus(); return true; })()`);
    for (let i = 0; i < 4; i++) {
      await press('Tab');
      let last = -1;
      for (let k = 0; k < 20; k++) { await sleep(50); const y = await evaluate<number>('scrollY'); if (y === last) break; last = y; }
      const report = await evaluate<{ link: string; problems: string[] }>(`(() => {
        const a = document.activeElement, cs = getComputedStyle(a), problems = [];
        if (!a.closest('.jump')) return { link: a.textContent.trim(), problems: ['focus left the jump links'] };
        const width = cs.outlineStyle === 'none' ? 0 : parseFloat(cs.outlineWidth), grow = width + (parseFloat(cs.outlineOffset) || 0), r = a.getBoundingClientRect();
        const ext = { top: r.top - grow, bottom: r.bottom + grow, left: r.left - grow, right: r.right + grow };
        if (width < 2) problems.push('no visible outline');
        const header = document.querySelector('[data-site-header]'), hp = getComputedStyle(header).position;
        const covered = hp === 'sticky' || hp === 'fixed' ? header.getBoundingClientRect().bottom : 0;
        if (ext.top < covered - 0.5) problems.push('outline top under the header');
        if (ext.bottom > innerHeight + 0.5) problems.push('outline bottom below the viewport by ' + (ext.bottom - innerHeight).toFixed(1) + 'px');
        if (ext.left < -0.5 || ext.right > innerWidth + 0.5) problems.push('outline outside the viewport horizontally');
        for (let p = a.parentElement; p && p !== document.documentElement; p = p.parentElement) {
          const pcs = getComputedStyle(p), pr = p.getBoundingClientRect(), clips = (v) => /(hidden|clip|auto|scroll)/.test(v);
          if (clips(pcs.overflowX) && (ext.left < pr.left - 0.5 || ext.right > pr.right + 0.5)) problems.push('outline clipped horizontally by .' + (p.classList[0] || p.tagName));
          if (clips(pcs.overflowY) && (ext.top < pr.top - 0.5 || ext.bottom > pr.bottom + 0.5)) problems.push('outline clipped vertically by .' + (p.classList[0] || p.tagName));
        }
        return { link: a.textContent.trim().replace(/\\s+/g, ' '), problems };
      })()`);
      expectEqual(report.problems, [], `JavaScript ${js ? 'on' : 'off'}, link ${i + 1} (${report.link})`);
    }
  }
});

// The rem-based desktop navigation query switches when the browser text size changes, with no
// media `change` event; a focused header control must keep the keyboard position.
/** The desktop navigation indicator: which link's text it underlines (or null), and whether it is shown. */
const navIndicator = () =>
  evaluate<{ under: string | null; shown: boolean; current: string | null; yellow: string[]; marker: string[] }>(`(() => {
    const ind = document.querySelector('[data-nav-indicator]'), r = ind.getBoundingClientRect();
    const links = [...document.querySelectorAll('#site-nav .nav-list a')];
    const under = links.find((a) => { const lr = a.getBoundingClientRect(), cs = getComputedStyle(a);
      const left = lr.left + parseFloat(cs.paddingLeft), width = lr.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      return Math.abs(r.left - left) < 1 && Math.abs(r.width - width) < 1 && Math.abs(r.bottom - lr.bottom) < 1; });
    return { under: under ? under.textContent.trim() : null, shown: ind.checkVisibility() && parseFloat(getComputedStyle(ind).opacity) > 0.99,
      current: links.find((a) => a.getAttribute('aria-current') === 'page')?.textContent.trim() ?? null,
      yellow: links.filter((a) => getComputedStyle(a).color === 'rgb(255, 212, 59)').map((a) => a.textContent.trim()),
      marker: links.filter((a) => getComputedStyle(a).boxShadow !== 'none').map((a) => a.textContent.trim()) };
  })()`);
async function pointTo(label: string | null) {
  const point = label
    ? await evaluate<{ x: number; y: number }>(`(() => { const a = [...document.querySelectorAll('#site-nav .nav-list a')].find((a) => a.textContent.trim() === ${JSON.stringify(label)});
        const r = a.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`)
    : { x: 700, y: 500 };
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
  await navSettled();
}
/** Waits until the indicator's move (a 250 ms transition) has finished. */
const navSettled = () =>
  evaluate(`new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() =>
    Promise.all(document.querySelector('[data-nav-indicator]').getAnimations().map((a) => a.finished.catch(() => {}))).then(() => done(true)))))`);

await scenario('navigation: one moving indicator under the current page, a hovered link or a keyboard-focused link, on several routes', async () => {
  for (const [path, current] of [['/', 'Home'], ['/pricing/', 'Pricing'], ['/product-demo/', 'Product Demo'], ['/contact/', 'Contact']] as const) {
    await open(path, { width: 1440, height: 900 });
    await pointTo(null);
    expectEqual(await navIndicator(), { under: current, shown: true, current, yellow: [], marker: [] }, `${path}: at rest under the current page (no second marker)`);
    expectEqual(await evaluate(`document.querySelectorAll('[data-nav-indicator]').length`), 1, `${path}: one indicator`);
    await pointTo('About');
    expectEqual(await navIndicator(), { under: 'About', shown: true, current, yellow: ['About'], marker: [] }, `${path}: hover About`);
    await pointTo(null);
    expectEqual((await navIndicator()).under, current, `${path}: back to the current page`);
  }
  // Keyboard focus takes over from a resting pointer and is where the indicator returns after a hover.
  await open('/solutions/', { width: 1440, height: 900 });
  await pointTo('Contact');
  await evaluate(`document.querySelector('[data-site-header] a').focus(); true`);
  await press('Tab');
  await press('Tab');
  await navSettled();
  expectEqual({ focus: await evaluate(`document.activeElement.textContent.trim()`), ...(await navIndicator()) },
    { focus: 'Solutions', under: 'Solutions', shown: true, current: 'Solutions', yellow: ['Solutions', 'Contact'], marker: [] }, 'Tab while the pointer rests on Contact');
  expectEqual(await evaluate(`getComputedStyle(document.activeElement).outlineStyle !== 'none'`), true, 'focus outline kept with the indicator');
  await pointTo('Pricing');
  expectEqual((await navIndicator()).under, 'Pricing', 'a new hover moves it');
  await pointTo(null);
  expectEqual((await navIndicator()).under, 'Solutions', 'leaving returns to the keyboard-focused link');
  await press('Tab');
  await navSettled();
  expectEqual((await navIndicator()).under, 'How It Works', 'Tab moves it');
  await evaluate(`document.activeElement.blur(); true`);
  await navSettled();
  expectEqual((await navIndicator()).under, 'Solutions', 'focus leaves: back to the current page');
  // A route with no matching link (the built 404 page; the test server answers unknown URLs with plain text): hidden at rest, shown on hover.
  await open('/404.html', { width: 1440, height: 900 });
  expectEqual((await navIndicator()).shown, false, '404: hidden at rest');
  await pointTo('Pricing');
  expectEqual(await navIndicator(), { under: 'Pricing', shown: true, current: null, yellow: ['Pricing'], marker: [] }, '404: hover');
  await pointTo(null);
  expectEqual((await navIndicator()).shown, false, '404: hidden again');
  // Reduced motion: moves at once.
  await open('/', { width: 1440, height: 900, reduced: true });
  expectEqual(await evaluate(`getComputedStyle(document.querySelector('[data-nav-indicator]')).transitionDuration`), '0s', 'reduced motion: no transition');
  // Without JavaScript: the static current-page marker, no indicator.
  await open('/pricing/', { width: 1440, height: 900, js: false });
  expectEqual(await navIndicator(), { under: null, shown: false, current: 'Pricing', yellow: [], marker: ['Pricing'] }, 'no JavaScript: static marker');
  // The mobile menu keeps its own current-page marker and no indicator.
  await open('/pricing/', { width: 390, height: 844 });
  await click('[data-menu-toggle]');
  await sleep(200);
  expectEqual(await navIndicator(), { under: null, shown: false, current: 'Pricing', yellow: [], marker: ['Pricing'] }, 'mobile menu: static marker');
});

await scenario('navigation: live text-size changes that collapse or expand the header keep focus on an equivalent visible control', async () => {
  const header = () => evaluate<{ active: string; visible: boolean; open: string | null }>(`(() => { const a = document.activeElement;
    return { active: a === document.body ? 'body' : a.textContent.trim(), visible: a !== document.body && a.checkVisibility(), open: document.querySelector('[data-menu-toggle]').getAttribute('aria-expanded') }; })()`);
  const fonts = (size: number) => send('Page.setFontSizes', { fontSizes: { standard: size, fixed: 13 } });
  for (const path of ['/pricing/', '/contact/']) {
    await open(path, { width: 1440, height: 900 });
    await evaluate(`document.querySelector('#site-nav a[href="/about/"]').focus()`);
    await fonts(32);
    await waitFor(async () => (await header()).open === 'true', `${path} menu opened for the focused link`);
    expectEqual(await header(), { active: 'About', visible: true, open: 'true' }, `${path} link kept after collapse`);
    await press('Tab');
    expectEqual((await header()).active, 'Contact', `${path} Tab continues in the menu`);
    await fonts(16);
    await waitFor(async () => (await header()).open === 'false', `${path} menu closed on expand`);
    expectEqual(await header(), { active: 'Contact', visible: true, open: 'false' }, `${path} link kept after expand`);

    await open(path, { width: 1440, height: 900, fontSize: 32 });
    await evaluate(`document.querySelector('[data-menu-toggle]').focus()`);
    await fonts(16);
    await waitFor(async () => (await header()).active !== 'Menu', `${path} focus left the hidden Menu button`);
    const current = await evaluate<string>(`document.querySelector('#site-nav a[aria-current="page"]').textContent.trim()`);
    expectEqual(await header(), { active: current, visible: true, open: 'false' }, `${path} Menu focus moves to the current page link`);
  }
});

await scenario('how it works: each connector joins the edges of neighbouring step circles (never inside one), centred, in the row and the stacked layouts', async () => {
  for (const [width, height, fontSize, vertical] of [[1440, 900, 16, false], [1024, 768, 16, false], [390, 844, 16, false], [1440, 900, 32, false], [390, 844, 32, true], [320, 700, 32, true]] as const) {
    await open('/how-it-works/', { width, height, fontSize });
    const lines = await evaluate<{ vertical: boolean; gapStart: number; gapEnd: number; offCentre: number }[]>(`(() => {
      const items = [...document.querySelectorAll('.flow li')], nodes = items.map((li) => li.querySelector('.flow-node').getBoundingClientRect());
      return items.slice(0, -1).map((li, i) => { const cs = getComputedStyle(li, '::after'), lr = li.getBoundingClientRect();
        const line = { left: lr.left + parseFloat(cs.left), top: lr.top + parseFloat(cs.top), w: parseFloat(cs.width), h: parseFloat(cs.height) };
        const a = nodes[i], b = nodes[i + 1], vertical = line.h > line.w;
        return { vertical, gapStart: +(vertical ? line.top - a.bottom : line.left - a.right).toFixed(1), gapEnd: +(vertical ? b.top - (line.top + line.h) : b.left - (line.left + line.w)).toFixed(1),
          offCentre: +(vertical ? Math.abs(line.left + line.w / 2 - (a.left + a.width / 2)) : Math.abs(line.top + line.h / 2 - (a.top + a.height / 2))).toFixed(1) }; });
    })()`);
    expectEqual(lines, [0, 1].map(() => ({ vertical, gapStart: 0, gapEnd: 0, offCentre: 0 })), `${width} px, ${fontSize} px text`);
  }
});

await scenario('demo: the shared (non-sticky) site header above the application shell; full-height sidebar from the rendered bottom of the header, compact workspace header, one h1, no website navigation in the workspace, prominent disclosures and working entry points', async () => {
  for (const js of [true, false]) {
    await open('/product-demo/', { width: 1440, height: 900, js });
    const shell = await evaluate<Record<string, unknown>>(`(() => { const sidebar = document.querySelector('.app-sidebar').getBoundingClientRect(), app = document.querySelector('.demo-app').getBoundingClientRect();
      const disclosure = document.querySelector('.app-disclosure');
      const header = document.querySelector('[data-site-header]');
      return { siteHeader: !!header && header.checkVisibility() && getComputedStyle(header).position !== 'sticky' && header.querySelector('a[aria-current="page"]')?.getAttribute('href') === '/product-demo/',
        h1: [...document.querySelectorAll('h1')].map((h) => h.textContent.trim()), sidebarAtHeader: Math.abs(sidebar.top - header.getBoundingClientRect().bottom) < 1, sidebarFullHeight: Math.abs(sidebar.height - app.height) < 1,
        workspaceSiteLinks: [...document.querySelectorAll('.app-workspace a[href]')].filter((a) => !a.getAttribute('href').startsWith('#')).length,
        back: document.querySelector('.app-sidebar .back-link').checkVisibility() && document.querySelector('.app-sidebar .back-link').getAttribute('href'),
        disclosure: disclosure.checkVisibility() && /fictional/i.test(disclosure.textContent) && /no live hardware/i.test(disclosure.textContent) && /IoT device/.test(disclosure.textContent),
        note: /No live hardware/.test(document.querySelector('.sidebar-note').textContent), skip: document.querySelector('.skip-link').getAttribute('href'), mainContainsApp: document.querySelector('main').contains(document.querySelector('.demo-app')) }; })()`);
    expectEqual(shell, { siteHeader: true, h1: ['Interactive Platform Demo'], sidebarAtHeader: true, sidebarFullHeight: true, workspaceSiteLinks: 0, back: '/', disclosure: true, note: true, skip: '#main', mainContainsApp: true }, `desktop shell, JavaScript ${js ? 'on' : 'off'}`);
  }
  // The skip link moves focus to the main content.
  await open('/product-demo/', { width: 1440, height: 900 });
  await press('Tab');
  expectEqual(await evaluate(`document.activeElement.classList.contains('skip-link')`), true, 'skip link first');
  await press('Enter');
  await waitFor(() => evaluate<boolean>(`document.activeElement === document.querySelector('main')`), 'focus on main');
  // The section title is in the compact workspace header, beside the project picker and Reset.
  expectEqual(await evaluate(`(() => { const t = document.querySelector('.app-toolbar'); return ['[data-section-title]', '[data-project-select]', '[data-reset]'].every((q) => t.contains(document.querySelector(q)) && document.querySelector(q).checkVisibility()); })()`), true, 'workspace header controls');
  // Hash entry points still open their sections.
  for (const [hash, panel] of [['#demo-panel-equipment', 'equipment'], ['#demo-panel-deliveries', 'deliveries']] as const) {
    // A fresh load, as from a link on Home (a hash change on the same page fires no load event).
    await send('Page.navigate', { url: 'about:blank' });
    await sleep(200);
    await open('/product-demo/' + hash, { width: 1440, height: 900 });
    expectEqual(await evaluate(`document.querySelector('[data-panel="${panel}"]').checkVisibility() && document.querySelector('[data-section-button="${panel}"]').getAttribute('aria-current')`), 'true', `${hash} opens ${panel}`);
  }
  // Mobile: the site header's Menu above the application's own Sections toolbar; the drawer holds the sidebar.
  await open('/product-demo/', { width: 390, height: 844 });
  expectEqual(await evaluate(`({ menu: document.querySelector('[data-menu-toggle]').checkVisibility(), sections: document.querySelector('[data-drawer-toggle]').checkVisibility(), sidebar: document.querySelector('.app-sidebar').checkVisibility(),
      order: document.querySelector('[data-site-header]').getBoundingClientRect().bottom <= document.querySelector('.app-toolbar').getBoundingClientRect().top, workspaceSiteLinks: [...document.querySelectorAll('.app-workspace a[href]')].filter((a) => !a.getAttribute('href').startsWith('#')).length })`),
    { menu: true, sections: true, sidebar: false, order: true, workspaceSiteLinks: 0 }, 'mobile: site header, then app toolbar');
  // Short window and enlarged text: every sidebar control stays reachable.
  await open('/product-demo/', { width: 1280, height: 520, fontSize: 24 });
  expectEqual(await evaluate(`(() => { const controls = [...document.querySelectorAll('.app-sidebar a, .app-sidebar button')].filter((e) => e.checkVisibility());
    return controls.every((e) => { e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }); })()`), true, 'short window, 24 px text: sidebar controls reachable');
});

await scenario('blueprint grid: shared on navy/ink background surfaces (quieter on the header and demo sidebar), never on the hero video, photo band, forms or screenshots', async () => {
  const grid = (selector: string) => evaluate<string>(`(() => { const el = document.querySelector('${selector}'); if (!el) return 'missing'; const bg = getComputedStyle(el).backgroundImage;
    return /rgba\\(125, 211, 252, 0\\.1\\)/.test(bg) ? 'grid' : /rgba\\(125, 211, 252, 0\\.055\\)/.test(bg) ? 'quiet' : 'none'; })()`);
  const expected: [string, string, string][] = [
    ['/', '.showcase', 'grid'], ['/', '.workflow', 'grid'], ['/', '.segments', 'grid'], ['/', '.site-footer', 'grid'], ['/', '[data-site-header]', 'quiet'], ['/', '.hero', 'none'], ['/', '.closing', 'none'],
    ['/solutions/', '.intro', 'grid'], ['/solutions/', '.services', 'grid'], ['/how-it-works/', '.intro', 'grid'], ['/how-it-works/', '.reality', 'grid'], ['/pricing/', '.intro', 'grid'], ['/pricing/', '.cta-band', 'grid'],
    ['/about/', '.intro', 'grid'], ['/about/', '.purpose', 'grid'], ['/product-demo/', '.app-sidebar', 'quiet'], ['/product-demo/', '.app-workspace', 'none'], ['/contact/', '.form-area', 'none'],
  ];
  const results: string[] = [];
  let route = '';
  for (const [path, selector, kind] of expected) {
    if (path !== route) await open((route = path), { width: 1440, height: 900 });
    const actual = await grid(selector);
    if (actual !== kind) results.push(`${path} ${selector}: ${actual}, expected ${kind}`);
  }
  expectEqual(results, [], 'grid placement');
  expectEqual(await evaluate(`[...document.querySelectorAll('img, video, table, form, canvas')].filter((e) => /125, 211, 252/.test(getComputedStyle(e).backgroundImage)).length`), 0, 'no grid on media, tables or forms (Contact)');
});

/** Opens the demo freshly (a hash change on the same page fires no load event). */
async function openDemo(hash: string, options: OpenOptions = {}) {
  await send('Page.navigate', { url: 'about:blank' });
  await sleep(150);
  await open('/product-demo/' + hash, { width: 1440, height: 900, ...options });
}

await scenario('demo sidebar: Tab and Shift+Tab leave every complete focus outline visible in short windows and in the drawer (1440x350; drawer at 390x350 and with 24 px text)', async () => {
  const settle = async () => {
    let last = '';
    for (let k = 0; k < 20; k++) {
      await sleep(50);
      const now = await evaluate<string>(`scrollY + ',' + document.querySelector('.app-sidebar').scrollTop`);
      if (now === last) break;
      last = now;
    }
  };
  const outline = () =>
    evaluate<string | null>(`(() => { const a = document.activeElement; if (!document.querySelector('[data-demo-sidebar]').contains(a)) return null;
      const cs = getComputedStyle(a), w = cs.outlineStyle === 'none' ? 0 : parseFloat(cs.outlineWidth), g = w + (parseFloat(cs.outlineOffset) || 0), r = a.getBoundingClientRect();
      const top = r.top - g, bottom = r.bottom + g, problems = [];
      if (w < 2) problems.push('no outline');
      if (top < -0.5) problems.push('top cut ' + (-top).toFixed(1));
      if (bottom > innerHeight + 0.5) problems.push('bottom cut ' + (bottom - innerHeight).toFixed(1));
      for (let p = a.parentElement; p && p !== document.documentElement; p = p.parentElement) { const pc = getComputedStyle(p), pr = p.getBoundingClientRect();
        if (/(hidden|clip|auto|scroll)/.test(pc.overflowY) && (top < pr.top - 0.5 || bottom > pr.bottom + 0.5)) problems.push('clipped by .' + (p.classList[0] || p.tagName)); }
      return problems.length ? a.textContent.trim().replace(/\\s+/g, ' ').slice(0, 24) + ': ' + problems.join(', ') : ''; })()`);
  for (const [name, options, drawer] of [['1440x350', { width: 1440, height: 350 }, false], ['390x350 drawer', { width: 390, height: 350 }, true], ['1440x350 24 px drawer', { width: 1440, height: 350, fontSize: 24 }, true]] as const) {
    await openDemo('', options);
    // Opened from the keyboard, as a keyboard user would (a pointer-opened drawer rightly shows no focus ring).
    if (drawer) { await evaluate(`document.querySelector('[data-drawer-toggle]').focus()`); await press('Enter'); }
    else await evaluate(`[...document.querySelectorAll('[data-site-header] a, [data-site-header] button')].filter((e) => e.checkVisibility()).at(-1).focus()`);
    const count = await evaluate<number>(`[...document.querySelectorAll('[data-demo-sidebar] a[href], [data-demo-sidebar] button')].filter((e) => e.checkVisibility()).length`);
    const problems: string[] = [];
    for (let i = 0; i < count; i++) {
      if (!(drawer && i === 0)) await press('Tab');
      await settle();
      const p = await outline();
      if (p === null) problems.push(`Tab ${i + 1} left the sidebar`);
      else if (p) problems.push(p);
    }
    for (let i = 0; i < count - 1; i++) {
      await press('Tab', true);
      await settle();
      const p = await outline();
      if (p) problems.push('Shift+' + p);
    }
    expectEqual(problems, [], name);
  }
});

const estimateOut = () => evaluate<string[]>(`[...document.querySelectorAll('[data-estimate-out]')].map((e) => e.textContent.trim())`);
const setEstimate = (values: Record<string, string>) =>
  evaluate(`(() => { for (const [k, v] of Object.entries(${JSON.stringify(values)})) { const input = document.querySelector('[data-estimate-input="' + k + '"]'); input.value = v; input.dispatchEvent(new Event('input', { bubbles: true })); } return true; })()`);
const overviewFigures = () => evaluate<string>(`[...document.querySelectorAll('[data-panel="overview"] .tile, [data-panel="overview"] [data-scope]')].map((e) => e.textContent.replace(/\\s+/g, ' ').trim()).join('|')`);

await scenario('demo tools: the concrete estimate calculates, validates with an error summary, explains itself, restores the example and leaves the tracking sections unchanged', async () => {
  await openDemo('#demo-panel-estimate');
  const tracking = await evaluate<string>(`[...document.querySelectorAll('[data-panel="overview"]')].map((e) => e.innerHTML.length).join()`);
  const before = await overviewFigures();
  await setEstimate({ length: '7' });
  expectEqual(await evaluate(`document.querySelector('[data-estimate-result-state]').textContent.startsWith('Inputs changed.')`), true, 'uncalculated edits label the retained result');
  expectEqual(await estimateOut(), ['2.400 m³', '2.520 m³', '13', '1 h 18 min'], 'editing does not recalculate');
  await setEstimate({ length: '6.000000000' });
  expectEqual(await evaluate(`document.querySelector('[data-estimate-result-state]').textContent`), 'Result for the values currently shown in Inputs.', 'equivalent trailing zeros restore current status');
  expectEqual({ shown: await evaluate(`document.querySelector('[data-panel="estimate"]').checkVisibility()`), title: await evaluate(`document.querySelector('[data-section-title]').textContent`),
    current: await evaluate(`document.querySelector('[data-section-button="estimate"]').getAttribute('aria-current')`), project: await evaluate(`document.querySelector('[data-project-field]').checkVisibility()`),
    badge: await evaluate(`document.querySelector('[data-panel="estimate"] .sim-badge').textContent`), out: await estimateOut() },
    { shown: true, title: 'Concrete estimate', current: 'true', project: false, badge: 'Academic calculation', out: ['2.400 m³', '2.520 m³', '13', '1 h 18 min'] }, 'hash entry with the worked example');
  expectEqual(await evaluate(`(() => { const t = document.querySelector('[data-panel="estimate"]').textContent; return [/not AI/, /Civil Engineering review is still pending/, /including a final partial batch, takes the same cycle time/, /pending Civil Engineering review/, /Cement bags/].every((r) => r.test(t)) && !/cement bags? (needed|required)|\\bbags of cement\\b.*\\d/i.test(t); })()`), true, 'assumption and limits stated; no cement-bag figure');
  // Invalid values: error summary focused, fields marked, nothing recalculated.
  await setEstimate({ length: 'abc', batchOutput: '5', wastePercent: '' });
  expectEqual(await evaluate(`document.querySelector('[data-estimate-result-state]').textContent.startsWith('Inputs are incomplete or invalid.')`), true, 'invalid edits label retained results before submission');
  await click('[data-estimate-form] button[type="submit"]');
  expectEqual({ focus: await evaluate(`document.activeElement === document.querySelector('[data-estimate-errors]')`), invalid: await evaluate(`[...document.querySelectorAll('[aria-invalid="true"]')].map((e) => e.dataset.estimateInput)`),
    described: await evaluate(`document.querySelector('[data-estimate-input="length"]').getAttribute('aria-describedby').includes('estimate-length-error')`), out: await estimateOut(),
    links: await evaluate(`document.querySelectorAll('[data-estimate-error-list] a').length`) },
    { focus: true, invalid: ['length', 'batchOutput'], described: true, out: ['2.400 m³', '2.520 m³', '13', '1 h 18 min'], links: 2 }, 'invalid input');
  await click('[data-estimate-error-list] a');
  expectEqual(await evaluate(`document.querySelector('[data-estimate-result-state]').textContent.includes('last valid calculation')`), true, 'failed submission keeps an explicit retained-result warning');
  expectEqual(await evaluate(`document.activeElement === document.querySelector('[data-estimate-input="length"]')`), true, 'summary link focuses its field');
  // Valid custom values (empty waste = none).
  await setEstimate({ length: '12.5', width: '0.6', depth: '0.75', wastePercent: '', batchOutput: '0.35', cycleMinutes: '4' });
  await click('[data-estimate-form] button[type="submit"]');
  expectEqual({ out: await estimateOut(), errors: await evaluate(`document.querySelector('[data-estimate-errors]').hidden && !document.querySelector('[aria-invalid]')`),
    steps: await evaluate<string>(`document.querySelector('[data-estimate-steps]').textContent`).then((t) => t.includes('Volume = L × W × D = 12.5 × 0.6 × 0.75 = 5.625 m³') && t.includes('rounded up = 17; the last batch is 0.025 m³') && t.includes('17 batches × 4 min = 68 min')),
    status: await evaluate<string>(`document.querySelector('[data-demo-status]').textContent`).then((t) => t.startsWith('Estimate: 5.625 m³')),
    sketch: await evaluate(`document.querySelector('[data-label="length"]').textContent + ' / ' + document.querySelector('[data-estimate-scale]').textContent`) },
    { out: ['5.625 m³', '5.625 m³', '17', '1 h 8 min'], errors: true, steps: true, status: true, sketch: 'L = 12.5 m / Drawn to scale.' }, 'custom values');
  // Reopening keeps the last calculation and says so without claiming example values.
  await click('[data-section-button="overview"]');
  await click('[data-section-button="estimate"]');
  expectEqual({ out: await estimateOut(), status: await evaluate(`document.querySelector('[data-demo-status]').textContent`) },
    { out: ['5.625 m³', '5.625 m³', '17', '1 h 8 min'], status: 'Showing Concrete estimate, an academic calculation. Result for the values currently shown in Inputs.' }, 'reopened with the last calculation');
  await setEstimate({ length: '13' });
  await click('[data-section-button="overview"]');
  await click('[data-section-button="estimate"]');
  expectEqual(await evaluate(`document.querySelector('[data-demo-status]').textContent.includes('Inputs changed.')`), true, 'reopening announces retained results with changed inputs');
  // Precision: a genuine tiny remainder adds a batch and is never shown as zero; operands keep their precision; more than six decimals is refused.
  await setEstimate({ length: '1.000001', width: '1', depth: '0.2', wastePercent: '', batchOutput: '0.2', cycleMinutes: '1.25' });
  await click('[data-estimate-form] button[type="submit"]');
  expectEqual({ out: await estimateOut(), steps: await evaluate(`[...document.querySelectorAll('[data-estimate-steps] li')].map((li) => li.textContent)`) },
    { out: ['≈ 0.200 m³', '≈ 0.200 m³', '2', '≈ 3 min'], steps: [
      'Volume = L × W × D = 1.000001 × 1 × 0.2 = 0.2000002 m³',
      'With waste = 0.2000002 × (1 + 0 ÷ 100) = 0.2000002 m³',
      'Batches = 0.2000002 ÷ 0.2, rounded up = 2; the last batch is 0.0000002 m³',
      'Time = 2 batches × 1.25 min = 2.5 min'] }, 'tiny remainder');
  await setEstimate({ length: '1.0000001' });
  await click('[data-estimate-form] button[type="submit"]');
  expectEqual(await evaluate(`document.querySelector('[data-estimate-error="length"]').textContent`), 'Use at most 6 decimal places.', 'seven decimals refused');
  await click('[data-estimate-example]');
  expectEqual(await estimateOut(), ['2.400 m³', '2.520 m³', '13', '1 h 18 min'], 'example restored');
  // Reset restores the example too, returns to Overview, and the tracking figures never changed.
  await setEstimate({ length: '20' });
  await click('[data-estimate-form] button[type="submit"]');
  await click('[data-reset]');
  expectEqual({ section: await evaluate(`document.querySelector('[data-section-title]').textContent`), values: await evaluate(`document.querySelector('[data-estimate-input="length"]').value`), out: await estimateOut(),
    status: await evaluate<string>(`document.querySelector('[data-demo-status]').textContent`).then((t) => /the concrete estimate is back at its example values/.test(t)) },
    { section: 'Overview', values: '6', out: ['2.400 m³', '2.520 m³', '13', '1 h 18 min'], status: true }, 'Reset');
  expectEqual([await overviewFigures(), await evaluate<string>(`[...document.querySelectorAll('[data-panel="overview"]')].map((e) => e.innerHTML.length).join()`)], [before, tracking], 'tracking figures unchanged');
  // Without JavaScript the example result is shown and the fields are read-only.
  await openDemo('#demo-panel-estimate', { js: false });
  expectEqual(await evaluate(`({ out: [...document.querySelectorAll('[data-estimate-out]')].map((e) => e.textContent.trim()), disabled: [...document.querySelectorAll('[data-estimate-input]')].every((i) => i.disabled), note: document.querySelector('.estimate-nojs').checkVisibility() })`),
    { out: ['2.400 m³', '2.520 m³', '13', '1 h 18 min'], disabled: true, note: true }, 'no JavaScript');
});

await scenario('payment demo page: a clearly simulated walkthrough under the shared header, with a persistent notice, no payment fields, every outcome simulated, the sandbox not connected, and Start again', async () => {
  await send('Page.navigate', { url: 'about:blank' });
  await sleep(150);
  await open('/payment-demo/', { width: 1440, height: 900 });
  const visibleStep = () => evaluate<string>(`[...document.querySelectorAll('[data-pay-step]')].filter((s) => !s.hidden).map((s) => s.dataset.payStep).join()`);
  const notice = () => evaluate<boolean>(`(() => { const n = document.querySelector('.pay-notice'); return !!n && n.checkVisibility() && /^Academic payment demonstration — no real charge\\./.test(n.textContent.trim()); })()`);
  expectEqual({ header: await evaluate(`!!document.querySelector('[data-site-header] #site-nav') && !!document.querySelector('footer.site-footer')`), h1: await evaluate(`[...document.querySelectorAll('h1')].map((h) => h.textContent.trim())`),
    step: await visibleStep(), notice: await notice(),
    fictional: await evaluate(`/fictional/.test(document.querySelector('.pay-quote').textContent) && /illustrative only; nothing will be charged/.test(document.querySelector('.pay-quote').textContent)`),
    sandbox: await evaluate(`document.querySelector('[data-sandbox-status]').textContent.trim()`), sandboxLinks: await evaluate(`document.querySelectorAll('.pay-sandbox a').length`),
    demoHasPayment: false },
    { header: true, h1: ['How a quotation could be paid.'], step: 'quotation', notice: true, fictional: true, sandbox: 'Provider sandbox not connected.', sandboxLinks: 0, demoHasPayment: false }, 'start');
  expectEqual(await evaluate(`(() => { const pay = document.querySelector('[data-pay]');
    return { inputs: pay.querySelectorAll('input, select, textarea').length, forms: document.querySelectorAll('main form').length, media: pay.querySelectorAll('img, canvas, svg:not([aria-hidden="true"])').length,
      words: /\\b(card number|cvv|cvc|expiry|account number|account name|routing|iban|swift|qr ?code|upload|receipt number|reference number for your transfer)\\b/i.test(pay.textContent) }; })()`),
    { inputs: 0, forms: 0, media: 0, words: false }, 'no payment fields, forms, codes, uploads or banking details');
  const step = async (selector: string, expected: string, heading: string) => {
    await click(selector);
    expectEqual({ step: await visibleStep(), focus: await evaluate(`document.activeElement.id`), notice: await notice() }, { step: expected, focus: heading, notice: true }, `${selector} → ${expected}`);
  };
  for (const [method, label] of [['card', 'Card (simulated)'], ['bank', 'Bank transfer (simulated)']] as const) {
    for (const outcome of ['success', 'failure', 'cancelled'] as const) {
      await step('[data-pay-action="accept"]', 'method', 'pay-method-heading');
      await step(`[data-method="${method}"]`, 'confirm', 'pay-confirm-heading');
      expectEqual(await evaluate(`document.querySelector('[data-pay-method]').textContent`), label, `${method}: method shown`);
      await step(`[data-outcome="${outcome}"]`, 'result', 'pay-result-heading');
      const result = await evaluate<{ title: string; text: string; status: string }>(`({ title: document.querySelector('[data-pay-result-title]').textContent, text: document.querySelector('[data-pay-result-text]').textContent + ' ' + document.querySelector('.pay-record').textContent, status: document.querySelector('[data-pay-status]').textContent })`);
      if (!(/^Simulated /.test(result.title) && /No money moved/.test(result.text) && /Not a payment record/.test(result.text) && /^Simulated .*No money moved\.$/.test(result.status)) || /\bverified (the|this) payment\b|payment (is|was) (verified|confirmed)/i.test(result.text))
        throw new Error(`${method} ${outcome}: ${JSON.stringify(result)}`);
      await step('[data-pay-step="result"] [data-pay-action="restart"]', 'quotation', 'pay-quotation-heading');
    }
  }
  // Back, Start over, decline and Start again; a reload also restarts.
  await step('[data-pay-action="accept"]', 'method', 'pay-method-heading');
  await step('[data-method="card"]', 'confirm', 'pay-confirm-heading');
  await step('[data-pay-action="back"]', 'method', 'pay-method-heading');
  await step('[data-pay-step="method"] [data-pay-action="restart"]', 'quotation', 'pay-quotation-heading');
  await step('[data-pay-action="decline"]', 'declined', 'pay-declined-heading');
  await step('[data-pay-step="declined"] [data-pay-action="restart"]', 'quotation', 'pay-quotation-heading');
  await step('[data-pay-action="accept"]', 'method', 'pay-method-heading');
  await open('/payment-demo/', { width: 1440, height: 900 });
  expectEqual(await visibleStep(), 'quotation', 'reload restarts');
  // Keyboard: Enter on the focused action moves on, and each step's heading receives focus.
  await evaluate(`document.querySelector('[data-pay-action="accept"]').focus()`);
  await press('Enter');
  expectEqual({ step: await visibleStep(), focus: await evaluate(`document.activeElement.id`) }, { step: 'method', focus: 'pay-method-heading' }, 'keyboard');
  await press('Tab');
  expectEqual(await evaluate(`document.activeElement.dataset.method`), 'card', 'Tab continues to the first choice');
  // Without JavaScript: the quotation, the notice and the not-connected sandbox, with a note.
  await open('/payment-demo/', { width: 1440, height: 900, js: false });
  expectEqual(await evaluate(`({ quote: document.querySelector('[data-pay-step="quotation"]').checkVisibility(), note: document.querySelector('.pay-nojs').checkVisibility(), notice: document.querySelector('.pay-notice').checkVisibility(),
      buttons: [...document.querySelectorAll('[data-pay-action]')].filter((b) => b.checkVisibility()).length, sandbox: document.querySelector('[data-sandbox-status]').checkVisibility() })`),
    { quote: true, note: true, notice: true, buttons: 0, sandbox: true }, 'no JavaScript');
  // The Product Demo no longer contains it.
  await open('/product-demo/', { width: 1440, height: 900 });
  expectEqual(await evaluate(`({ panel: !!document.querySelector('[data-panel="payment"]'), button: !!document.querySelector('[data-section-button="payment"]') })`), { panel: false, button: false }, 'not in the Product Demo');
});

await scenario('pricing: "Try the payment demo" opens /payment-demo/ while Avail and quotation links still open inquiries; the sitemap lists the eight public pages', async () => {
  await open('/pricing/', { width: 1440, height: 900 });
  const links = await evaluate<{ demo: string[]; avail: string[]; quote: string[] }>(`({
    demo: [...document.querySelectorAll('main a')].filter((a) => /Try the payment demo/.test(a.textContent)).map((a) => a.getAttribute('href')),
    avail: [...document.querySelectorAll('main a')].filter((a) => /^Avail/.test(a.textContent.trim())).map((a) => a.getAttribute('href')),
    quote: [...document.querySelectorAll('main a')].filter((a) => /Quotation/i.test(a.textContent)).map((a) => a.getAttribute('href')) })`);
  expectEqual(links.demo, ['/payment-demo/'], 'payment demo link');
  if (!links.avail.length || !links.avail.every((h) => h.startsWith('/contact/?type=service'))) throw new Error(`Avail links: ${JSON.stringify(links.avail)}`);
  if (!links.quote.length || !links.quote.every((h) => h.startsWith('/contact/?type=quotation'))) throw new Error(`quotation links: ${JSON.stringify(links.quote)}`);
  const sitemap = await (await fetch(origin + '/sitemap-0.xml')).text();
  const paths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname).sort();
  expectEqual(paths, ['/', '/about/', '/contact/', '/how-it-works/', '/payment-demo/', '/pricing/', '/product-demo/', '/solutions/'], 'sitemap pages (no 404)');
  expectEqual((await fetch(origin + '/payment-demo/')).status, 200, '/payment-demo/ served');
});

await scenario('demo: keyboard section/project/filter controls, coherent chart rows, bounded scans, reset and reload remain functional', async () => {
  await open('/product-demo/', {width:1440,height:900});
  const rows = () => evaluate<string[]>(`[...document.querySelectorAll('[data-rows="inventory"] tr')].filter(r=>r.checkVisibility()).map(r=>r.dataset.id)`);
  await evaluate(`document.querySelector('[data-section-button="inventory"]').focus()`); await press('Enter');
  expectEqual(await evaluate(`document.querySelector('[data-panel="inventory"]').checkVisibility()`), true, 'Materials shown');
  expectEqual((await rows()).length, 18, 'all fixture materials');
  await evaluate(`document.querySelector('[data-project-select]').focus()`);
  for(const type of ['keyDown','keyUp']) await send('Input.dispatchKeyEvent',{type,key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40});
  await sleep(100);
  if ((await rows()).length >= 18 || !(await rows()).length) throw new Error('project selection did not filter materials');
  await evaluate(`document.querySelector('[data-filter="lowStockOnly"]').focus()`); await press(' ');
  const filtered = await rows();
  expectEqual(await evaluate(`document.querySelector('[data-filter="lowStockOnly"]').checked`), true, 'keyboard filter');
  const bars = await evaluate<string[]>(`[...document.querySelectorAll('[data-panel="inventory"] .bars [data-kind="material"]')].filter(r=>r.checkVisibility()).map(r=>r.dataset.id)`);
  expectEqual(bars, filtered, 'chart and table show the same records');
  await click('[data-reset]');
  await evaluate(`document.querySelector('[data-section-button="events"]').focus()`); await press('Enter');
  for(let i=0;i<6;i++) await click('[data-simulate]');
  expectEqual(await evaluate(`document.querySelector('[data-simulate]').getAttribute('aria-disabled')`), 'true', 'scan limit');
  expectEqual(await evaluate(`document.querySelector('[data-simulate-count]').textContent.startsWith('5 of 5')`), true, 'five scans only');
  expectEqual(await evaluate(`document.querySelector('.app-disclosure').checkVisibility() && /no live hardware/.test(document.querySelector('.app-disclosure').textContent)`), true, 'persistent disclosure');
  await click('[data-reset]');
  expectEqual(await evaluate(`document.querySelector('[data-project-select]').value`), 'all', 'reset project');
  await open('/product-demo/', {width:1440,height:900});
  expectEqual(await evaluate(`document.querySelector('[data-simulate-count]').textContent.startsWith('0 of 5')`), true, 'reload resets scans');
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
