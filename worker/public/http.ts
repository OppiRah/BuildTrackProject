// Response helpers for the public Worker. Every response is uncacheable, unframeable and
// unindexed; HTML pages are self-contained (inline styles only, no scripts, no external loads).

import { escapeHtml } from '../../src/lib/quotation/escape.ts';

const baseHeaders: Record<string, string> = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-Robots-Tag': 'noindex',
};

export function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...baseHeaders, 'Content-Type': 'application/json; charset=utf-8', ...extra },
  });
}

const PAGE_CSP = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

/** A minimal server-rendered page; `bodyHtml` must already be built from escaped values. */
export function page(status: number, title: string, bodyHtml: string): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} | BuildTrack</title>
<style>
  body { margin: 0; font: 1rem/1.6 system-ui, sans-serif; color: #14213d; background: #f5f7fa; }
  main { max-width: 40rem; margin: 0 auto; padding: 2rem 1rem 3rem; }
  h1 { font-size: 1.75rem; line-height: 1.2; }
  .ref { font-size: 1.25rem; font-weight: 700; }
  ul { padding-left: 1.25rem; }
  a { color: #0b4f9c; font-weight: 600; }
</style>
</head>
<body>
<main>
<p><a href="/">BuildTrack</a></p>
${bodyHtml}
</main>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: { ...baseHeaders, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': PAGE_CSP },
  });
}

export { escapeHtml };
