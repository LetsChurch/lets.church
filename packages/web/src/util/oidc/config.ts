import { z } from 'zod';

// The OIDC issuer identifier. Must be the public, HTTPS origin of lets.church
// (no trailing slash). All discovery metadata and token `iss` claims use it.
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

export function getIssuer() {
  return oidcEnv().OIDC_ISSUER.replace(/\/+$/, '');
}

export function getRawSigningJwk() {
  return oidcEnv().OIDC_SIGNING_JWK;
}

export function getOidcEndpoints() {
  const issuer = getIssuer();
  return {
    authorization: `${issuer}/oidc/authorize`,
    token: `${issuer}/oidc/token`,
    userinfo: `${issuer}/oidc/userinfo`,
    jwks: `${issuer}/.well-known/jwks.json`,
    endSession: `${issuer}/oidc/logout`,
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
