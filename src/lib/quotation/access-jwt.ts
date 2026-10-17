// Cloudflare Access JWT verification for the owner Worker (docs/PROPOSAL_QUOTATION_WORKFLOW.md
// §2.1, §16). Access already blocks unauthenticated traffic at the edge; the Worker checks the
// `Cf-Access-Jwt-Assertion` header again on every request (defence in depth):
// - RS256 signature, verified with WebCrypto against the team's published keys
//   (https://<team>.cloudflareaccess.com/cdn-cgi/access/certs);
// - issuer = https://<team domain>, audience includes the application's AUD tag;
// - not expired, not before its start time;
// - email equal to the one owner address.
// Anything else is refused. The key source is a parameter only so unit tests and the test-only
// wrapper (tests/worker/owner-test-worker.ts) can supply local keys; the deployed entry
// (worker/owner/index.ts) always uses `accessKeySource`, which fetches only from the team domain.

export interface AccessConfig {
  /** e.g. "buildtrack.cloudflareaccess.com" */
  teamDomain: string;
  /** The Access application's AUD tag. */
  audience: string;
  ownerEmail: string;
}

/** Returns the published key with this id, or null. */
export type AccessKeySource = (kid: string) => Promise<JsonWebKey | null>;

const TEAM_DOMAIN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$/;
const MAX_TOKEN_LENGTH = 8192;
/** Allowed clock difference for the not-before time, in seconds. */
const NBF_LEEWAY = 60;

export const validTeamDomain = (domain: string | undefined): domain is string => !!domain && TEAM_DOMAIN.test(domain);

function base64UrlBytes(part: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(part)) return null;
  try {
    const padded = part.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (part.length % 4)) % 4);
    return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

function base64UrlJson(part: string): Record<string, unknown> | null {
  const bytes = base64UrlBytes(part);
  if (!bytes) return null;
  try {
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The verified owner email, or null for anything that is not a valid owner token. */
export async function verifyAccessJwt(
  token: string | null,
  config: AccessConfig,
  keys: AccessKeySource,
  now = Date.now(),
): Promise<string | null> {
  if (!token || token.length > MAX_TOKEN_LENGTH || !validTeamDomain(config.teamDomain) || !config.audience || !config.ownerEmail) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
  const header = base64UrlJson(headerPart);
  const payload = base64UrlJson(payloadPart);
  const signature = base64UrlBytes(signaturePart);
  if (!header || !payload || !signature) return null;
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid) return null;

  const seconds = now / 1000;
  const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (payload.iss !== `https://${config.teamDomain}`) return null;
  if (!audience.includes(config.audience)) return null;
  if (typeof payload.exp !== 'number' || payload.exp <= seconds) return null;
  if (payload.nbf !== undefined && (typeof payload.nbf !== 'number' || payload.nbf > seconds + NBF_LEEWAY)) return null;
  if (typeof payload.email !== 'string' || payload.email.toLowerCase() !== config.ownerEmail.toLowerCase()) return null;

  const jwk = await keys(header.kid);
  if (!jwk || jwk.kty !== 'RSA') return null;
  try {
    const key = await crypto.subtle.importKey('jwk', { kty: 'RSA', n: jwk.n, e: jwk.e }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const signed = new TextEncoder().encode(`${headerPart}.${payloadPart}`);
    return (await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, signed)) ? payload.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

const CACHE_MS = 5 * 60 * 1000;
/** An unknown key id refetches the certs at most this often (Access rotates keys). */
const REFETCH_MS = 60 * 1000;
const certCache = new Map<string, { keys: JsonWebKey[]; fetchedAt: number }>();

/** The team's published signing keys, cached briefly per Worker instance. */
export function accessKeySource(teamDomain: string, fetcher: typeof fetch = fetch, now = () => Date.now()): AccessKeySource {
  return async (kid) => {
    if (!validTeamDomain(teamDomain)) return null;
    const find = (keys: JsonWebKey[]) => keys.find((key) => (key as JsonWebKey & { kid?: string }).kid === kid) ?? null;
    const cached = certCache.get(teamDomain);
    if (cached && now() - cached.fetchedAt < CACHE_MS && (find(cached.keys) || now() - cached.fetchedAt < REFETCH_MS)) return find(cached.keys);
    try {
      const response = await fetcher(`https://${teamDomain}/cdn-cgi/access/certs`);
      if (!response.ok) return null;
      const body = (await response.json()) as { keys?: unknown };
      const keys = Array.isArray(body.keys) ? (body.keys as JsonWebKey[]) : [];
      certCache.set(teamDomain, { keys, fetchedAt: now() });
      return find(keys);
    } catch {
      return null;
    }
  };
}
