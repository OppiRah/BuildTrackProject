// Local owner/customer walkthrough of the quotation workflow: `npm run walkthrough:quotation`.
// For a person clicking through in their own browser; it asserts nothing (the automated version is
// `npm run test:worker:e2e`). Everything is local, synthetic and simulated:
// 1. Builds the complete website into a temporary folder with the quotation workflow enabled (the
//    test fixture tests/browser/fixtures/quotation-enabled.ts; the committed config stays off), the
//    /quote/ page, and the general Contact form WITHOUT an endpoint (inquiry-unconfigured.ts), so
//    nothing can reach Formspree. Home, Pricing and the other pages are the normal website; their
//    quotation buttons lead to the local workflow.
// 2. Applies migrations/ to a throwaway local D1 database in that folder.
// 3. Runs tests/worker/walkthrough-worker.ts under `wrangler dev --local`, bound to 127.0.0.1 only:
//    the real public, customer and owner handlers; mocked Access (a JWT signed by a key generated for
//    this run, valid 12 hours); MANUAL email mode (the release mode: BuildTrack sends no email; the owner
//    page prepares the invitation to copy); Turnstile off. No scheduled handler is exposed: the
//    launcher does not pass --test-scheduled, so no GET endpoint can trigger scheduled work.
// 4. Prints the URLs and waits. Ctrl+C stops the server and deletes the temporary folder.
// Nothing is deployed, emailed or sent to any provider. Tooling traffic: metrics are disabled and no
// Cloudflare credentials are passed; Wrangler's own version check is not isolated (as in test:worker).
//
// Requires wrangler 4.147.0 in the npx cache (or WRANGLER_JS). Port: WALKTHROUGH_PORT (default 8787).

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'astro';
import { quoteRoute } from '../../src/integrations/quote-route.ts';
import { createTestAccess, TEST_AUD, TEST_OWNER, TEST_TEAM } from '../support/access-jwt.ts';

const WRANGLER_VERSION = '4.147.0';
const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const posix = (path: string) => path.replaceAll('\\', '/');
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

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
const port = Number(process.env.WALKTHROUGH_PORT ?? 8787);
const portFree = await new Promise<boolean>((done) => {
  const probe = createServer();
  probe.once('error', () => done(false));
  probe.listen(port, '127.0.0.1', () => probe.close(() => done(true)));
});
if (!Number.isInteger(port) || port < 1024 || port > 65535 || !portFree) {
  console.error(`Port ${port} is not usable on 127.0.0.1; set WALKTHROUGH_PORT to a free port (1024–65535).`);
  process.exit(2);
}

const work = mkdtempSync(join(tmpdir(), 'buildtrack-walkthrough-'));
let dev: ChildProcess | undefined;
function cleanup() {
  if (dev?.pid && dev.exitCode === null) spawnSync('taskkill', ['/pid', String(dev.pid), '/T', '/F'], { stdio: 'ignore' });
  try {
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  } catch {
    console.warn(`Could not delete ${work}; it contains only synthetic walkthrough data.`);
  }
}

// ---- 1. Build with the workflow enabled (temporary folder; the committed config is untouched) ----
console.log('Building the site with the quotation workflow enabled (temporary folder)...');
const normalize = (path: string) => path.split('?')[0]!.replaceAll('\\', '/').toLowerCase();
const siteDir = join(work, 'site');
// Two config swaps, both test fixtures: the quotation workflow on, and the general Contact form with
// NO endpoint (the committed config holds the real Formspree endpoint; the presentation must never
// reach it, so that form shows "not yet connected").
const swaps = [
  { module: 'quotation', fixture: 'quotation-enabled.ts' },
  { module: 'inquiry', fixture: 'inquiry-unconfigured.ts' },
].map((s) => ({ ...s, real: normalize(join(root, 'src', 'config', `${s.module}.ts`)), path: join(root, 'tests', 'browser', 'fixtures', s.fixture), swapped: 0 }));
await build({
  root,
  outDir: siteDir,
  logLevel: 'warn',
  integrations: [quoteRoute()],
  vite: {
    plugins: [
      {
        name: 'buildtrack-walkthrough-config',
        enforce: 'pre',
        async resolveId(this: any, source: string, importer: string | undefined, options: object) {
          if (!importer || swaps.some((s) => normalize(importer) === normalize(s.path))) return null;
          const swap = swaps.find((s) => new RegExp(`${s.module}(\\.ts)?$`).test(source));
          if (!swap) return null;
          const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
          if (!resolved || normalize(resolved.id) !== swap.real) return null;
          swap.swapped++;
          return swap.path;
        },
      },
    ],
  },
});
const contactHtml = existsSync(join(siteDir, 'contact', 'index.html')) ? readFileSync(join(siteDir, 'contact', 'index.html'), 'utf8') : '';
if (
  swaps.some((s) => s.swapped === 0) ||
  !existsSync(join(siteDir, 'quote', 'index.html')) ||
  !existsSync(join(siteDir, 'contact', 'quotation', 'index.html')) ||
  /formspree/i.test(contactHtml)
) {
  cleanup();
  throw new Error('the presentation build is wrong: missing quotation pages, or a general-form endpoint is present');
}

