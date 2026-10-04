// Inquiry submission: provider response classification, the POST itself and
// allowlisted labels for the subject line and confirmation (docs/ARCHITECTURE.md §6.4).
// No DOM access; `fetch` is injectable so every outcome is unit-testable.
//
// Formspree contract (help.formspree.io and the official @formspree/core source,
// `isServerErrorResponse` / `isServerSuccessResponse`, re-read 2026-10-04):
// POST FormData with `Accept: application/json`. Errors are
// `{ "errors": [{ "field"?, "code"?, "message" }] }` or `{ "error": "..." }` and are
// checked first; success is an object whose `next` is a string; anything else is an
// "Unexpected response format". The rate limit returns 429. `next` is never followed.

import { requestTypes } from '../config/inquiry.ts';
import { planLabel, plans } from '../config/pricing.ts';
import { services } from '../config/services.ts';
import { isInquiryField, type FieldErrors } from './inquiry-validate.ts';

export type SubmitOutcome =
  | { kind: 'accepted' }
  /** The provider rejected specific values (field errors are the provider's own messages). */
  | { kind: 'rejected'; fieldErrors: FieldErrors; formErrors: string[] }
  | { kind: 'rate-limited' }
  /** A provider or server error response. */
  | { kind: 'provider'; status: number; formErrors: string[] }
  /** A 2xx whose body is not the recognised success shape: it may or may not have been accepted. */
  | { kind: 'unconfirmed' }
  | { kind: 'network' }
  /** No complete response within the time limit (before headers or while reading the body). */
  | { kind: 'timeout' };

export type FailedOutcome = Exclude<SubmitOutcome, { kind: 'accepted' }>;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const MAX_PROVIDER_MESSAGE = 300;
const cleanMessage = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim().slice(0, MAX_PROVIDER_MESSAGE) : undefined;

/** Maps an HTTP status and parsed JSON body (null if none) to an outcome. */
export function classifyResponse(status: number, body: unknown): SubmitOutcome {
  if (status === 429) return { kind: 'rate-limited' };

  const errorList = isObject(body) && Array.isArray(body.errors) ? body.errors : [];
  const fieldErrors: FieldErrors = {};
  const formErrors: string[] = [];
  for (const entry of errorList) {
    if (!isObject(entry)) continue;
    const message = cleanMessage(entry.message);
    if (!message) continue;
    if (typeof entry.field === 'string' && isInquiryField(entry.field)) fieldErrors[entry.field] ??= message;
    else formErrors.push(message);
  }
  const single = isObject(body) ? cleanMessage(body.error) : undefined;
  if (single) formErrors.push(single);
  const isOk = status >= 200 && status < 300;
  const isClientError = status >= 400 && status < 500;

  // Provider errors take precedence over any success-looking fields, as in @formspree/core.
  if (isObject(body) && ('errors' in body || 'error' in body)) {
    if ((isOk || isClientError) && Object.keys(fieldErrors).length > 0) return { kind: 'rejected', fieldErrors, formErrors };
    return { kind: 'provider', status, formErrors };
  }
  if (isOk) return isObject(body) && typeof body.next === 'string' ? { kind: 'accepted' } : { kind: 'unconfirmed' };
  return { kind: 'provider', status, formErrors };
}

export interface SendOptions {
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

/** POSTs the form data once; never throws. The time limit covers headers and body. */
export async function sendInquiry(endpoint: string, data: FormData, options: SendOptions): Promise<SubmitOutcome> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs);
  try {
    const response = await (options.fetchImpl ?? fetch)(endpoint, {
      method: 'POST',
      body: data,
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // An aborted body read is a timeout, whatever the status said.
      if (timedOut) return { kind: 'timeout' };
      // Otherwise a non-JSON or interrupted body: classified from the status alone.
    }
    return classifyResponse(response.status, body);
  } catch {
    return timedOut ? { kind: 'timeout' } : { kind: 'network' };
  } finally {
    clearTimeout(timer);
  }
}

export interface SelectionLabels {
  type: string;
  service: string;
  plan: string;
}

const NOT_SURE = 'Not sure yet';

/** Labels for the chosen ids, taken only from the allowlists (never from free text). */
export function selectionLabels(selection: { type: string; service: string; plan: string }): SelectionLabels {
  const plan = plans.find((item) => item.id === selection.plan);
  return {
    type: requestTypes.find((item) => item.id === selection.type)?.label ?? 'Request',
    service: services.find((item) => item.id === selection.service)?.name ?? NOT_SURE,
    plan: plan ? planLabel(plan) : NOT_SURE,
  };
}

/** Notification subject, e.g. "BuildTrack: Request a Quotation (Professional plan)". */
export function subjectLine(selection: { type: string; service: string; plan: string }): string {
  const labels = selectionLabels(selection);
  const plan = plans.find((item) => item.id === selection.plan);
  const details = [
    plan ? `${plan.name} plan` : '',
    labels.service !== NOT_SURE ? labels.service : '',
  ].filter(Boolean);
  return `BuildTrack: ${labels.type}${details.length ? ` (${details.join(', ')})` : ''}`;
}
