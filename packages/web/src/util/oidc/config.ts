import { z } from 'zod';

// `OIDC_ISSUER` is the provider's public HTTPS origin (e.g.
// https://lets.church). The issuer identifier itself — every token's `iss` and
// the discovery `issuer` — is that origin plus `ISSUER_PATH`, so discovery lives
// at /oidc/.well-known/openid-configuration rather than the origin root. A root
// discovery document made MCP clients (ChatGPT) assume our MCP server at /mcp
// uses this provider for OAuth; see routes/[.]well-known.openid-configuration.ts.
// lets.bible derives the same issuer from the same env value.
//
// `OIDC_SIGNING_JWK` is the asymmetric signing key material for OIDC tokens. It
// is a JSON string containing either a single private JWK or an array of them
// (the first is the active signer; the rest are still published for verification
// to support key rotation). This is deliberately separate from `JWT_SECRET`,
// which signs first-party session cookies with HS512 and must never leave the
// server.
// The env parse is deliberately lazy and memoized rather than run at import
// time: the static constants below (scopes, TTLs) and the pure client-registry
// helpers in `clients.ts` must be importable without OIDC env configured (e.g.
// in unit tests). Anything that actually serves OIDC calls `oidcEnv()` and so
// still fails fast if `OIDC_ISSUER`/`OIDC_SIGNING_JWK` are missing at runtime.
let cachedEnv: { OIDC_ISSUER: string; OIDC_SIGNING_JWK: string } | null = null;
function oidcEnv() {
  if (!cachedEnv) {
    cachedEnv = z
      .object({
        OIDC_ISSUER: z.string().url(),
        OIDC_SIGNING_JWK: z.string(),
      })
      .parse(process.env);
  }
  return cachedEnv;
}

export const ISSUER_PATH = '/oidc';

export function getIssuer() {
  return `${new URL(oidcEnv().OIDC_ISSUER).origin}${ISSUER_PATH}`;
}

export function getRawSigningJwk() {
  return oidcEnv().OIDC_SIGNING_JWK;
}

export function getOidcEndpoints() {
  const issuer = getIssuer();
  return {
    authorization: `${issuer}/authorize`,
    token: `${issuer}/token`,
    userinfo: `${issuer}/userinfo`,
    // JWKS stays at the origin root; jwks_uri may live anywhere.
    jwks: `${new URL(issuer).origin}/.well-known/jwks.json`,
    endSession: `${issuer}/logout`,
  } as const;
}

// The login page users are bounced to when no lets.church session exists.
export const loginPath = '/auth/login';

export const SUPPORTED_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
] as const;

// Token lifetimes (seconds).
export const AUTH_CODE_TTL_SECONDS = 60;
export const ACCESS_TOKEN_TTL_SECONDS = 10 * 60;
export const ID_TOKEN_TTL_SECONDS = 10 * 60;
// Matches the 4-week session window (see SESSION_EXPIRATION_SECONDS).
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7 * 4;
