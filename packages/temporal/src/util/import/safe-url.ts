import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

/**
 * Raised when a URL fails the SSRF safety policy (bad scheme, or resolves to a
 * private/loopback/link-local/metadata address).
 */
export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

// Address ranges that must never be reachable from import workers. Covers
// loopback, RFC1918 private ranges, CGNAT, link-local (incl. the cloud metadata
// endpoint 169.254.169.254), and assorted reserved/test ranges.
const blockList = new BlockList();
const IPV4_BLOCKED: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];
for (const [addr, prefix] of IPV4_BLOCKED) {
  blockList.addSubnet(addr, prefix, 'ipv4');
}
blockList.addAddress('255.255.255.255', 'ipv4');

const IPV6_BLOCKED: Array<[string, number]> = [
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
  ['2001:db8::', 32], // documentation
  ['64:ff9b::', 96], // NAT64 (could embed an internal IPv4)
  // IPv4-compatible IPv6 (`::a.b.c.d`, e.g. `::127.0.0.1` -> `::7f00:1`). The
  // deprecated form embeds an IPv4 some stacks still route, and the bare-hex
  // canonicalization (`::7f00:1`) isn't caught by the embeddedIpv4 decode below.
  // Unlike `::ffff:0:0/96`, this range does NOT collide with Node's internal
  // IPv4-as-mapped representation, so it's safe to block wholesale.
  ['::', 96],
];
for (const [addr, prefix] of IPV6_BLOCKED) {
  blockList.addSubnet(addr, prefix, 'ipv6');
}
blockList.addAddress('::1', 'ipv6'); // loopback
blockList.addAddress('::', 'ipv6'); // unspecified
// NOTE: do not add ::ffff:0:0/96 here — Node represents IPv4 internally as
// IPv4-mapped IPv6, so that subnet would make every IPv4 check match. Mapped
// literals are decoded to their embedded IPv4 and checked below instead.

// Decode IPv4-mapped / IPv4-compatible IPv6 literals to their embedded IPv4.
function embeddedIpv4(addr: string): string | null {
  // Dotted forms: `::ffff:1.2.3.4` and the deprecated `::1.2.3.4`.
  const dotted = addr.match(/^::(?:ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (dotted) {
    return dotted[1];
  }
  // Hex mapped form: `::ffff:aabb:ccdd`.
  const hex = addr.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (hex) {
    const hi = Number.parseInt(hex[1], 16);
    const lo = Number.parseInt(hex[2], 16);
    return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
  }
  return null;
}

function isBlockedAddress(address: string): boolean {
  // Strip any IPv6 zone id (e.g. `fe80::1%eth0`).
  const addr = address.split('%')[0];

  const mappedIpv4 = embeddedIpv4(addr);
  if (mappedIpv4) {
    return blockList.check(mappedIpv4, 'ipv4');
  }

  const family = isIP(addr);
  if (family === 4) {
    return blockList.check(addr, 'ipv4');
  }
  if (family === 6) {
    return blockList.check(addr, 'ipv6');
  }

  // Not a recognizable IP literal — fail closed.
  return true;
}

/**
 * Validate that a URL is safe to fetch server-side: http(s) only, and every
 * address its hostname resolves to is a public, routable address. Returns the
 * parsed URL on success; throws {@link UnsafeUrlError} otherwise.
 */
export async function assertPublicUrl(input: string | URL): Promise<URL> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new UnsafeUrlError(`Invalid URL: ${String(input)}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError(`Disallowed URL scheme: ${url.protocol}`);
  }

  // URL.hostname strips the brackets from IPv6 literals.
  const hostname = url.hostname.replace(/^\[|\]$/g, '');

  let addresses: Array<{ address: string }>;
  if (isIP(hostname)) {
    addresses = [{ address: hostname }];
  } else {
    try {
      addresses = await lookup(hostname, { all: true });
    } catch {
      throw new UnsafeUrlError(`Could not resolve host: ${hostname}`);
    }
  }

  if (addresses.length === 0) {
    throw new UnsafeUrlError(`Host did not resolve: ${hostname}`);
  }

  for (const { address } of addresses) {
    if (isBlockedAddress(address)) {
      throw new UnsafeUrlError(
        `URL ${url.toString()} resolves to a blocked address (${address})`,
      );
    }
  }

  return url;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_REDIRECTS = 5;

// Wrap a response body so it errors once more than `maxBytes` have been read,
// bounding memory for callers that buffer the whole body (e.g. feed `.text()`).
function capResponseBody(res: Response, maxBytes: number): Response {
  if (!res.body) {
    return res;
  }
  let received = 0;
  const reader = res.body.getReader();
  const capped = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel().catch(() => {});
        controller.error(
          new UnsafeUrlError(`Response exceeded the ${maxBytes}-byte limit`),
        );
        return;
      }
      controller.enqueue(value);
    },
    cancel(reason) {
      void reader.cancel(reason).catch(() => {});
    },
  });
  return new Response(capped, {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
  });
}

/**
 * SSRF-hardened `fetch`. Validates the target (and every redirect hop) against
 * {@link assertPublicUrl}, follows redirects manually so an external host can't
 * bounce the request to an internal address, and applies a request timeout.
 *
 * NOTE: a determined attacker could still attempt DNS rebinding between this
 * validation and the socket connect. Egress network policy on the import
 * workers remains the strongest defense; this closes the common cases (direct
 * internal hostnames/IPs and redirect-to-internal).
 */
export async function safeFetch(
  input: string | URL,
  init: RequestInit = {},
  {
    maxRedirects = DEFAULT_MAX_REDIRECTS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxBytes,
  }: { maxRedirects?: number; timeoutMs?: number; maxBytes?: number } = {},
): Promise<Response> {
  let current = await assertPublicUrl(input);

  for (let i = 0; i <= maxRedirects; i++) {
    // Combine the caller's signal (if any) with our timeout so a caller-supplied
    // signal can't silently disable the per-request timeout.
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = init.signal
      ? AbortSignal.any([init.signal, timeoutSignal])
      : timeoutSignal;

    const res = await fetch(current, { ...init, redirect: 'manual', signal });

    const isRedirect = res.status >= 300 && res.status < 400;
    const location = res.headers.get('location');
    if (!isRedirect || !location) {
      if (maxBytes !== undefined) {
        // Fail fast if the server declares an oversized body, then enforce the
        // cap on the actual stream (covers chunked / lying Content-Length).
        const declared = Number(res.headers.get('content-length'));
        if (Number.isFinite(declared) && declared > maxBytes) {
          await res.body?.cancel().catch(() => {});
          throw new UnsafeUrlError(
            `Response Content-Length ${declared} exceeds the ${maxBytes}-byte limit`,
          );
        }
        return capResponseBody(res, maxBytes);
      }
      return res;
    }

    // Drain the redirect body so the socket can be reused.
    await res.body?.cancel().catch(() => {});

    current = await assertPublicUrl(new URL(location, current));
  }

  throw new UnsafeUrlError(
    `Exceeded ${maxRedirects} redirects fetching ${input}`,
  );
}
