// TEST-ONLY Cloudflare Access stand-in: an RS256 key pair generated in memory for each run, and
// JWTs signed with it. Nothing here is used by Worker code; the deployed owner entry only trusts
// the team domain's published keys (src/lib/quotation/access-jwt.ts).

export const TEST_TEAM = 'buildtrack-test.cloudflareaccess.com';
export const TEST_AUD = 'test-aud-0123456789abcdef';
export const TEST_OWNER = 'owner@example.test';

const base64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const encodeJson = (value: unknown) => base64Url(new TextEncoder().encode(JSON.stringify(value)));

export interface TestAccess {
  kid: string;
  publicJwk: JsonWebKey & { kid: string };
  /** Signs a token; claims override the defaults (owner email, team issuer, AUD, 10-minute expiry). */
  sign(claims?: Record<string, unknown>, header?: Record<string, unknown>): Promise<string>;
}

export async function createTestAccess(kid = `test-${crypto.randomUUID()}`): Promise<TestAccess> {
  const pair = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const exported = await crypto.subtle.exportKey('jwk', pair.publicKey);
  return {
    kid,
    publicJwk: { kty: 'RSA', n: exported.n, e: exported.e, alg: 'RS256', kid },
    async sign(claims = {}, header = {}) {
      const now = Math.floor(Date.now() / 1000);
      const head = encodeJson({ alg: 'RS256', kid, typ: 'JWT', ...header });
      const body = encodeJson({ aud: [TEST_AUD], email: TEST_OWNER, iss: `https://${TEST_TEAM}`, iat: now, nbf: now, exp: now + 600, ...claims });
      const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(`${head}.${body}`)));
      return `${head}.${body}.${base64Url(signature)}`;
    },
  };
}
