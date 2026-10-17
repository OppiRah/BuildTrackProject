// POST /api/quotation-requests: stores a quotation request and queues the owner notification
// (docs/PROPOSAL_QUOTATION_WORKFLOW.md §6, §16, §18). Accepts the page script's JSON and the
// native (no-JS) form post. Fails closed: without WORKFLOW_ENABLED=on, PUBLIC_ORIGIN, the D1
// binding and a valid INTAKE_HMAC_KEY it answers 503 and touches nothing. Never echoes
// submitted values and never logs anything but fixed codes.
//
// Order of work, so refused requests cost little and retries use no quota:
//   checks without database access (origin, media type, size, shape, honeypot, validation,
//   client identity) -> earlier identical request? (one indexed read) -> read-only quota
//   pre-check (client limits first, then the daily cap; three primary-key reads, no writes) ->
//   one batch that reserves quota, stores the request and queues its notification atomically
//   (store.ts). Measured D1 costs per outcome: PROPOSAL_QUOTATION_WORKFLOW.md §18.

import { contact } from '../../src/config/business.ts';
import { quotationPrivacyNotice } from '../../src/config/quotation.ts';
import { readBody } from '../../src/lib/quotation/body.ts';
import { verifyTurnstile } from '../../src/lib/quotation/turnstile.ts';
import { clientIdentity } from '../../src/lib/quotation/client-identity.ts';
import type { D1Database } from '../../src/lib/quotation/d1.ts';
import { importIntakeKey, keyedHash } from '../../src/lib/quotation/intake-keys.ts';
import {
  canonicalPayload,
  maxBodyBytes,
  normalizeIntake,
  parseIntake,
  validateIntake,
  type IntakeSource,
} from '../../src/lib/quotation/intake.ts';
import { log } from '../../src/lib/quotation/log.ts';
import { inquiryFields } from '../../src/lib/inquiry-validate.ts';
import { escapeHtml, json, page } from './http.ts';
import { findPrevious, readQuota, storeRequest, type PreviousRequest } from './store.ts';

export interface IntakeEnv {
  DB?: D1Database;
  WORKFLOW_ENABLED?: string;
  /** Exact origin of the public site, e.g. "https://buildtrack.sunnydelacruz.workers.dev". */
  PUBLIC_ORIGIN?: string;
  /** Wrangler secret: 32+ random bytes, base64 (intake-keys.ts). */
  INTAKE_HMAC_KEY?: string;
  INTAKE_HMAC_KEY_VERSION?: string;
  /** "on" turns on the Turnstile challenge (prepared, OFF): JSON intake then needs a valid token,
   * and no-JS posts are refused with phone guidance. Fails closed without the secret. */
  TURNSTILE_ENABLED?: string;
  /** Secret: the Turnstile widget's secret key (never in client code). */
  TURNSTILE_SECRET_KEY?: string;
  /** "resend" queues an owner notification email per request (automatic mode, retained but not the
   * release mode). Anything else, including unset, is manual email mode: no email job is created. */
  EMAIL_MODE?: string;
}

/** Test-only injection (code parameter; no request or environment value can set it). */
export interface IntakeDeps {
  turnstileFetch?: typeof fetch;
}

const route = 'quotation-requests' as const;
const formPath = '/contact/quotation/';

const callHtml = contact.phone
  ? `call BuildTrack at ${contact.phoneHref ? `<a href="${escapeHtml(contact.phoneHref)}">${escapeHtml(contact.phone)}</a>` : escapeHtml(contact.phone)}`
  : '';
const backToForm = `<p>Open the <a href="${formPath}">quotation request form</a> to try again${callHtml ? `, or ${callHtml}` : ''}.</p>`;

