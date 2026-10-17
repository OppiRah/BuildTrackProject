// Public BuildTrack Worker for the quotation workflow (docs/PROPOSAL_QUOTATION_WORKFLOW.md §3).
// Runs only for /api/* and /quote/* (run_worker_first in wrangler.workflow.jsonc); every other
// request is served by the static-asset layer before this script, exactly as the assets-only site.
// Contains no owner functions, email key or link secret. Its scheduled handler deletes
// rate-limit counters after 48 hours and daily totals after 8 days.

import { log } from '../../src/lib/quotation/log.ts';
import { json } from './http.ts';
import { handleIntake, type IntakeEnv } from './intake.ts';
import { handleQuote } from './quote.ts';
import { limits, purgeExpired } from './store.ts';

/** Cleanup statements per scheduled run (each deletes at most limits.purgeBatch rows). */
const PURGE_ROUNDS = 10;

/** Deletes expired counters and daily totals in bounded rounds; returns the number deleted. */
export async function runCleanup(env: IntakeEnv, now = Date.now()): Promise<number> {
  if (!env.DB) return 0;
  let total = 0;
  for (let round = 0; round < PURGE_ROUNDS; round++) {
    const deleted = await purgeExpired(env.DB, now);
    total += deleted;
    if (deleted < limits.purgeBatch) break;
  }
  return total;
}

export interface PublicEnv extends IntakeEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

const QUOTE_API = /^\/api\/quote\/(view|accept|decline|simulate)$/;

/** CSP for the /quote/ shell: same-origin only, plus the exact hashes of the page's own inline scripts. */
async function shellPolicy(html: string): Promise<string> {
  const hashes: string[] = [];
  for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    if (!match[1]) continue; // external scripts (src=) are covered by 'self'
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(match[1]));
    hashes.push(`'sha256-${btoa(String.fromCharCode(...new Uint8Array(digest)))}'`);
  }
  return [
    "default-src 'self'",
    `script-src 'self' ${hashes.join(' ')}`.trim(),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join('; ');
}

/**
 * The /quote/ shell (§4): the static page holds no data, but its responses are private and
 * uncached, unindexed, unframeable, send no referrer, and may load nothing from other origins.
 * Referrer-Policy no-referrer follows the plan; the page's same-origin fetch POSTs were checked to
 * keep their real Origin under it (tests/worker/quotation-e2e.ts), unlike native form posts.
 */
async function quoteShell(request: Request, env: PublicEnv): Promise<Response> {
  const asset = await env.ASSETS.fetch(request);
  const headers = new Headers(asset.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('X-Robots-Tag', 'noindex');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.delete('ETag');
  if (!(headers.get('Content-Type') ?? '').startsWith('text/html')) return new Response(asset.body, { status: asset.status, headers });
  const html = await asset.text();
  headers.set('Content-Security-Policy', await shellPolicy(html));
  return new Response(html, { status: asset.status, headers });
}

export default {
  async fetch(request: Request, env: PublicEnv): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/quotation-requests') return handleIntake(request, env);
    const quote = QUOTE_API.exec(pathname);
    if (quote) return handleQuote(request, env, quote[1] as 'view' | 'accept' | 'decline' | 'simulate');
    if (pathname.startsWith('/api/')) {
      log('intake_rejected', { route: 'unknown', status: 404 });
      return json(404, { error: 'not_found' });
    }
    if (pathname === '/quote' || pathname.startsWith('/quote/')) return quoteShell(request, env);
    return env.ASSETS.fetch(request);
  },

  async scheduled(_controller: unknown, env: PublicEnv): Promise<void> {
    try {
      log('counters_purged', { deleted: await runCleanup(env) });
    } catch {
      log('error', { code: 'E_PURGE' });
    }
  },
};
