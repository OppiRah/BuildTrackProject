// Quotation request intake: parsing, normalization, size limits and server-side validation
// of the body posted to /api/quotation-requests (docs/PROPOSAL_QUOTATION_WORKFLOW.md §6, §18).
// Pure: no I/O.
//
// Body contract (both encodings): a flat set of uniquely named string fields, limited to the
// quotation form's fields plus `_gotcha` (honeypot) and, for JSON only, a required
// `submission_id`. JSON must be one object whose values are all strings; repeated keys are
// rejected (JSON.parse would silently keep the last one). Values may not contain control
// characters other than tab, line feed and carriage return, or unpaired surrogates.
// Line breaks are normalized to LF before any length check, so a textarea's CRLF line breaks
// count once, as the browser's maxlength counts them. Form-encoded bodies are decoded strictly:
// malformed percent escapes, raw non-ASCII bytes and percent-decoded bytes that are not valid
// UTF-8 reject the whole body (URLSearchParams would silently keep or replace them).
// The privacy acknowledgment must be exactly "yes" (validateIntake).

import { customerSegments } from '../../config/business.ts';
import { fieldLimits, otherOrganizationType } from '../../config/inquiry.ts';
import { plans } from '../../config/pricing.ts';
import { services } from '../../config/services.ts';
import { inquiryFields, validateField, validateInquiry, type FieldErrors, type InquiryField, type InquiryValues } from '../inquiry-validate.ts';

export type IntakeSource = 'js' | 'native';

export interface ParsedIntake {
  /** Normalized (line breaks as LF) but not trimmed. */
  values: InquiryValues;
  /** Client-generated id that makes a retried JSON submission idempotent; null for native posts. */
  submissionId: string | null;
  /** True when the hidden honeypot field was filled in. */
  honeypot: boolean;
  /** The Turnstile widget token (Turnstile mode only), else null. */
  turnstileToken: string | null;
}

export type ParseResult = { ok: true; intake: ParsedIntake } | { ok: false };

const HONEYPOT = '_gotcha';
/** Longest honeypot value accepted as a well-formed body (bots get the same reply either way). */
export const HONEYPOT_MAX = 200;
const SUBMISSION_ID_LENGTH = 36;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
// C0 controls except tab (\x09), line feed (\x0A) and carriage return (\x0D), plus DEL.
const FORBIDDEN_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const fieldNames = new Set<string>(inquiryFields);

/** Maximum characters per field after line-break normalization (the form's maxlength or the longest allowed value). */
const longest = (values: readonly string[]) => Math.max(...values.map((value) => value.length));
export const fieldMaxChars: Record<InquiryField, number> = {
  request_type: 'quotation'.length,
  service: longest(services.map((item) => item.id)),
  plan: longest(plans.map((item) => item.id)),
  name: fieldLimits.name.max,
  email: fieldLimits.email.max,
  organization: fieldLimits.organization.max,
  phone: fieldLimits.phone.max,
  organization_type: longest([...customerSegments.map((item) => item.id), otherOrganizationType.id]),
  project_need: fieldLimits.project_need.max,
  message: fieldLimits.message.max,
  privacy_ack: 'yes'.length,
};

/**
 * Worst-case encoded bytes per allowed character:
 * - form-encoded: a 3-byte UTF-8 character percent-encodes to 9 bytes; a CRLF line break
 *   (one character after normalization) to 6 ("%0D%0A"); nothing allowed is longer.
 * - JSON: an encoder may escape every character as \uXXXX (6 bytes), and a CRLF line break
 *   as two such escapes (12 bytes for one character after normalization).
 */
const WORST_BYTES_PER_CHAR: Record<IntakeSource, number> = { native: 9, js: 12 };
/** Room for insignificant JSON whitespace from other encoders (pretty-printing). */
const JSON_WHITESPACE_ALLOWANCE = 1024;

