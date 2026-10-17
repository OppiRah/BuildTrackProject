// Customer quotation-link tokens (docs/PROPOSAL_QUOTATION_WORKFLOW.md §4). Owner Worker only:
// QUOTE_LINK_KEY_V<n> is a dedicated secret used for nothing else.
//
// token   = "v" + key_version + "." + base64url_nopad(HMAC-SHA-256(key, message))
// message = "buildtrack.quote-link" 0x00 key_version 0x00 quote_id 0x00 link_generation
// D1 stores only hex(SHA-256(token)). The same inputs always give the same token, so a later
// email attempt can rebuild the identical link; a new generation gives a new link.

import { importHmacKey, sha256Hex } from './owner-form.ts';

const LABEL = 'buildtrack.quote-link';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export interface LinkKey {
  key: CryptoKey;
  version: number;
}

/** The current link key from QUOTE_LINK_KEY_CURRENT and QUOTE_LINK_KEY_V<n>; null if missing or unusable. */
export async function currentLinkKey(env: Record<string, unknown>): Promise<LinkKey | null> {
  const current = env.QUOTE_LINK_KEY_CURRENT;
  if (typeof current !== 'string' || !/^[1-9]\d{0,5}$/.test(current)) return null;
  const secret = env[`QUOTE_LINK_KEY_V${current}`];
  const key = await importHmacKey(typeof secret === 'string' ? secret : undefined, ['sign']);
  return key ? { key, version: Number(current) } : null;
}

export async function quoteLinkToken(link: LinkKey, quoteId: string, generation: number): Promise<string> {
  if (!UUID.test(quoteId) || !Number.isSafeInteger(generation) || generation < 1) throw new Error('E_LINK_INPUT');
  const message = new TextEncoder().encode([LABEL, String(link.version), quoteId, String(generation)].join('\u0000'));
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', link.key, message));
  return `v${link.version}.${btoa(String.fromCharCode(...mac)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

export const tokenHash = sha256Hex;
