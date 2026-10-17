// Disabled-build preservation: `npm run check:published-build`.
//
// Builds the PUBLISHED source (git commit PUBLISHED below, exported with `git archive` into a temporary
// folder) and the current working tree with its committed configuration (quotation workflow off),
// each into its project's own dist/ (Astro resolves packages from there), and compares every file:
// - images, video and fonts byte for byte;
// - text files (HTML, CSS, JS, SVG, XML, TXT, _headers...) after removing carriage returns. This
//   Windows checkout stores text with CRLF line endings (core.autocrlf), which `public/` files keep
//   when copied, while Git and Workers Builds (Linux) use LF; the comparison must not report those.
// Prints every difference (missing, extra or changed files) and exits 1 if there is any.
// The published source uses this repository's node_modules through a directory link (the
// dependencies are identical); nothing is installed. This repository's dist/ (generated, ignored by
// Git) is rebuilt with the committed configuration, exactly as `npm run build` does.

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmdirSync, rmSync, statSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLISHED = '8263494165b4f568c7a1734c59e56a99f708bf00';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const work = mkdtempSync(join(tmpdir(), 'bt-published-'));
const publishedDir = join(work, 'published');
const link = join(publishedDir, 'node_modules');
const TEXT = /\.(html|css|js|mjs|txt|xml|svg|json|map|webmanifest)$|(^|\/)_headers$|(^|\/)_redirects$/;

function files(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const path = join(d, name);
      if (statSync(path).isDirectory()) walk(path);
      else out.push(relative(dir, path).replaceAll('\\', '/'));
    }
  };
  walk(dir);
  return out.sort();
}
const digest = (path: string, text: boolean) => {
  const bytes = readFileSync(path);
  return createHash('sha256')
    .update(text ? Buffer.from(bytes.toString('latin1').replace(/\r/g, ''), 'latin1') : bytes)
    .digest('hex');
};
/** `astro build` in a project; returns its dist/. */
function build(projectRoot: string): string {
  const result = spawnSync(process.execPath, [join(root, 'node_modules', 'astro', 'bin', 'astro.mjs'), 'build'], { cwd: projectRoot, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`build failed in ${projectRoot}:\n${result.stdout}\n${result.stderr}`);
  return join(projectRoot, 'dist');
}

let failed = true;
try {
  // The published source, exactly as committed.
  execFileSync('git', ['-C', root, 'cat-file', '-e', `${PUBLISHED}^{commit}`]);
  execFileSync('git', ['-C', root, 'archive', '--format=tar', '-o', join(work, 'published.tar'), PUBLISHED]);
  mkdirSync(publishedDir);
  // Relative paths: GNU tar (Git for Windows) would read a drive letter as a remote host.
  execFileSync('tar', ['-x', '-f', 'published.tar', '-C', 'published'], { cwd: work });
  symlinkSync(join(root, 'node_modules'), link, 'junction');

  const publishedOut = build(publishedDir);
  const currentOut = build(root);
  const a = files(publishedOut);
  const b = files(currentOut);
  const missing = a.filter((f) => !b.includes(f));
  const extra = b.filter((f) => !a.includes(f));
  const changed = a.filter((f) => b.includes(f) && digest(join(publishedOut, f), TEXT.test(f)) !== digest(join(currentOut, f), TEXT.test(f)));
  for (const f of missing) console.log(`MISSING  ${f}`);
  for (const f of extra) console.log(`EXTRA    ${f}`);
  for (const f of changed) console.log(`CHANGED  ${f}`);
  const text = a.filter((f) => TEXT.test(f)).length;
  console.log(
    `\nPublished ${PUBLISHED.slice(0, 7)}: ${a.length} files; current (committed config): ${b.length} files; ` +
      `${a.length - text} binary compared byte for byte, ${text} text compared without carriage returns.`,
  );
  failed = missing.length + extra.length + changed.length > 0;
  console.log(failed ? 'The workflow-off build DIFFERS from the published site.' : 'The workflow-off build is identical to the published site.');
} finally {
  // Remove the directory link itself first, so cleanup can never reach the real node_modules.
  if (existsSync(link) && lstatSync(link).isSymbolicLink()) rmdirSync(link);
  if (!existsSync(link)) rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  else console.error(`Left ${work} in place: its node_modules link could not be removed safely.`);
}
process.exit(failed ? 1 : 0);
