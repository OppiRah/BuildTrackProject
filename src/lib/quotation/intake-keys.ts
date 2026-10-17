// Keyed hashes for intake (docs/PROPOSAL_QUOTATION_WORKFLOW.md §18). The key is a dedicated
// Worker secret, INTAKE_HMAC_KEY (32+ random bytes, base64), never stored in D1 or the
// repository; INTAKE_HMAC_KEY_VERSION names it. Each use is domain-separated by a label.
//
// The resulting values (client counter keys, payload hashes, no-JS de-duplication keys) are
// pseudonymous personal data: whoever holds the key and the database can test guesses against
// them. They are kept only as long as their purpose needs (counters: 48 hours; request hashes:
// with the request) and never logged.
//
// Rotation: set a new secret and increment INTAKE_HMAC_KEY_VERSION. Rate-limit counters then
// restart under the new key, and a JSON retry whose stored hash used an older version is
// refused as a conflict (the visitor reloads and sends again). Nothing else depends on old keys.

const MIN_KEY_BYTES = 32;
const encoder = new TextEncoder();

export interface IntakeKey {
  key: CryptoKey;
  version: string;
}

const cache = new Map<string, Promise<IntakeKey | null>>();

/** Imports the configured key; null when missing, malformed or shorter than 32 bytes. */
export function importIntakeKey(secret: string | undefined, version: string | undefined): Promise<IntakeKey | null> {
  if (!secret || !version || !/^[1-9]\d{0,5}$/.test(version)) return Promise.resolve(null);
  const cacheKey = `${version}\u0000${secret}`;
  let pending = cache.get(cacheKey);
  if (!pending) {
    pending = (async () => {
      let bytes: Uint8Array<ArrayBuffer>;
      try {
        bytes = Uint8Array.from(atob(secret.trim()), (char) => char.charCodeAt(0));
      } catch {
        return null;
      }
      if (bytes.byteLength < MIN_KEY_BYTES) return null;
      const key = await crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      return { key, version };
    })();
    cache.set(cacheKey, pending);
  }
  return pending;
}

/** Hex HMAC-SHA-256 of the label and parts, joined by NUL (no part may contain NUL). */
export async function keyedHash(key: IntakeKey, label: string, ...parts: string[]): Promise<string> {
  if ([label, ...parts].some((part) => part.includes('\u0000'))) throw new Error('E_HASH_INPUT');
  const mac = await crypto.subtle.sign('HMAC', key.key, encoder.encode([label, ...parts].join('\u0000')));
  return [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
