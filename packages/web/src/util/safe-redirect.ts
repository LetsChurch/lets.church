// Origin used only to resolve relative redirect targets for same-origin
// comparison. The value is arbitrary; only the origin equality matters.
const RESOLVE_ORIGIN = 'https://lets.church';

/**
 * Validate a post-login redirect target so a crafted `?redirect=` can't turn the
 * login page into an open redirector. Only internal absolute paths are allowed.
 * Returns the normalized `pathname + search + hash`, or `undefined` if the input
 * is not a safe same-origin path.
 *
 * Callers (the OIDC authorize route, the invitation-accept flow) pass a relative
 * path; everything else is rejected.
 */
export function safeRedirect(redirectTo?: string): string | undefined {
  // Require an absolute internal path. This rejects absolute URLs
  // (`https://evil`) and scheme-relative inputs that don't start with `/`.
  if (!redirectTo || !redirectTo.startsWith('/')) {
    return undefined;
  }
  try {
    // Resolve against a fixed origin and require the result to stay on it. The
    // WHATWG parser converts backslashes to slashes for http(s), so the
    // open-redirect tricks (`/\attacker.example`, `//attacker.example`,
    // `/%5Cattacker.example` after decoding) all resolve to a different origin
    // and are rejected here — no manual normalization needed.
    const resolved = new URL(redirectTo, RESOLVE_ORIGIN);
    if (resolved.origin !== RESOLVE_ORIGIN) {
      return undefined;
    }
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return undefined;
  }
}