// ---- 2. Config, keys and database ------------------------------------------------------------
const site = `http://127.0.0.1:${port}`;
const ownerSite = `http://localhost:${port}`;
const random32 = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
const access = await createTestAccess();
const configPath = join(work, 'wrangler.json');
const state = join(work, 'state');
writeFileSync(
  configPath,
  JSON.stringify({
    name: 'buildtrack-walkthrough',
    compatibility_date: '2026-10-04',
    main: posix(join(root, 'tests', 'worker', 'walkthrough-worker.ts')),
    assets: { directory: posix(siteDir), binding: 'ASSETS', not_found_handling: '404-page', html_handling: 'auto-trailing-slash', run_worker_first: true },
    d1_databases: [{ binding: 'DB', database_name: 'buildtrack-walkthrough', database_id: '00000000-0000-4000-8000-000000000004', migrations_dir: posix(join(root, 'migrations')) }],
    vars: {
      WORKFLOW_ENABLED: 'on',
      PUBLIC_ORIGIN: site,
      INTAKE_HMAC_KEY_VERSION: '1',
      INTAKE_HMAC_KEY: random32(),
      OWNER_ORIGIN: ownerSite,
      OWNER_EMAIL: TEST_OWNER,
      ACCESS_TEAM_DOMAIN: TEST_TEAM,
      ACCESS_AUD: TEST_AUD,
      OWNER_FORM_KEY: random32(),
      QUOTE_LINK_KEY_CURRENT: '1',
      QUOTE_LINK_KEY_V1: random32(),
      // The release mode: manual email. No mail-provider setting exists in this configuration.
      EMAIL_MODE: 'manual',
      TEST_ACCESS_JWKS: JSON.stringify({ keys: [access.publicJwk] }),
      WALKTHROUGH_ACCESS_JWT: await access.sign({ exp: Math.floor(Date.now() / 1000) + 12 * 3600 }),
    },
    observability: { enabled: true, logs: { invocation_logs: false } },
  }),
);
const wranglerEnv: Record<string, string | undefined> = { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false', NO_UPDATE_NOTIFIER: '1' };
delete wranglerEnv.CLOUDFLARE_API_TOKEN;
delete wranglerEnv.CLOUDFLARE_ACCOUNT_ID;
const migrated = spawnSync(process.execPath, [wranglerJs, 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', state, '-c', configPath], { env: wranglerEnv, encoding: 'utf8' });
if (migrated.status !== 0) {
  cleanup();
  throw new Error(`migrations failed:\n${migrated.stdout}\n${migrated.stderr}`);
}

// ---- 3. Serve on loopback only ---------------------------------------------------------------
dev = spawn(
  process.execPath,
  [wranglerJs, 'dev', '--local', '-c', configPath, '--ip', '127.0.0.1', '--port', String(port), '--persist-to', state, '--show-interactive-dev-session=false'],
  { env: wranglerEnv, stdio: ['ignore', 'pipe', 'pipe'] },
);
let devOutput = '';
dev.stdout?.on('data', (chunk) => (devOutput += chunk));
dev.stderr?.on('data', (chunk) => (devOutput += chunk));
let up = false;
for (let i = 0; i < 300 && !up; i++) {
  try {
    up = (await fetch(`${site}/`)).ok;
  } catch {
    await sleep(200);
  }
}
if (!up) {
  console.error(devOutput.slice(-2000));
  cleanup();
  process.exit(1);
}
process.on('SIGINT', () => {
  console.log('\nStopping and deleting the temporary walkthrough data...');
  cleanup();
  process.exit(0);
});

console.log(`
Local BuildTrack presentation is running (loopback only; synthetic data; manual email mode: nothing is sent).

  Presentation hub     ${site}/__walkthrough/
  Website Home         ${site}/
  Owner dashboard      ${ownerSite}/   (mocked sign-in as ${TEST_OWNER})

  After approval, the owner request page prepares the customer invitation: use "Copy quotation link"
  and paste it into the address bar to open the customer page (${site}/quote/#t=...).

Press Ctrl+C to stop; the temporary database and build are deleted.
`);
await new Promise(() => {}); // keep running until Ctrl+C
