import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('wrangler.jsonc (Cloudflare Workers static assets)', () => {
  // JSONC: drop whole-line comments before parsing.
  const config = JSON.parse(
    read('wrangler.jsonc')
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n'),
  );

  it('serves the static build only: no Worker script, adapter entry or bindings', () => {
    expect(config.main).toBeUndefined();
    expect(config.assets.binding).toBeUndefined();
    expect(config.assets.run_worker_first).toBeUndefined();
    expect(config.assets.directory).toBe('./dist');
  });

  it('uses the custom 404 page and trailing-slash folder URLs', () => {
    expect(config.assets.not_found_handling).toBe('404-page');
    expect(config.assets.html_handling).toBe('auto-trailing-slash');
  });

  it('has a fixed Worker name and a compatibility date', () => {
    expect(config.name).toBe('buildtrack');
    expect(config.compatibility_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('public/_headers', () => {
  const rules = read('public/_headers')
    .split('\n')
    .filter((line) => line.trim() && !line.trim().startsWith('#'))
    .reduce<Record<string, string[]>>((acc, line, index, lines) => {
      if (!/^\s/.test(line)) acc[line.trim()] = [];
      else {
        const pattern = [...lines.slice(0, index)].reverse().find((l) => !/^\s/.test(l))!.trim();
        acc[pattern]!.push(line.trim());
      }
      return acc;
    }, {});

  it('caches only content-hashed Astro build files for a long time', () => {
    expect(rules['/_astro/*']).toContain('Cache-Control: public, max-age=31536000, immutable');
    const longCache = Object.entries(rules).filter(([, headers]) => headers.some((h) => /^Cache-Control:.*max-age=[1-9]/i.test(h)));
    expect(longCache.map(([pattern]) => pattern)).toEqual(['/_astro/*']);
  });

  it('keeps the origin in the Referer for Formspree and sets basic security headers', () => {
    expect(rules['/*']).toEqual(
      expect.arrayContaining([
        'Referrer-Policy: strict-origin-when-cross-origin',
        'X-Content-Type-Options: nosniff',
        'X-Frame-Options: DENY',
      ]),
    );
  });
});

describe('404 page', () => {
  it('is excluded from indexing and gets no canonical URL', () => {
    expect(read('src/pages/404.astro')).toMatch(/<BaseLayout[^>]*\bnoindex\b/);
    const layout = read('src/layouts/BaseLayout.astro');
    expect(layout).toContain('{noindex && <meta name="robots" content="noindex" />}');
    expect(layout).toMatch(/const canonical = Astro\.site && !noindex/);
  });
});