/** Visitor-facing explanations; JSON responses carry the same text for the page script. */
const messages = {
  needsJavaScript: `BuildTrack's quotation form uses a security check that needs JavaScript, so this request could not be checked and was not accepted. Nothing was stored. Turn on JavaScript and send the form again${contact.phone ? `, or call BuildTrack at ${contact.phone}` : ''}.`,
  challengeFailed: 'The security check was not completed or has expired, so the request was not accepted. Nothing was stored. Complete the check again, then send your request.',
  challengeUnavailable: "BuildTrack couldn't run its security check right now, so the request was not accepted. Nothing was stored. Please try again in a few minutes.",
  unavailable: 'Quotation requests are not available right now. Nothing was sent or stored.',
  origin:
    'This request did not come from the BuildTrack quotation form, so it was not accepted. Nothing was stored. If you used the form, your browser may be withholding the information BuildTrack checks (some strict privacy settings or extensions do this); try again from the form in another browser.',
  tooLarge: 'This request is larger than any request the form can send, so it was not accepted. Nothing was stored. Shorten your message and try again.',
  shape: 'This request was not in the format the form sends, so it was not accepted. Nothing was stored.',
  unidentified: "BuildTrack couldn't check this request's connection details, so it was not accepted. Nothing was stored. Please try again later.",
  capacity: 'BuildTrack has received the most quotation requests it can take today. Nothing was stored. Please try again tomorrow.',
  rateLimited: 'Too many requests have come from this connection recently. Nothing new was stored. Please try again in an hour.',
  conflict:
    'This submission was already received with different details, so the changed details were not stored. Reload the form and send your request again.',
  /** A retry hashed under an earlier intake key version: the details may be identical, so do not claim they changed. */
  retryExpired:
    "BuildTrack can no longer match this retry to your earlier attempt, because its request checks were updated in between. Nothing new was stored. Reload the form and send your request again; if your first attempt did arrive, BuildTrack may receive it twice.",
} as const;

const nativePages = {
  refused: (status: number, title: string, message: string) =>
    page(status, title, `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>${backToForm}`),
  invalid: (list: string[]) =>
    page(
      400,
      'Please fix the following',
      `<h1>Please fix the following</h1><ul>${list.map((message) => `<li>${escapeHtml(message)}</li>`).join('')}</ul>
<p>Use your browser's Back button to return to the form; your entries are usually kept. Or open the <a href="${formPath}">quotation request form</a> again.</p>`,
    ),
  received: (reference: string | null) =>
    page(
      200,
      'Quotation request received',
      `<h1>Quotation request received</h1>
${reference ? `<p>Your reference is <span class="ref">${escapeHtml(reference)}</span>.</p>` : ''}
<p>Your request is stored, and BuildTrack will review it. If BuildTrack approves a quotation, it sends you an email invitation with a private link to view it. Invitations are written and sent manually, so this can take some time.</p>
<p><strong>Submitting a request creates no payment, booking or subscription.</strong></p>
<p><a href="/">Back to Home</a></p>`,
    ),
  // The reference is not repeated: an identical resubmission is recognized, but the page does not
  // reveal an earlier submission's reference.
  duplicate: () =>
    page(
      200,
      'Request already received',
      `<h1>This request was already received</h1>
<p>BuildTrack received exactly these details from this connection a few minutes ago, so nothing new was stored. Your reference was shown after your first submission${callHtml ? `; if you need it, ${callHtml}` : ''}.</p>
<p><a href="/">Back to Home</a></p>`,
    ),
};

const mediaType = (request: Request) => (request.headers.get('Content-Type') ?? '').split(';')[0]!.trim().toLowerCase();

/** The exact public origin, and same-origin fetch metadata when the browser sends it. */
function fromPublicSite(request: Request, publicOrigin: string): boolean {
  if (request.headers.get('Origin') !== publicOrigin) return false;
  const site = request.headers.get('Sec-Fetch-Site');
  return site === null || site === 'same-origin';
}

