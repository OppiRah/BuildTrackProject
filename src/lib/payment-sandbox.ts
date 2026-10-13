// Whether the payment demo may show a provider sandbox link (src/config/payment-sandbox.ts). Pure;
// never contacts the destination.
//
// A link is shown only when all of these hold:
// - the owner has marked it verified as test mode (an additional requirement, never sufficient);
// - the provider is one listed below;
// - the URL, parsed structurally (not by substring), is https, on exactly that provider's host,
//   with no credentials, port, query or fragment, and its path is exactly the provider's documented
//   test-route format. Live routes, other hosts (including look-alikes), localhost and IP addresses
//   therefore never match.
// Otherwise the page says "Provider sandbox not connected."

export type SandboxProvider = 'paymongo';

interface ProviderFormat {
  name: string;
  host: string;
  /** Path segments of a test-mode link. */
  isTestPath: (segments: string[]) => boolean;
}

/** PayMongo test Payment Links: https://pm.link/{business handle}/test/{reference} (PayMongo
 * documentation, payment-acceptance testing, checked 2026-10-12 through search results; confirm
 * against the live documentation and the owner's own dashboard before configuring a link). */
const formats: Record<SandboxProvider, ProviderFormat> = {
  paymongo: {
    name: 'PayMongo',
    host: 'pm.link',
    isTestPath: (segments) =>
      segments.length === 3 && /^[A-Za-z0-9][A-Za-z0-9_-]{0,62}$/.test(segments[0]!) && segments[1] === 'test' && /^[A-Za-z0-9]{1,64}$/.test(segments[2]!),
  },
};

export interface SandboxLink {
  url: string;
  providerName: string;
}

interface SandboxConfig {
  provider: string | null;
  testLinkUrl: string | null;
  verifiedTestMode: boolean;
}

export function sandboxLink(config: SandboxConfig): SandboxLink | null {
  if (config.verifiedTestMode !== true || !config.provider || !config.testLinkUrl) return null;
  if (!Object.hasOwn(formats, config.provider)) return null;
  const format = formats[config.provider as SandboxProvider];
  let url: URL;
  try {
    url = new URL(config.testLinkUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.hostname !== format.host || url.port !== '' || url.username || url.password || url.search || url.hash) return null;
  // The configured text must be exactly the origin and path: nothing the parser normalised away
  // (an explicit :443, backslashes, whitespace) and no query or fragment, not even an empty "?".
  if (config.testLinkUrl !== `${url.origin}${url.pathname}`) return null;
  const segments = url.pathname.split('/').slice(1);
  if (!format.isTestPath(segments)) return null;
  return { url: url.href, providerName: format.name };
}