/**
 * Largest body a valid submission can need, derived from the field limits above: every field
 * at its maximum length in the worst encoding, plus names, separators and quoting.
 */
export function maxBodyBytes(source: IntakeSource, turnstile = false): number {
  const fields: [string, number][] = [
    ...inquiryFields.map((field): [string, number] => [field, fieldMaxChars[field]]),
    [HONEYPOT, HONEYPOT_MAX],
    ...(source === 'js' ? [['submission_id', SUBMISSION_ID_LENGTH] as [string, number]] : []),
    // Turnstile mode (disabled by default): the widget token, at most 2048 characters.
    ...(source === 'js' && turnstile ? [[TURNSTILE_FIELD, MAX_TURNSTILE_TOKEN] as [string, number]] : []),
  ];
  const perChar = WORST_BYTES_PER_CHAR[source];
  if (source === 'native') {
    // name=value pairs joined by '&' (field names are plain ASCII and need no encoding).
    return fields.reduce((sum, [name, chars]) => sum + name.length + 1 + chars * perChar, 0) + fields.length - 1;
  }
  // {"name":"value",...}: two quotes around each name and value, a colon, a comma between pairs.
  return 2 + fields.reduce((sum, [name, chars]) => sum + name.length + 5 + chars * perChar, 0) + fields.length - 1 + JSON_WHITESPACE_ALLOWANCE;
}

/** A JSON string token starting at `start` (which must be a quote); returns its value and end index. */
function readJsonString(text: string, start: number): { value: string; end: number } | null {
  if (text[start] !== '"') return null;
  let index = start + 1;
  while (index < text.length) {
    const char = text[index];
    if (char === '\\') index += 2;
    else if (char === '"') {
      try {
        return { value: JSON.parse(text.slice(start, index + 1)) as string, end: index + 1 };
      } catch {
        return null;
      }
    } else index += 1;
  }
  return null;
}

const skipSpace = (text: string, index: number) => {
  while (index < text.length && ' \t\n\r'.includes(text[index]!)) index += 1;
  return index;
};

/** Parses exactly one JSON object whose values are all strings, keeping every key in order. */
/** Also used by the customer quotation API (worker/public/quote.ts). */
export function parseFlatJsonObject(text: string): [string, string][] | null {
  const entries: [string, string][] = [];
  let index = skipSpace(text, 0);
  if (text[index] !== '{') return null;
  index = skipSpace(text, index + 1);
  if (text[index] === '}') return skipSpace(text, index + 1) === text.length ? entries : null;
  for (;;) {
    const key = readJsonString(text, index);
    if (!key) return null;
    index = skipSpace(text, key.end);
    if (text[index] !== ':') return null;
    const value = readJsonString(text, skipSpace(text, index + 1));
    if (!value) return null;
    entries.push([key.value, value.value]);
    index = skipSpace(text, value.end);
    if (text[index] === ',') index = skipSpace(text, index + 1);
    else if (text[index] === '}') return skipSpace(text, index + 1) === text.length ? entries : null;
    else return null;
  }
}

/** JSON field carrying the Turnstile widget token, accepted only in Turnstile mode. */
export const TURNSTILE_FIELD = 'turnstile_token';
const MAX_TURNSTILE_TOKEN = 2048;

