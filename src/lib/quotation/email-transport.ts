// Email transport for the owner Worker's job runner (docs/PROPOSAL_QUOTATION_WORKFLOW.md §7, §18).
// The runner depends only on `EmailTransport`; tests inject an in-memory mock. `resendTransport`
// follows Resend's documented Send Email API (read 2026-10-16; see §18, checkpoint 3):
//   POST https://api.resend.com/emails, `Authorization: Bearer <key>`, JSON body with from, to,
//   subject and text; optional `Idempotency-Key` (1-256 characters, kept 24 hours; a repeat with
//   the same payload returns the same response without sending again; a different payload gets
//   409 invalid_idempotent_request; a key still in progress gets 409 concurrent_idempotent_requests).
// Classification never trusts more than it knows: anything that might have been accepted
// (timeout, network error, 5xx, an unrecognised 2xx or 409) is "ambiguous" and retried with the
// same key and payload. Provider messages are never logged or stored; only fixed codes are.

export interface EmailMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
}

export type SendResult =
  /** The provider accepted the message (not proof of inbox delivery). */
  | { outcome: 'accepted'; messageId: string }
  /** The provider may or may not have accepted it: retry with the same key and payload. */
  | { outcome: 'ambiguous'; code: `E_${string}` }
  /** Definitely not accepted, temporarily: retry later. */
  | { outcome: 'rate_limited'; code: `E_${string}`; retryAfterMs: number | null }
  /** Definitely not accepted, and retrying the same request cannot succeed. */
  | { outcome: 'rejected'; code: `E_${string}` };

export interface EmailTransport {
  send(message: EmailMessage, idempotencyKey: string, signal: AbortSignal): Promise<SendResult>;
}

export const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const MAX_RETRY_AFTER_S = 3600;

/** Maps a Resend HTTP response to a SendResult. `body` is the parsed JSON body, or null. */
export function classifyResend(status: number, body: unknown, retryAfter: string | null): SendResult {
  const fields = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  // UNVERIFIED ASSUMPTION: the error reference read lists error types but shows no JSON field
  // names. The type is looked for in `name`, then `type`; without either, the status alone decides
  // (an unrecognised 409 is then treated as ambiguous, the safe side).
  const name = typeof fields.name === 'string' ? fields.name : typeof fields.type === 'string' ? fields.type : '';
  if (status >= 200 && status < 300) {
    const id = fields.id;
    return typeof id === 'string' && id.length > 0 && id.length <= 200 ? { outcome: 'accepted', messageId: id } : { outcome: 'ambiguous', code: 'E_ACCEPTED_NO_ID' };
  }
  if (status === 409) {
    if (name === 'invalid_idempotent_request') return { outcome: 'rejected', code: 'E_IDEMPOTENCY_CONFLICT' };
    if (name === 'concurrent_idempotent_requests') return { outcome: 'ambiguous', code: 'E_IDEMPOTENCY_IN_PROGRESS' };
    return { outcome: 'ambiguous', code: 'E_PROVIDER_409' };
  }
  if (status === 429) {
    const seconds = retryAfter && /^\d{1,6}$/.test(retryAfter.trim()) ? Math.min(Number(retryAfter.trim()), MAX_RETRY_AFTER_S) : null;
    const code = name === 'daily_quota_exceeded' ? 'E_QUOTA_DAILY' : name === 'monthly_quota_exceeded' ? 'E_QUOTA_MONTHLY' : 'E_RATE_LIMITED';
    return { outcome: 'rate_limited', code, retryAfterMs: seconds === null ? null : seconds * 1000 };
  }
  if (status >= 500) return { outcome: 'ambiguous', code: 'E_PROVIDER_5XX' };
  if (status >= 400) return { outcome: 'rejected', code: `E_REJECTED_${status}` };
  return { outcome: 'ambiguous', code: 'E_PROVIDER_UNEXPECTED' };
}

/** The real provider. Only the deployable owner entry constructs it, and only when fully configured. */
export function resendTransport(apiKey: string, fetcher: typeof fetch = fetch): EmailTransport {
  return {
    async send(message, idempotencyKey, signal) {
      let response: Response;
      try {
        response = await fetcher(RESEND_ENDPOINT, {
          method: 'POST',
          signal,
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
          body: JSON.stringify({ from: message.from, to: [message.to], subject: message.subject, text: message.text }),
        });
      } catch {
        return { outcome: 'ambiguous', code: signal.aborted ? 'E_TIMEOUT' : 'E_NETWORK' };
      }
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        // A 2xx whose body cannot be read stays ambiguous (classifyResend sees no id).
        if (signal.aborted) return { outcome: 'ambiguous', code: 'E_TIMEOUT' };
      }
      return classifyResend(response.status, body, response.headers.get('retry-after'));
    },
  };
}