export async function handleIntake(request: Request, env: IntakeEnv, now = Date.now(), deps: IntakeDeps = {}): Promise<Response> {
  const type = mediaType(request);
  const source: IntakeSource | null =
    type === 'application/json' ? 'js' : type === 'application/x-www-form-urlencoded' ? 'native' : null;
  const asPage = source === 'native';
  const refuse = (status: number, error: string, title: string, message: string, extra: Record<string, string> = {}) =>
    asPage ? nativePages.refused(status, title, message) : json(status, { error, message }, extra);

  try {
    const key = await importIntakeKey(env.INTAKE_HMAC_KEY, env.INTAKE_HMAC_KEY_VERSION);
    const turnstile = env.TURNSTILE_ENABLED === 'on';
    // Turnstile on but no secret: refuse everything rather than accept unchallenged requests.
    if (env.WORKFLOW_ENABLED !== 'on' || !env.PUBLIC_ORIGIN || !env.DB || !key || (turnstile && !env.TURNSTILE_SECRET_KEY)) {
      log('unavailable', { route, status: 503 });
      return refuse(503, 'unavailable', 'Quotation requests unavailable', messages.unavailable);
    }
    const db = env.DB;
    if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' }, { Allow: 'POST' });
    if (!fromPublicSite(request, env.PUBLIC_ORIGIN)) {
      log('intake_rejected', { route, status: 403, code: 'E_ORIGIN' });
      return refuse(403, 'forbidden', 'Request not accepted', messages.origin);
    }
    if (!source) return json(415, { error: 'unsupported_media_type', message: messages.shape });

    if (turnstile && source === 'native') {
      // Challenge-gated mode: the security check needs JavaScript, so a no-JS post cannot be checked.
      // It is refused with guidance (phone), never accepted unchallenged. Nothing is read or stored.
      log('intake_rejected', { route, status: 400, code: 'E_TS_NO_JS', source });
      return nativePages.refused(400, 'This form needs JavaScript', messages.needsJavaScript);
    }
    const body = await readBody(request, maxBodyBytes(source, turnstile));
    if (!('text' in body)) {
      const status = body.tooLarge ? 413 : 400;
      log('intake_rejected', { route, status, code: body.tooLarge ? 'E_BODY_SIZE' : 'E_BODY_ENCODING', source });
      return body.tooLarge
        ? refuse(413, 'too_large', 'Request too large', messages.tooLarge)
        : refuse(400, 'bad_request', 'Request not accepted', messages.shape);
    }
    const parsed = parseIntake(source, body.text, { turnstile });
    if (!parsed.ok) {
      log('intake_rejected', { route, status: 400, code: 'E_BODY_SHAPE', source });
      return refuse(400, 'bad_request', 'Request not accepted', messages.shape);
    }
    if (parsed.intake.honeypot) {
      // Looks accepted to the sender; nothing is stored, counted or queued.
      log('intake_honeypot', { route, status: asPage ? 200 : 201, source });
      return asPage ? nativePages.received(null) : json(201, { status: 'received', reference: null });
    }

    const errors = validateIntake(parsed.intake.values);
    const errorList = inquiryFields.flatMap((field) => (errors[field] ? [errors[field]] : []));
    if (errorList.length > 0) {
      log('intake_rejected', { route, status: asPage ? 400 : 422, code: 'E_VALIDATION', source });
      return asPage ? nativePages.invalid(errorList) : json(422, { errors });
    }

    const identity = clientIdentity(request.headers.get('CF-Connecting-IP'));
    if (!identity) {
      log('intake_rejected', { route, status: 503, code: 'E_CLIENT_ID', source });
      return refuse(503, 'unidentified', 'Request not accepted', messages.unidentified);
    }

    if (turnstile) {
      // Before any database access (including the identical-retry lookup): unverified traffic never reaches D1.
      const verdict = await verifyTurnstile({
        secret: env.TURNSTILE_SECRET_KEY!,
        token: parsed.intake.turnstileToken,
        remoteip: request.headers.get('CF-Connecting-IP'),
        expectedHostname: new URL(env.PUBLIC_ORIGIN).hostname,
        fetcher: deps.turnstileFetch,
      });
      if (!verdict.ok) {
        const unavailable = verdict.code === 'E_TS_UNAVAILABLE';
        log('intake_rejected', { route, status: unavailable ? 503 : 400, code: verdict.code, source });
        return unavailable
          ? refuse(503, 'challenge_unavailable', 'Request not accepted', messages.challengeUnavailable)
          : refuse(400, 'challenge_failed', 'Request not accepted', messages.challengeFailed);
      }
    }

    const values = normalizeIntake(parsed.intake.values);
    const payload = canonicalPayload(values);
    const payloadHash = await keyedHash(key, 'quote-request-payload-v1', payload);
    // Not per day, so the same client's retry after midnight still matches (key rotation: see answerPrevious).
    const clientHash = await keyedHash(key, 'quote-request-client-v1', identity);
    const dedupeKey = source === 'native' ? await keyedHash(key, 'quote-request-native-dedupe-v1', identity, payload) : null;
    const { submissionId } = parsed.intake;

    /** Same submission id or key: identical payload -> earlier result; changed payload -> conflict. */
    const answerPrevious = (earlier: PreviousRequest, status: number) => {
      if (earlier.hashKeyVersion !== key.version) {
        log('intake_rejected', { route, status: 409, code: 'E_RETRY_KEY_VERSION', source });
        return refuse(409, 'retry_expired', 'Request not accepted', messages.retryExpired);
      }
      if (earlier.payloadHash !== payloadHash) {
        log('intake_rejected', { route, status: 409, code: 'E_SUBMISSION_CONFLICT', source });
        return refuse(409, 'submission_conflict', 'Request not accepted', messages.conflict);
      }
      log('intake_duplicate', { route, status, source });
      if (asPage) return nativePages.duplicate();
      // The reference is repeated only to the client that submitted the original request; anyone
      // else presenting the same submission id and details gets a reference-free acknowledgment.
      return json(status, { status: 'received', reference: earlier.clientHash === clientHash ? earlier.reference : null });
    };

    const earlier = await findPrevious(db, submissionId ? { submissionId } : { dedupeKey: dedupeKey!, now });
    if (earlier) return answerPrevious(earlier, 200);

    const rateLimited = () => {
      log('rate_limited', { route, status: 429, source });
      return refuse(429, 'rate_limited', 'Too many requests', messages.rateLimited, { 'Retry-After': '3600' });
    };
    const capReached = () => {
      log('intake_rejected', { route, status: 503, code: 'E_DAILY_CAP', source });
      return refuse(503, 'capacity', 'Request limit reached', messages.capacity);
    };

    const clientKey = await keyedHash(key, 'client-rate-v1', new Date(now).toISOString().slice(0, 10), identity);
    const quota = await readQuota(db, clientKey, now);
    if (quota === 'client-limited') return rateLimited();
    if (quota === 'daily-cap') return capReached();

    const stored = await storeRequest(db, {
      values,
      source,
      clientKey,
      clientHash,
      submissionId,
      dedupeKey,
      payloadHash,
      hashKeyVersion: key.version,
      privacyAckVersion: quotationPrivacyNotice.version,
      notifyOwner: env.EMAIL_MODE === 'resend',
      now,
    });
    if (stored.kind === 'client-limited') return rateLimited();
    if (stored.kind === 'daily-cap') return capReached();
    if (stored.kind === 'existing') return answerPrevious(stored.previous, 200);

    log('intake_received', { route, status: asPage ? 200 : 201, source });
    if (asPage) return nativePages.received(stored.reference);
    return json(201, { status: 'received', reference: stored.reference });
  } catch {
    log('error', { route, status: 500, code: 'E_INTAKE' });
    return asPage
      ? page(500, 'Something went wrong', `<h1>Something went wrong</h1><p>Your request may not have been stored.</p>${backToForm}`)
      : json(500, { error: 'server_error' });
  }
}
