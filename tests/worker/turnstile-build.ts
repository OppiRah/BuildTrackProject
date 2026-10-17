// Build check for the prepared (OFF) Turnstile mode: `node tests/worker/turnstile-build.ts`.
// 1. The committed build (dist/, from `npm run build`) contains no Turnstile markup or code.
// 2. A temporary build with tests/browser/fixtures/quotation-turnstile.ts renders the widget, its
//    script and the no-JS guidance on /contact/quotation/, and its page script sends the token.
// No browser and no network: the widget script is never loaded.

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'astro';
import { quoteRoute } from '../../src/integrations/quote-route.ts';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? files(join(dir, name)) : [join(dir, name)]));
const failures: string[] = [];
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures.push(label);
};

const dist = join(root, 'dist');
if (!existsSync(dist)) throw new Error('Run `npm run build` first.');
check(!files(dist).some((file) => /turnstile|challenges\.cloudflare/i.test(readFileSync(file, 'utf8'))), 'committed build: no Turnstile markup or code anywhere');

const work = mkdtempSync(join(tmpdir(), 'buildtrack-turnstile-'));
const normalize = (path: string) => path.split('?')[0]!.replaceAll('\\', '/').toLowerCase();
const fixture = join(root, 'tests', 'browser', 'fixtures', 'quotation-turnstile.ts');
const real = normalize(join(root, 'src', 'config', 'quotation.ts'));
try {
  await build({
    root,
    outDir: join(work, 'site'),
    logLevel: 'warn',
    integrations: [quoteRoute()], // the quotation pages are injected only into workflow-enabled builds
    vite: {
      plugins: [
        {
          name: 'turnstile-fixture',
          enforce: 'pre',
          async resolveId(this: any, source: string, importer: string | undefined, options: object) {
            if (!importer || normalize(importer) === normalize(fixture) || !/quotation(\.ts)?$/.test(source)) return null;
            const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
            return resolved && normalize(resolved.id) === real ? fixture : null;
          },
        },
      ],
    },
  });
  const page = readFileSync(join(work, 'site', 'contact', 'quotation', 'index.html'), 'utf8');
  check(page.includes('class="cf-turnstile"') && page.includes('data-sitekey="test-site-key-not-real"') && page.includes('data-action="quotation-request"'), 'enabled build: widget container with site key and action');
  check(page.includes('src="https://challenges.cloudflare.com/turnstile/v0/api.js"'), 'enabled build: the widget script is referenced (never loaded here)');
  check(/<noscript>[\s\S]*security check that needs JavaScript[\s\S]*call BuildTrack/.test(page), 'enabled build: no-JS guidance with the phone number');
  const scripts = files(join(work, 'site', '_astro')).filter((file) => file.endsWith('.js')).map((file) => readFileSync(file, 'utf8')).join('\n') + page;
  check(scripts.includes('turnstile_token') && scripts.includes('cf-turnstile-response'), 'enabled build: the page script sends the widget token');
  const contact = readFileSync(join(work, 'site', 'contact', 'index.html'), 'utf8');
  check(!contact.includes('cf-turnstile'), 'enabled build: the general Contact page has no widget');
} finally {
  rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
console.log(`\n${failures.length ? `${failures.length} failed` : 'all passed'}.`);
process.exit(failures.length ? 1 : 0);
