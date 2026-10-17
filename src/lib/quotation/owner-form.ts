// Owner form tokens and quotation values (docs/PROPOSAL_QUOTATION_WORKFLOW.md §5, §16, §18).
//
// Form tokens: every owner form carries a token signed with OWNER_FORM_KEY (a dedicated Worker
// secret) that binds it to the owner, the action, the target (request or quote id) and the
// version the page showed, and expires after 10 minutes. Tokens are not stored when issued, so
// owner GET pages change nothing; the batch that performs the change records the token's hash in
// `used_form_tokens`, so each token works once. A forged, expired, replayed or mismatched token
// changes nothing.

export type OwnerAction = 'create' | 'save' | 'approve' | 'resend' | 'revoke' | 'replace' | 'dismiss' | 'delete' | 'mark_sent';

export const FORM_TOKEN_TTL_MS = 10 * 60 * 1000;
const MIN_KEY_BYTES = 32;
const LABEL = 'buildtrack.owner-form';
const encoder = new TextEncoder();

export interface FormTokenBinding {
  owner: string;
  action: OwnerAction;
  target: string;
  version: number;
}

const base64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Imports a base64 secret of at least 32 bytes as an HMAC-SHA-256 key; null if unusable. */
export async function importHmacKey(secret: string | undefined, usages: KeyUsage[] = ['sign', 'verify']): Promise<CryptoKey | null> {
  if (!secret) return null;
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = Uint8Array.from(atob(secret.trim()), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
  if (bytes.byteLength < MIN_KEY_BYTES) return null;
  return crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, usages);
}

const message = (binding: FormTokenBinding, nonce: string, expires: number) =>
  encoder.encode([LABEL, binding.owner, binding.action, binding.target, String(binding.version), nonce, String(expires)].join('\u0000'));

/** `<nonce>.<expires>.<mac>`: 32 random bytes, expiry time, HMAC over the binding. */
export async function issueFormToken(key: CryptoKey, binding: FormTokenBinding, now: number): Promise<string> {
  const nonce = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const expires = now + FORM_TOKEN_TTL_MS;
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, message(binding, nonce, expires)));
  return `${nonce}.${expires}.${base64Url(mac)}`;
}

/** The token's expiry when it is genuine, unexpired and bound to exactly this binding; otherwise null. */
export async function verifyFormToken(key: CryptoKey, token: string, binding: FormTokenBinding, now: number): Promise<number | null> {
  const match = /^([A-Za-z0-9_-]{43})\.(\d{13})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return null;
  const [, nonce, expiresText, macText] = match as unknown as [string, string, string, string];
  const expires = Number(expiresText);
  if (expires <= now || expires > now + FORM_TOKEN_TTL_MS) return null;
  const mac = Uint8Array.from(atob(macText.replace(/-/g, '+').replace(/_/g, '/') + '='), (char) => char.charCodeAt(0));
  return (await crypto.subtle.verify('HMAC', key, mac, message(binding, nonce, expires))) ? expires : null;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

// ---- Quotation values (§5) ---------------------------------------------------------------

export const quoteLimits = {
  scopeMin: 10,
  scopeMax: 2000,
  /** ₱1 to ₱10,000,000, in centavos. */
  amountMin: 100,
  amountMax: 1_000_000_000,
  validityMin: 1,
  validityMax: 30,
  validityDefault: 14,
};

export interface QuoteValues {
  scope: string;
  amountCentavos: number;
  validityDays: number;
}

export type QuoteField = 'scope' | 'amount' | 'validity_days';
export type QuoteErrors = Partial<Record<QuoteField, string>>;

// C0 controls except tab and line feed (carriage returns are normalized away first), plus DEL.
const FORBIDDEN_CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F]/;
/** Characters as SQLite's length() counts them (code points), so the schema's CHECK agrees. */
const characters = (text: string) => [...text].length;

/** "7990", "7,990" or "7,990.50" pesos to centavos; null if not in that form. */
export function parseAmount(text: string): number | null {
  const match = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  const pesos = Number(match[1]!.replace(/,/g, ''));
  const centavos = Number((match[2] ?? '').padEnd(2, '0'));
  const total = pesos * 100 + centavos;
  return Number.isSafeInteger(total) ? total : null;
}

/** ₱7,990.00 */
export function formatAmount(centavos: number): string {
  const pesos = Math.floor(centavos / 100).toLocaleString('en-US');
  return `₱${pesos}.${String(centavos % 100).padStart(2, '0')}`;
}

/** Validates the owner's draft form; values are trimmed and line breaks normalized to LF. */
export function validateQuote(input: { scope: string; amount: string; validity_days: string }): { values: QuoteValues } | { errors: QuoteErrors } {
  const errors: QuoteErrors = {};
  const scope = input.scope.replace(/\r\n?/g, '\n').trim();
  if (FORBIDDEN_CONTROL.test(scope) || !scope.isWellFormed()) errors.scope = 'Remove unsupported characters from the scope.';
  else if (characters(scope) < quoteLimits.scopeMin || characters(scope) > quoteLimits.scopeMax)
    errors.scope = `Describe the scope in ${quoteLimits.scopeMin} to ${quoteLimits.scopeMax} characters.`;
  const amount = parseAmount(input.amount);
  if (amount === null) errors.amount = 'Enter the amount in pesos, for example 7990 or 7,990.50.';
  else if (amount < quoteLimits.amountMin || amount > quoteLimits.amountMax) errors.amount = 'Enter an amount from ₱1 to ₱10,000,000.';
  const validity = /^\d{1,2}$/.test(input.validity_days.trim()) ? Number(input.validity_days.trim()) : NaN;
  if (!(validity >= quoteLimits.validityMin && validity <= quoteLimits.validityMax))
    errors.validity_days = `Enter a validity of ${quoteLimits.validityMin} to ${quoteLimits.validityMax} days.`;
  if (Object.keys(errors).length) return { errors };
  return { values: { scope, amountCentavos: amount!, validityDays: validity } };
}
