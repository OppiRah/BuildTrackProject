// Cloudflare Turnstile server-side validation for quotation intake (docs/PROPOSAL_QUOTATION_WORKFLOW.md
// §18, "Turnstile activation plan"). Prepared and DISABLED: the public Worker uses it only with
// TURNSTILE_ENABLED=on, and then fails closed without TURNSTILE_SECRET_KEY.
//
// Siteverify contract (Cloudflare docs, "Server-side validation", read 2026-10-17):
//   POST https://challenges.cloudflare.com/turnstile/v0/siteverify, form-encoded or JSON:
//   secret, response (the widget token, at most 2048 characters), optional remoteip and
//   idempotency_key (a UUID that makes a retried validation safe). Tokens are valid 300 seconds
//   and single-use; a replayed or expired token fails with "timeout-or-duplicate". The response has
//   success, challenge_ts, hostname, action, cdata and error-codes; the action and hostname are to
//   be checked against the expected values after success. "internal-error" may be retried.
// Here: one idempotency key per verification; the Worker repeats the SAME call (same key) once
// after a network error, timeout, 5xx or internal-error. That key is unrelated to the form's
// submission_id (a submission retried by the visitor needs a NEW widget token and a new key).

export const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
export const TURNSTILE_ACTION = 'quotation-request';
export const MAX_TOKEN_LENGTH = 2048;
const TIMEOUT_MS = 5000;

export type TurnstileCode =
  | 'E_TS_MISSING' // no token, or not a plausible token
  | 'E_TS_REJECTED' // Siteverify said the token is not valid
  | 'E_TS_EXPIRED_OR_REUSED' // timeout-or-duplicate: the visitor must complete the check again
  | 'E_TS_HOSTNAME' // solved on another hostname
  | 'E_TS_ACTION' // solved for another action
  | 'E_TS_UNAVAILABLE'; // Siteverify could not be reached or answered unusably (fail closed)

export type TurnstileResult = { ok: true } | { ok: false; code: TurnstileCode };

export interface TurnstileCheck {
  secret: string;
  token: string | null;
  remoteip: string | null;
  expectedHostname: string;
  fetcher?: typeof fetch;
  /** For tests; a fresh UUID per verification otherwise. */
  idempotencyKey?: string;
}

type Attempt = { kind: 'answer'; body: Record<string, unknown> } | { kind: 'retryable' };

async function call(check: TurnstileCheck, key: string): Promise<Attempt> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const form = new URLSearchParams({ secret: check.secret, response: check.token!, idempotency_key: key });
    if (check.remoteip) form.set('remoteip', check.remoteip);
    const response = await (check.fetcher ?? fetch)(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      signal: controller.signal,
    });
    if (response.status >= 500) return { kind: 'retryable' };
    const body = (await response.json()) as unknown;
    if (!body || typeof body !== 'object') return { kind: 'retryable' };
    const codes = (body as { 'error-codes'?: unknown })['error-codes'];
    if (Array.isArray(codes) && codes.includes('internal-error')) return { kind: 'retryable' };
    return { kind: 'answer', body: body as Record<string, unknown> };
  } catch {
    return { kind: 'retryable' };
  } finally {
    clearTimeout(timer);
  }
}

export async function verifyTurnstile(check: TurnstileCheck): Promise<TurnstileResult> {
  if (!check.token || check.token.length > MAX_TOKEN_LENGTH || /[\s]/.test(check.token)) return { ok: false, code: 'E_TS_MISSING' };
  const key = check.idempotencyKey ?? crypto.randomUUID();
  let attempt = await call(check, key);
  if (attempt.kind === 'retryable') attempt = await call(check, key); // the same call, same key
  if (attempt.kind === 'retryable') return { ok: false, code: 'E_TS_UNAVAILABLE' };
  const body = attempt.body;
  if (body.success !== true) {
    const codes = Array.isArray(body['error-codes']) ? (body['error-codes'] as unknown[]) : [];
    return { ok: false, code: codes.includes('timeout-or-duplicate') ? 'E_TS_EXPIRED_OR_REUSED' : 'E_TS_REJECTED' };
  }
  if (body.hostname !== check.expectedHostname) return { ok: false, code: 'E_TS_HOSTNAME' };
  if (body.action !== TURNSTILE_ACTION) return { ok: false, code: 'E_TS_ACTION' };
  return { ok: true };
}
