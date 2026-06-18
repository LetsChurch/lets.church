// Code-driven, first-party client registry. The *set* of clients that may use
// lets.church as an identity provider lives here, in code — there is no dynamic
// client registration, so a site is first-party iff it appears in this file
// (PR-reviewed). That is the structural "first-party only" guarantee.
//
// What each client *resolves to* (its redirect URIs, post-logout URIs, and
// allowed scopes) is overridable per client via environment variables, so the
// same code serves dev (localhost) and production (real https origins) without
// editing this file. The in-code values below are the **dev defaults**; when the
// matching env var is set it replaces them.
//
// Env var names derive from the clientId: uppercased with non-alphanumerics
// collapsed to underscores, prefixed `OIDC_CLIENT_` and suffixed with the field.
// All are comma-separated lists. For clientId "lets.bible":
//   OIDC_CLIENT_LETS_BIBLE_REDIRECT_URIS
//   OIDC_CLIENT_LETS_BIBLE_POST_LOGOUT_REDIRECT_URIS
//   OIDC_CLIENT_LETS_BIBLE_SCOPES
//
// All clients are **public**: they authenticate with PKCE (required) rather than
// a client secret. ID/access tokens are verified by clients against the public
// JWKS, so nothing secret is ever shared with a client. Falling back to the
// localhost default in production is fail-safe, not fail-open: an exact-match
// redirect check (below) rejects the stale localhost URI rather than leaking
// tokens.

import { SUPPORTED_SCOPES } from './config';

export type OidcClient = {
  clientId: string;
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  allowedScopes: string[];
};

const DEFAULT_SCOPES = [...SUPPORTED_SCOPES];

// In-code dev defaults. The clientId list here is the source of truth for which
// sites are first-party; the URIs/scopes are overridable per client via env.
const clientDefaults: OidcClient[] = [
  // lets.bible — first-party scripture app (packages/lets.bible), served on
  // :4001 in dev. Real production satellites follow the same shape — add an
  // entry here and set its OIDC_CLIENT_<ID>_* env vars in production.
  {
    clientId: 'lets.bible',
    redirectUris: ['http://localhost:4001/callback'],
    postLogoutRedirectUris: ['http://localhost:4001/'],
    allowedScopes: DEFAULT_SCOPES,
  },
];

// clientId → env-var infix, e.g. "lets.bible" → "LETS_BIBLE".
function envKey(clientId: string): string {
  return clientId.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

// Read a per-client comma-separated env list, or null when unset/empty so the
// caller can fall back to the in-code default.
function envList(clientId: string, field: string): string[] | null {
  const raw = process.env[`OIDC_CLIENT_${envKey(clientId)}_${field}`];
  if (!raw) {
    return null;
  }
  const items = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length > 0 ? items : null;
}

const supportedScopes = new Set<string>(SUPPORTED_SCOPES);

export const clients: OidcClient[] = clientDefaults.map((d) => ({
  clientId: d.clientId,
  redirectUris: envList(d.clientId, 'REDIRECT_URIS') ?? d.redirectUris,
  postLogoutRedirectUris:
    envList(d.clientId, 'POST_LOGOUT_REDIRECT_URIS') ??
    d.postLogoutRedirectUris,
  // Env-provided scopes are still constrained to what the provider supports, so
  // a typo'd scope can't silently widen a client's grant.
  allowedScopes: (envList(d.clientId, 'SCOPES') ?? d.allowedScopes).filter(
    (s) => supportedScopes.has(s),
  ),
}));

export function getClient(clientId: string): OidcClient | null {
  return clients.find((c) => c.clientId === clientId) ?? null;
}

// Exact-string match only — never prefix/substring — to prevent open redirects.
export function isRegisteredRedirectUri(
  client: OidcClient,
  redirectUri: string,
): boolean {
  return client.redirectUris.includes(redirectUri);
}

export function isRegisteredPostLogoutRedirectUri(
  client: OidcClient,
  redirectUri: string,
): boolean {
  return client.postLogoutRedirectUris.includes(redirectUri);
}

// Reduce a requested scope string to the scopes this client is allowed, always
// keeping `openid`.
export function filterScope(client: OidcClient, requested: string): string {
  const allowed = new Set(client.allowedScopes);
  const granted = requested
    .split(/\s+/)
    .filter(Boolean)
    .filter((s) => allowed.has(s));
  if (!granted.includes('openid')) {
    granted.unshift('openid');
  }
  return granted.join(' ');
}
