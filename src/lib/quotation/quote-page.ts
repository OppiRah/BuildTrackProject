// Pure helpers for the /quote/ page script (src/scripts/quote.ts). No DOM, no I/O.

import { checkoutMethods, checkoutOutcomes, LINK_TOKEN, type CheckoutMethod, type CheckoutOutcome, type QuoteView } from './customer.ts';
import { formatAmount } from './owner-form.ts';

/** The link token from a "#t=<token>" fragment, or null for anything else. */
export function tokenFromFragment(hash: string): string | null {
  const match = /^#t=([^&#]*)$/.exec(hash);
  return match && LINK_TOKEN.test(match[1]!) ? match[1]! : null;
}

/** Expiry as Philippine time, the business's time zone. */
export function formatExpiry(ms: number): string {
  return `${new Intl.DateTimeFormat('en-PH', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Manila' }).format(ms)} (Philippine time)`;
}

export function confirmText(view: QuoteView, decision: 'accept' | 'decline'): { question: string; button: string } {
  return decision === 'accept'
    ? {
        question: `Accept quotation ${view.reference} for ${formatAmount(view.amountCentavos)}? BuildTrack is an academic project; no payment is due.`,
        button: 'Yes, accept this quotation',
      }
    : {
        question: `Decline quotation ${view.reference}? BuildTrack will see that you declined it.`,
        button: 'Yes, decline this quotation',
      };
}

export function answerText(view: QuoteView): string | null {
  if (view.status === 'accepted') return 'You accepted this quotation. No payment is due: BuildTrack is an academic project.';
  if (view.status === 'declined') return 'You declined this quotation. Contact BuildTrack if you change your mind.';
  return null;
}

/**
 * After a network failure or server error the outcome is unknown: the request may have been
 * recorded before the answer was lost. "Check again" repeats the identical request, which the
 * server treats idempotently, so it never records anything twice.
 */
export function uncertainText(action: 'view' | 'accept' | 'decline' | 'simulate'): string {
  switch (action) {
    case 'view':
      return 'Your quotation could not be loaded. Check your connection, then select Check again.';
    case 'accept':
      return 'BuildTrack could not confirm whether your acceptance was recorded. It may have been. Select Check again to find out; this repeats the same answer and never records it twice.';
    case 'decline':
      return 'BuildTrack could not confirm whether your decline was recorded. It may have been. Select Check again to find out; this repeats the same answer and never records it twice.';
    case 'simulate':
      return 'BuildTrack could not confirm whether this simulated result was recorded. It may have been. Select Check again to find out; it will not be recorded twice.';
  }
}

// ---- Response classification (checkpoint 4 second review) ---------------------------------
// Only a response the page fully recognises counts as an answer. Anything unreadable, malformed
// or not matching the request (including an HTTP 200) leaves the outcome UNKNOWN: the page then
// keeps the exact request for "Check again" instead of assuming success or failure.

export type PageAction = 'view' | 'accept' | 'decline' | 'simulate';
export type Classified =
  | { kind: 'view'; view: QuoteView; message: string | null }
  | { kind: 'simulated'; view: QuoteView; outcome: CheckoutOutcome }
  | { kind: 'problem'; message: string }
  /** A refusal with its reason (e.g. rate limit, a stale version). Whether it settles anything: settles(). */
  | { kind: 'notice'; message: string; view: QuoteView | null; error: string }
  | { kind: 'uncertain' };

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const isInt = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value);

/** A complete quotation view, as the API sends it. */
export function isQuoteView(value: unknown): value is QuoteView {
  if (!isRecord(value)) return false;
  return (
    (value.status === 'open' || value.status === 'accepted' || value.status === 'declined') &&
    typeof value.reference === 'string' &&
    typeof value.requestReference === 'string' &&
    typeof value.firstName === 'string' &&
    typeof value.scope === 'string' &&
    isInt(value.amountCentavos) &&
    isInt(value.version) &&
    isInt(value.expiresAt) &&
    Array.isArray(value.simulations) &&
    value.simulations.every(
      (s) => isRecord(s) && checkoutMethods.includes(s.method as CheckoutMethod) && checkoutOutcomes.includes(s.outcome as CheckoutOutcome) && isInt(s.at),
    )
  );
}

const PROBLEMS = new Set(['invalid', 'expired', 'revoked', 'superseded']);
const REFUSALS = new Set(['decided', 'changed', 'not_accepted', 'limit', 'conflict', 'rate_limited', 'bad_request', 'forbidden', 'unsupported_media_type']);

/**
 * What a response means for the request that was sent. `shownReference` is the quotation on screen
 * when the request was made (null for the first view); an answer about another quotation is not trusted.
 */
export function classifyResponse(
  sent: { action: PageAction; fields: Record<string, string> },
  status: number,
  body: unknown,
  shownReference: string | null,
): Classified {
  if (!isRecord(body)) return { kind: 'uncertain' };
  const view = isQuoteView(body.view) && (shownReference === null || body.view.reference === shownReference) ? body.view : null;
  const message = typeof body.message === 'string' && body.message !== '' ? body.message : null;
  if (status === 200) {
    if (!view) return { kind: 'uncertain' };
    if (sent.action === 'view') return { kind: 'view', view, message: null };
    if (sent.action === 'accept' || sent.action === 'decline') {
      const expected = sent.action === 'accept' ? 'accepted' : 'declined';
      return view.status === expected && typeof body.repeated === 'boolean'
        ? { kind: 'view', view, message: sent.action === 'accept' ? 'Quotation accepted.' : 'Quotation declined.' }
        : { kind: 'uncertain' };
    }
    // simulate: the answer must be for exactly the method and outcome sent, on an accepted quotation.
    return body.simulated === true && body.method === sent.fields.method && body.outcome === sent.fields.outcome && view.status === 'accepted'
      ? { kind: 'simulated', view, outcome: body.outcome as CheckoutOutcome }
      : { kind: 'uncertain' };
  }
  if ((status === 404 || status === 410) && typeof body.error === 'string' && PROBLEMS.has(body.error) && message) return { kind: 'problem', message };
  if ((status === 409 || status === 429 || status === 400 || status === 403 || status === 415) && typeof body.error === 'string' && REFUSALS.has(body.error) && message) {
    return { kind: 'notice', message, view, error: body.error };
  }
  return { kind: 'uncertain' };
}

