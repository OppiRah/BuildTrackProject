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
await scenario('layout switches keep content below in place: workflow and pricing links, pinned ↔ stacked and stage ↔ list, three runs each', async () => {
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
