import { getClientIpAddress } from '@/util/request-ip';

/**
 * Preserve the small, trusted portion of the browser request that an SSR tRPC
 * subrequest needs. Canonicalizing the visitor address into
 * CF-Connecting-IP means the internal localhost request follows the same path
 * as a browser request arriving through Cloudflare.
 */
export function getForwardedTrpcHeaders(
  incoming: Headers,
): Record<string, string> {
  const forwarded: Record<string, string> = {};

  const cookie = incoming.get('cookie');
  if (cookie) forwarded.cookie = cookie;

  const clientIp = getClientIpAddress(incoming);
  if (clientIp) forwarded['CF-Connecting-IP'] = clientIp;

  return forwarded;
}
