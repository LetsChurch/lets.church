/**
 * CSRF defense-in-depth for cookie-authenticated POSTs (docs/security.md,
 * "Browser extension clients").
 *
 * `lc-session` is `SameSite=Lax`, which already keeps it off cross-site POSTs.
 * This additionally rejects a POST whose `Origin` names a *different web
 * origin*, so a same-site-but-foreign page (or a future cookie-policy change)
 * can't drive mutations.
 *
 * Allowed:
 * - no `Origin` header (server-to-server, native clients, old browsers);
 * - this app's own origin (the request's host, or `WEB_URL`);
 * - browser-extension origins. Those only receive the session cookie when the
 *   user installed an extension with host permissions for this site (our
 *   YouTube Studio mirror extension). Firefox gives every install a random
 *   `moz-extension://<uuid>` origin, so they can't be pinned to an id.
 */
const EXTENSION_PROTOCOLS = new Set([
  'chrome-extension:',
  'moz-extension:',
  'safari-web-extension:',
]);

export function isAllowedPostOrigin(
  request: Request,
  webUrl: string | undefined = process.env.WEB_URL,
): boolean {
  const origin = request.headers.get('origin');
  if (origin === null) {
    return true;
  }

  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    // Includes the opaque `null` origin from sandboxed frames and data: URLs.
    return false;
  }

  if (EXTENSION_PROTOCOLS.has(parsed.protocol)) {
    return true;
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return false;
  }

  // Compare hosts, not full origins: behind the ingress the request URL can
  // say http:// while the browser's Origin says https://.
  const requestHost = request.headers.get('host') ?? new URL(request.url).host;
  if (parsed.host === requestHost) {
    return true;
  }

  return !!webUrl && parsed.host === new URL(webUrl).host;
}
