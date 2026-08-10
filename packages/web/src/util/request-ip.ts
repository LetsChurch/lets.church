// Adapted from https://github.com/sergiodxa/remix-utils/blob/703aeb39c6304542db0da539ea4fa9b72a5f7f9b/src/server/get-client-ip-address.ts

import { isIP } from 'is-ip';

/**
 * This is the list of headers, in order of preference, that will be used to
 * determine the client's IP address.
 */
// Public traffic reaches the app through Cloudflare Tunnel. Cloudflare sets
// CF-Connecting-IP to the visitor address, while forwarding arbitrary incoming
// headers such as X-Client-IP and pre-existing X-Forwarded-For values. Prefer
// the Cloudflare-owned header so callers cannot select their own rate-limit
// bucket. The remaining headers are fallbacks for local development and other
// direct/internal deployments.
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
  'DO-Connecting-IP' /** Digital ocean app platform */,
  'oxygen-buyer-ip' /** Shopify oxygen platform */,
] as const);

/**
 * Get the IP address of the client sending a request.
 *
 * It receives the Request object or the headers object and use it to get the
 * IP address from one of the following headers in order.
 *
 * - CF-Connecting-IP
 * - X-Client-IP
 * - X-Forwarded-For
 * - HTTP-X-Forwarded-For
 * - Fly-Client-IP
 * - Fastly-Client-Ip
 * - True-Client-Ip
 * - X-Real-IP
 * - X-Cluster-Client-IP
 * - X-Forwarded
 * - Forwarded-For
 * - Forwarded
 * - DO-Connecting-IP
 * - oxygen-buyer-ip
 *
 * If the IP address is valid, it will be returned. Otherwise, null will be
 * returned.
 *
 * If the header values contains more than one IP address, the first valid one
 * will be returned.
 */
export function getClientIpAddress(headers: Headers): string | null {
  const ipAddress = headerNames
    .flatMap((headerName) => {
      const value = headers.get(headerName);
      if (headerName === 'Forwarded') {
        return parseForwardedHeader(value);
      }
      if (!value?.includes(',')) return value;
      return value.split(',').map((ip) => ip.trim());
    })
    .find((ip) => {
      if (ip === null) return false;
      return isIP(ip);
    });

  return ipAddress ?? null;
}

function parseForwardedHeader(value: string | null): string | null {
  if (!value) return null;
  for (const part of value.split(';')) {
    if (part.startsWith('for=')) return part.slice(4);
  }
  return null;
}
