// Wrangler's own path resolution for the deployment templates: `npm run test:deploy:templates`
// (Codex consolidated review, finding 5). Nothing is provisioned or deployed.
//
// Wrangler resolves `main`, `assets.directory` and `migrations_dir` relative to the folder of the
// config file it is given, not the working directory. The templates in deploy/ use repository-root
// paths, and the runbook (docs/QUOTATION_RUNBOOK.md, "Where filled configs go") says filled copies
// are saved at the repository root under exact names. This check, for each template:
// 1. writes a filled copy (only the D1 placeholder replaced by a dummy id, as the owner would) at the
//    repository root under a temporary name, then runs the pinned Wrangler on it:
//    `deploy --dry-run --outdir <temp>` (bundles `main`, checks the assets folder; uploads nothing)
//    and `d1 migrations apply DB --local --persist-to <temp>` (a throwaway local database);
//    both must succeed, and every file in migrations/ must be applied;
// 2. negative control: the same copy saved inside deploy/ must fail both commands, because Wrangler
//    then looks for deploy/worker/..., deploy/dist and deploy/migrations. So the check depends on
//    Wrangler's real resolution, not on an assumption about the repository root.
// Temporary copies are deleted afterwards; an existing file is never overwritten.
//
// Requires `npm run build` first (dist/) and wrangler 4.147.0 in the npx cache (or WRANGLER_JS).
// Network: metrics are disabled and no Cloudflare credentials are passed; Wrangler's own update
// check (a version lookup) is not isolated by this script, as in the other tests/worker scripts.

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const WRANGLER_VERSION = '4.147.0';
const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));

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
if (!existsSync(join(root, 'dist', 'index.html'))) {
  console.error('dist/ is missing: run `npm run build` first (the public template serves it as assets).');
  process.exit(2);
}

const wranglerEnv: Record<string, string | undefined> = { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false', NO_UPDATE_NOTIFIER: '1' };
delete wranglerEnv.CLOUDFLARE_API_TOKEN;
delete wranglerEnv.CLOUDFLARE_ACCOUNT_ID;
const wrangler = (args: string[]) => {
  const result = spawnSync(process.execPath, [wranglerJs!, ...args], { env: wranglerEnv, encoding: 'utf8', cwd: root });
  return { ok: result.status === 0, output: `${result.stdout}\n${result.stderr}` };
};

const migrations = readdirSync(join(root, 'migrations')).filter((name) => name.endsWith('.sql')).sort();
const results: { name: string; ok: boolean; detail?: string }[] = [];
const temporary: string[] = [];

/** Writes `content` at `path`, never over an existing file; removed at the end. */
function place(path: string, content: string) {
  if (existsSync(path)) throw new Error(`refusing to overwrite ${path}`);
  writeFileSync(path, content);
  temporary.push(path);
}
/** A short folder (Miniflare's SQLite file names are long; Windows limits path length). */
const scratch = () => {
  const dir = mkdtempSync(join(tmpdir(), 'bt-'));
  temporary.push(dir);
  return dir;
};

try {
  for (const template of ['public', 'owner'] as const) {
    const filled = readFileSync(join(root, 'deploy', `${template}.wrangler.example.jsonc`), 'utf8').replace('<D1_DATABASE_ID>', '00000000-0000-4000-8000-0000000000aa');
    const suffix = crypto.randomUUID().slice(0, 8);
    const atRoot = join(root, `wrangler.template-check-${template}-${suffix}.jsonc`);
    const inDeploy = join(root, 'deploy', `template-check-${template}-${suffix}.jsonc`);
    place(atRoot, filled);
    place(inDeploy, filled);

    const out = scratch();
    const bundle = wrangler(['deploy', '--dry-run', '--outdir', out, '-c', atRoot]);
    results.push({
      name: `${template}: at the repository root, Wrangler bundles main${template === 'public' ? ' and accepts the assets folder' : ''} (dry run)`,
      ok: bundle.ok && existsSync(join(out, 'index.js')),
      detail: bundle.ok ? undefined : bundle.output.slice(-800),
    });
    const applied = wrangler(['d1', 'migrations', 'apply', 'DB', '--local', '--persist-to', scratch(), '-c', atRoot]);
    const missing = migrations.filter((name) => !applied.output.includes(name));
    results.push({
      name: `${template}: at the repository root, Wrangler finds migrations/ and applies all ${migrations.length} locally`,
      ok: applied.ok && missing.length === 0,
      detail: applied.ok ? (missing.length ? `not applied: ${missing.join(', ')}` : undefined) : applied.output.slice(-800),
    });

    const misplacedBundle = wrangler(['deploy', '--dry-run', '--outdir', scratch(), '-c', inDeploy]);
    const misplacedMigrations = wrangler(['d1', 'migrations', 'apply', 'DB', '--local', '--persist-to', scratch(), '-c', inDeploy]);
    const deployDir = join(root, 'deploy');
    results.push({
      name: `${template}: negative control — the same file inside deploy/ fails, resolved against deploy/`,
      ok: !misplacedBundle.ok && !misplacedMigrations.ok && misplacedMigrations.output.includes(join(deployDir, 'migrations')),
      detail: `dry run ${misplacedBundle.ok ? 'succeeded' : 'failed'}; migrations ${misplacedMigrations.ok ? 'succeeded' : 'failed'}`,
    });
  }
} catch (error) {
  results.push({ name: 'setup', ok: false, detail: error instanceof Error ? error.message : String(error) });
} finally {
  for (const path of temporary.reverse()) rmSync(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
}

for (const result of results) console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.name}${!result.ok && result.detail ? `\n      ${result.detail}` : ''}`);
const failed = results.filter((result) => !result.ok).length;
console.log(`\n${results.length - failed}/${results.length} template path checks passed.`);
process.exit(failed || results.length !== 6 ? 1 : 0);
