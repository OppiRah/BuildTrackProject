// Rate-limit identity of the connecting client (docs/PROPOSAL_QUOTATION_WORKFLOW.md §18, "Trust boundary").
//
// The public Worker reads only CF-Connecting-IP, which Cloudflare's edge sets to the address of
// the client connecting to Cloudflare when a request reaches the Worker directly (no Worker
// subrequest in between). X-Forwarded-For, True-Client-IP and similar headers are ignored.
// Whether Cloudflare replaces a client-sent CF-Connecting-IP on inbound requests is not stated in
// the documentation read; this is verified before the workflow is enabled. `wrangler dev` passes
// a client-sent value through unchanged, so local runs must not be read as evidence of it.
//
// The result is an abuse-control key, not proof of one visitor: IPv4 addresses are kept whole
// (many people may share one behind carrier-grade NAT), and IPv6 addresses are grouped by /64,
// the usual size of one subscriber's network. A missing or malformed value returns null; the
// caller then refuses the request instead of placing it in a shared bucket.

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const HEXTET = /^[0-9a-f]{1,4}$/;

/** Expands an IPv6 address to eight 16-bit groups, or null if it is not valid. */
function ipv6Groups(address: string): number[] | null {
  let text = address.toLowerCase();
  if (text.includes('%')) return null; // Zone ids never appear on public connections.
  // Embedded IPv4 in the last 32 bits (e.g. ::ffff:192.0.2.1) becomes two hex groups.
  const lastColon = text.lastIndexOf(':');
  const last = text.slice(lastColon + 1);
  if (last.includes('.')) {
    if (!IPV4.test(last)) return null;
    const [a, b, c, d] = last.split('.').map(Number) as [number, number, number, number];
    text = `${text.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  if (![...head, ...tail].every((group) => HEXTET.test(group))) return null;
  const explicit = head.length + tail.length;
  if (halves.length === 1 ? explicit !== 8 : explicit > 7) return null;
  const hex = (group: string) => parseInt(group, 16);
  return [...head.map(hex), ...Array<number>(8 - explicit).fill(0), ...tail.map(hex)];
}

/** "v4:a.b.c.d" or "v6:xxxx:xxxx:xxxx:xxxx/64"; null for a missing or malformed address. */
export function clientIdentity(header: string | null): string | null {
  const value = header?.trim() ?? '';
  if (value === '' || value.length > 64) return null;
  if (IPV4.test(value)) return `v4:${value}`;
  if (!value.includes(':')) return null;
  const groups = ipv6Groups(value);
  if (!groups) return null;
  // IPv4-mapped (::ffff:a.b.c.d) is the IPv4 client itself.
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    return `v4:${[groups[6]! >> 8, groups[6]! & 255, groups[7]! >> 8, groups[7]! & 255].join('.')}`;
  }
  return `v6:${groups
    .slice(0, 4)
    .map((g) => g.toString(16).padStart(4, '0'))
    .join(':')}/64`;
}
