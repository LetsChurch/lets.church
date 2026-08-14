import { isIP } from 'node:net';

// Public traffic reaches the applications through Cloudflare Tunnel. Prefer the
// Cloudflare-owned header so callers cannot choose their rate-limit bucket; the
// remaining headers support local and direct/internal deployments.
const headerNames = Object.freeze([
  'CF-Connecting-IP',
  'X-Client-IP',
  'X-Forwarded-For',
  'HTTP-X-Forwarded-For',
  'Fly-Client-IP',
  'Fastly-Client-Ip',
  'True-Client-Ip',
  'X-Real-IP',
  'X-Cluster-Client-IP',
  'X-Forwarded',
  'Forwarded-For',
  'Forwarded',
  'DO-Connecting-IP',
  'oxygen-buyer-ip',
] as const);

/** Return the first valid client IP from trusted-header preference order. */
export function getClientIpAddress(headers: Headers): string | null {
  const ipAddress = headerNames
    .flatMap((headerName) => {
      const value = headers.get(headerName);
      if (headerName === 'Forwarded') return parseForwardedHeader(value);
      if (!value?.includes(',')) return value;
      return value.split(',').map((ip) => ip.trim());
    })
    .find((ip) => ip !== null && isIP(ip) !== 0);

  return ipAddress ?? null;
}

function parseForwardedHeader(value: string | null): string | null {
  if (!value) return null;
  for (const part of value.split(';')) {
    if (part.startsWith('for=')) return part.slice(4);
  }
  return null;
}
