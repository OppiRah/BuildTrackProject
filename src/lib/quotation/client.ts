// Quotation page submission: the JSON POST to the public Worker and classification of its
// responses into the Contact form's outcome states (inquiry-submit.ts), plus the reference.
// No DOM access; `fetch` is injectable so every outcome is unit-testable.

import type { FailedOutcome } from '../inquiry-submit.ts';
import { isInquiryField, type FieldErrors } from '../inquiry-validate.ts';

export type QuotationOutcome = FailedOutcome | { kind: 'accepted'; reference: string | null };

const REFERENCE = /^BT-R-\d{4}-\d{4,}$/;
const MAX_MESSAGE = 300;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Maps the Worker's status and parsed JSON body (null if none) to an outcome. */
export function classifyQuotationResponse(status: number, body: unknown): QuotationOutcome {
  if (status === 429) return { kind: 'rate-limited' };
  if (status === 200 || status === 201) {
    if (isObject(body) && body.status === 'received') {
      const reference = typeof body.reference === 'string' && REFERENCE.test(body.reference) ? body.reference : null;
      if (body.reference === null || reference) return { kind: 'accepted', reference };
    }
    return { kind: 'unconfirmed' };
  }
  if (status === 422 && isObject(body) && isObject(body.errors)) {
    const fieldErrors: FieldErrors = {};
    for (const [field, message] of Object.entries(body.errors)) {
      if (isInquiryField(field) && typeof message === 'string' && message.trim()) {
        fieldErrors[field] = message.trim().slice(0, MAX_MESSAGE);
      }
    }
    if (Object.keys(fieldErrors).length > 0) return { kind: 'rejected', fieldErrors, formErrors: [] };
  }
  if (status >= 200 && status < 300) return { kind: 'unconfirmed' };
  // Refusals carry a visitor-facing explanation (size, origin, capacity, conflict); shown as text.
  const message = isObject(body) && typeof body.message === 'string' ? body.message.trim().slice(0, MAX_MESSAGE) : '';
  return { kind: 'provider', status, formErrors: message ? [message] : [] };
}

export interface QuotationSendOptions {
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

/** POSTs the request once as JSON; never throws. The time limit covers headers and body. */
export async function sendQuotationRequest(
  endpoint: string,
  payload: Record<string, string>,
  options: QuotationSendOptions,
): Promise<QuotationOutcome> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs);
  try {
    const response = await (options.fetchImpl ?? fetch)(endpoint, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'omit',
      signal: controller.signal,
    });
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      if (timedOut) return { kind: 'timeout' };
    }
    return classifyQuotationResponse(response.status, body);
  } catch {
    return timedOut ? { kind: 'timeout' } : { kind: 'network' };
  } finally {
    clearTimeout(timer);
  }
}
