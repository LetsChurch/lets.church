// Friendly, display-only names for first-party OIDC clients, keyed by clientId.
// The authoritative registry of *which* clients exist (and their redirect URIs,
// scopes, …) is `clients.ts`; this map exists purely so the login/consent UI can
// say "continue to <app>". It is import-safe on the client (no env / server
// access), which `clients.ts` is not. Keep it in sync when adding a client.
export const OIDC_CLIENT_NAMES: Record<string, string> = {
  'lets.bible': 'lets.bible',
};

// The friendly name for a registered client, or null for an unknown clientId —
// so the UI never echoes an arbitrary (possibly spoofed) client_id as if it were
// a trusted first-party app.
export function oidcClientName(
  clientId: string | null | undefined,
): string | null {
  if (!clientId) {
    return null;
  }
  return OIDC_CLIENT_NAMES[clientId] ?? null;
}

// Pull the client_id out of an OIDC authorize redirect target (the `redirect`
// search param the login page is given) and resolve it to a friendly name.
// Returns null for anything that isn't a recognized first-party authorize
// request, so the banner only shows for known apps.
export function oidcClientNameFromRedirect(
  redirect: string | null | undefined,
): string | null {
  if (!redirect) {
    return null;
  }
  try {
    // `redirect` is an app-relative path like
    // "/oidc/authorize?client_id=lets.bible&…"; parse it against a dummy base.
    const url = new URL(redirect, 'http://localhost');
    if (!url.pathname.endsWith('/oidc/authorize')) {
      return null;
    }
    return oidcClientName(url.searchParams.get('client_id'));
  } catch {
    return null;
  }
}