/** Builds the intake from string entries; anything outside the contract is rejected outright. */
function fromEntries(entries: [string, string][], source: IntakeSource, turnstile: boolean): ParseResult {
  const seen = new Set<string>();
  const values = Object.fromEntries(inquiryFields.map((field) => [field, ''])) as InquiryValues;
  let submissionId: string | null = null;
  let honeypot = false;
  let turnstileToken: string | null = null;

  for (const [key, raw] of entries) {
    if (seen.has(key) || FORBIDDEN_CONTROL.test(raw) || !raw.isWellFormed()) return { ok: false };
    seen.add(key);
    const value = raw.replace(/\r\n?/g, '\n');
    if (key === HONEYPOT) honeypot = value !== '';
    else if (key === TURNSTILE_FIELD && source === 'js' && turnstile) {
      if (value.length > MAX_TURNSTILE_TOKEN) return { ok: false };
      turnstileToken = value;
    }
    else if (key === 'submission_id' && source === 'js') {
      if (!UUID_V4.test(value)) return { ok: false };
      submissionId = value;
    } else if (key === 'request_type') {
      if (value !== 'quotation') return { ok: false };
    } else if (fieldNames.has(key)) values[key as InquiryField] = value;
    else return { ok: false };
  }
  if (source === 'js' && !submissionId) return { ok: false };
  values.request_type = 'quotation';
  return { ok: true, intake: { values, submissionId, honeypot, turnstileToken } };
}

// ignoreBOM keeps a leading U+FEFF, so it can never be stripped into a valid field name or value.
const strictUtf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/** Decodes one form-encoded name or value: '+' is a space, '%XX' a byte; null if malformed. */
function decodeFormComponent(text: string): string | null {
  const bytes: number[] = [];
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code === 0x2b) bytes.push(0x20);
    else if (code === 0x25) {
      const hex = text.slice(index + 1, index + 3);
      if (!/^[0-9A-Fa-f]{2}$/.test(hex)) return null;
      bytes.push(parseInt(hex, 16));
      index += 2;
    } else if (code < 0x80) bytes.push(code);
    else return null; // Browsers percent-encode every non-ASCII byte.
  }
  try {
    return strictUtf8.decode(new Uint8Array(bytes));
  } catch {
    return null;
  }
}

/** Strict application/x-www-form-urlencoded parsing; null if any pair is malformed. Also used by the owner Worker. */
export function parseFormEncoded(body: string): [string, string][] | null {
  const entries: [string, string][] = [];
  for (const pair of body.split('&')) {
    if (pair === '') continue;
    const separator = pair.indexOf('=');
    if (separator === -1) return null;
    const name = decodeFormComponent(pair.slice(0, separator));
    const value = decodeFormComponent(pair.slice(separator + 1));
    if (name === null || value === null) return null;
    entries.push([name, value]);
  }
  return entries;
}

/** Parses a JSON object body (the page script) or a form-encoded body (native, no JS). */
export function parseIntake(source: IntakeSource, body: string, options: { turnstile?: boolean } = {}): ParseResult {
  const turnstile = options.turnstile === true;
  if (source === 'native') {
    const entries = parseFormEncoded(body);
    return entries ? fromEntries(entries, source, turnstile) : { ok: false };
  }
  const entries = parseFlatJsonObject(body);
  return entries ? fromEntries(entries, source, turnstile) : { ok: false };
}

/**
 * Server-side validation: each field's untrimmed length must fit its limit (as the form's
 * maxlength enforces), then the Contact form's rules apply to the trimmed values. The privacy
 * acknowledgment must be exactly "yes" (the checkbox's value), not merely nonempty.
 */
export function validateIntake(values: InquiryValues): FieldErrors {
  const errors = validateInquiry(values);
  if (values.privacy_ack !== 'yes') errors.privacy_ack = validateField('privacy_ack', '');
  for (const field of inquiryFields) {
    if (!errors[field] && values[field].length > fieldMaxChars[field]) {
      // The shared rule's own "too long" message, produced from a value one character over the limit.
      errors[field] = validateField(field, 'x'.repeat(fieldMaxChars[field] + 1));
    }
  }
  return errors;
}

/** Values as stored: trimmed, with the fixed request type. */
export function normalizeIntake(values: InquiryValues): InquiryValues {
  const trimmed = { ...values };
  for (const field of inquiryFields) trimmed[field] = values[field].trim();
  return trimmed;
}

/** One unambiguous string of the stored values, for keyed hashing of the payload. */
export function canonicalPayload(values: InquiryValues): string {
  return JSON.stringify(inquiryFields.map((field) => values[field]));
}