/**
 * Whether an answer settles the request's outcome (checkpoint 4 third review). A refusal of a
 * "Check again" (rate limit, a stale version, a link problem, an unknown error) says nothing about
 * whether the ORIGINAL action happened, so it settles nothing: the exact request and the lock stay.
 * Only a recognised result settles it, or, for a decision, the quotation already decided the other
 * way (then the original cannot have happened). For a first request, a refusal that can only come
 * before any write settles it as "not done"; refusals that can follow a write (a checkout answered
 * "changed" or "not accepted", or a conflict without a view) do not.
 */
export function settles(action: PageAction, answer: Classified, isRetry: boolean): boolean {
  if (answer.kind === 'view' || answer.kind === 'simulated') return true;
  if (answer.kind === 'uncertain') return false;
  // A link problem after a decision or checkout was sent says nothing about whether it was recorded.
  if (answer.kind === 'problem') return action === 'view';
  if (isRetry) return (action === 'accept' || action === 'decline') && answer.error === 'decided' && answer.view !== null;
  if (action === 'simulate') return answer.error !== 'changed' && answer.error !== 'not_accepted';
  if (action === 'accept' || action === 'decline') return answer.error !== 'changed' || answer.view !== null;
  return true;
}

const ACTION_NOUN: Record<PageAction, string> = { view: 'request', accept: 'acceptance', decline: 'decline', simulate: 'simulated result' };

/**
 * Shown with a link problem (revoked, expired, superseded, invalid) that arrived after a decision or
 * checkout was sent: the action may have been recorded just before the link stopped working.
 */
export function linkUncertainText(action: PageAction): string {
  return `Your ${ACTION_NOUN[action]} may or may not have been recorded before this link stopped working. Select Check again to repeat the same request; while this link is expired, withdrawn or replaced it may not be able to confirm the result. To find out for certain, contact BuildTrack using the phone number shown below.`;
}

/** For a refusal that leaves the outcome unknown: says this check was refused, not that the action failed. */
export function stillUnknownText(action: PageAction, reason: string, retryAfterSeconds: number | null): string {
  const wait = retryAfterSeconds ? ` You can check again in about ${Math.max(1, Math.round(retryAfterSeconds / 60))} minutes.` : '';
  return `This check could not be completed: ${reason} That does not mean your ${ACTION_NOUN[action]} was not recorded; whether it was is still unknown.${wait} Select Check again to find out.`;
}

// ---- Pending-action record (checkpoint 4 reload repair) -----------------------------------
// Before an accept, decline or checkout is sent, the page stores (sessionStorage, this tab only)
// exactly what it is about to send, so a reload can restore the same request, the lock and
// "Check again". Only the request fields are stored: token, displayed version and, for a checkout,
// method, outcome and attempt id. Never the demo code, financial details or quotation content.
// What comes back from storage is untrusted: parsePending accepts only a well-formed record for
// the current link and returns null for anything else.

export const PENDING_KEY = 'buildtrack-quote-pending';
export type PendingAction = 'accept' | 'decline' | 'simulate';
export interface Pending {
  action: PendingAction;
  fields: Record<string, string>;
}
const PENDING_FIELDS: Record<PendingAction, string[]> = {
  accept: ['token', 'version'],
  decline: ['token', 'version'],
  simulate: ['token', 'version', 'method', 'outcome', 'attempt_id'],
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function serializePending(pending: Pending): string {
  return JSON.stringify({ v: 1, action: pending.action, fields: pending.fields });
}

/** The stored pending action for exactly this link, or null if absent, malformed or for another link. */
export function parsePending(raw: string | null, token: string | null): Pending | null {
  if (!raw || !token || raw.length > 1000) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value) || value.v !== 1 || !isRecord(value.fields)) return null;
  const action = value.action as PendingAction;
  const expected = Object.prototype.hasOwnProperty.call(PENDING_FIELDS, action) ? PENDING_FIELDS[action] : undefined;
  if (!expected) return null;
  const fields = value.fields;
  const names = Object.keys(fields);
  if (names.length !== expected.length || !expected.every((name) => typeof fields[name] === 'string')) return null;
  const f = fields as Record<string, string>;
  if (f.token !== token || !LINK_TOKEN.test(f.token) || !/^[1-9]\d{0,8}$/.test(f.version!)) return null;
  if (action === 'simulate') {
    if (!checkoutMethods.includes(f.method as CheckoutMethod) || !checkoutOutcomes.includes(f.outcome as CheckoutOutcome) || !UUID.test(f.attempt_id!)) return null;
  }
  return { action, fields: Object.fromEntries(expected.map((name) => [name, f[name]!])) };
}

/** Shown when a reload finds an unresolved action from before it. */
export const restoredText = (action: PendingAction) =>
  `Before this page was reloaded, your ${ACTION_NOUN[action]} was sent but not confirmed. Whether it was recorded is still unknown. Select Check again to repeat the same request.`;

/** Shown when the record needed for recovery cannot be kept; nothing is sent then. */
export const storageNeededText =
  'Nothing was sent: this browser did not let the page keep the small note it needs to recover your answer if the connection drops. Allow this site to store data for this tab, or contact BuildTrack using the phone number on this page.';
