import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { db, oidcLoginRequest, oidcSession } from '@/db';

// OIDC relying-party logic for signing in with the lets.church account.
// lets.bible is a PUBLIC (PKCE-only) client — no client secret.
//
// Sessions and in-flight logins are stored in lets.bible's own Postgres
// database (see src/db), so they survive server restarts and work across
// multiple app instances. The browser cookie holds only the opaque session id.
//
// Two base URLs (see docker-compose): OIDC_ISSUER is the public, browser-facing
// origin (and the `iss` we validate against); OIDC_INTERNAL_URL is used for
// back-channel calls (token exchange, JWKS) from this server. In production both
// are the same.

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

const ISSUER = required('OIDC_ISSUER').replace(/\/+$/, '');
const INTERNAL = (process.env.OIDC_INTERNAL_URL ?? ISSUER).replace(/\/+$/, '');
const CLIENT_ID = required('OIDC_CLIENT_ID');
const REDIRECT_URI = required('OIDC_REDIRECT_URI');
const POST_LOGOUT_REDIRECT_URI = required('OIDC_POST_LOGOUT_REDIRECT_URI');
const SCOPE = 'openid profile email offline_access';

// The bare auth origin (scheme + host, no path) — e.g. https://lets.church.
// Surfaced to the client so UI can link back to the account host.
export const authHost = new URL(ISSUER).origin;

const authorizationEndpoint = `${ISSUER}/oidc/authorize`;
const endSessionEndpoint = `${ISSUER}/oidc/logout`;
const tokenEndpoint = `${INTERNAL}/oidc/token`;
const jwks = createRemoteJWKSet(new URL(`${INTERNAL}/.well-known/jwks.json`));

const SESSION_COOKIE = 'sid';
// Binds the in-flight login to the browser that started it. The provider returns
// `state` on the callback; we additionally require this HttpOnly cookie (set at
// beginLogin) to match, so an attacker can't feed a victim a (state, code) pair
// from a flow the victim never initiated (login CSRF / session fixation).
const STATE_COOKIE = 'lb_oidc_state';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const LOGIN_TTL_MS = 10 * 60 * 1000; // 10 minutes
const SECURE = REDIRECT_URI.startsWith('https://');
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Claims = Record<string, unknown>;

function b64url(buf: Buffer) {
  return buf.toString('base64url');
}
function randomToken() {
  return b64url(crypto.randomBytes(32));
}
function pkceChallenge(verifier: string) {
  return b64url(crypto.createHash('sha256').update(verifier).digest());
}

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) {
    return out;
  }
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) {
      continue;
    }
    const key = part.slice(0, idx).trim();
    const raw = part.slice(idx + 1).trim();
    // A malformed value (e.g. `tz=%E`) would make decodeURIComponent throw and
    // crash the request — fall back to the raw value instead.
    try {
      out[key] = decodeURIComponent(raw);
    } catch {
      out[key] = raw;
    }
  }
  return out;
}

function setSessionCookie(id: string): string {
  const parts = [
    `${SESSION_COOKIE}=${id}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (SECURE) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

function clearSessionCookie(): string {
  const parts = [
    `${SESSION_COOKIE}=`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (SECURE) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

function setStateCookie(state: string): string {
  const parts = [
    `${STATE_COOKIE}=${state}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${Math.floor(LOGIN_TTL_MS / 1000)}`,
  ];
  if (SECURE) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

function clearStateCookie(): string {
  const parts = [
    `${STATE_COOKIE}=`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (SECURE) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export async function getSessionFromRequest(
  req: Request,
): Promise<{ claims: Claims } | null> {
  const sid = parseCookies(req.headers.get('cookie'))[SESSION_COOKIE];
  if (!sid || !UUID_RE.test(sid)) {
    return null;
  }
  const row = await db.query.oidcSession.findFirst({
    where: (s, { and, eq: eqOp, gt }) =>
      and(eqOp(s.id, sid), gt(s.expiresAt, new Date())),
  });
  return row ? { claims: row.claims } : null;
}

// Begin a login: create an authorization request row (PKCE verifier + nonce)
// keyed by a random state, then redirect to the provider. Also set an HttpOnly
// `state` cookie so the callback can prove it's the same browser (CSRF).
export async function beginLogin(): Promise<{
  location: string;
  setCookie: string;
}> {
  const state = randomToken();
  const nonce = randomToken();
  const verifier = randomToken();

  await db.insert(oidcLoginRequest).values({
    state,
    nonce,
    verifier,
    expiresAt: new Date(Date.now() + LOGIN_TTL_MS),
  });

  const url = new URL(authorizationEndpoint);
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SCOPE);
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', nonce);
  url.searchParams.set('code_challenge', pkceChallenge(verifier));
  url.searchParams.set('code_challenge_method', 'S256');
  return { location: url.toString(), setCookie: setStateCookie(state) };
}

async function exchangeToken(params: Record<string, string>) {
  const res = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, ...params }).toString(),
    // Don't let a slow/unresponsive provider hang the login callback.
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await res.json()) as Record<string, string>;
  if (!res.ok) {
    throw new Error(`token endpoint ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

// Complete the /callback: verify the browser-bound state, consume the login
// request (single-use), exchange the code with PKCE, verify the ID token, and
// persist a session row. Always clears the transient state cookie.
export async function completeLogin(
  req: Request,
): Promise<{ location: string; setCookies: string[] }> {
  const url = new URL(req.url);
  // The state cookie is one-shot regardless of outcome.
  const cookies = parseCookies(req.headers.get('cookie'));
  const fail = (error: string) => ({
    location: `/?error=${error}`,
    setCookies: [clearStateCookie()],
  });

  if (url.searchParams.get('error')) {
    return fail('login');
  }

  const state = url.searchParams.get('state') ?? '';
  const code = url.searchParams.get('code') ?? '';
  if (!state || !code) {
    return fail('state');
  }

  // CSRF: the callback must come from the same browser that started the login —
  // the state in the URL must match the HttpOnly cookie we set at beginLogin.
  const cookieState = cookies[STATE_COOKIE];
  if (!cookieState || cookieState !== state) {
    return fail('state');
  }

  // Atomically consume the login request so a code/state can't be replayed.
  const [request] = await db
    .delete(oidcLoginRequest)
    .where(eq(oidcLoginRequest.state, state))
    .returning();
  if (!request || request.expiresAt <= new Date()) {
    return fail('state');
  }

  try {
    const tokens = await exchangeToken({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: request.verifier,
    });

    const { payload } = await jwtVerify(tokens.id_token, jwks, {
      issuer: ISSUER,
      audience: CLIENT_ID,
      // Pin the algorithm rather than trusting the JWKS to only ever hold EC
      // keys — closes off any algorithm-confusion / `alg:none` avenue.
      algorithms: ['ES256'],
    });
    if (request.nonce && payload.nonce !== request.nonce) {
      return fail('nonce');
    }
    // A missing/empty subject is a hard failure, not an empty-subject session.
    if (typeof payload.sub !== 'string' || !payload.sub) {
      return fail('sub');
    }

    const claims: Claims = {
      sub: payload.sub,
      name: payload.name ?? null,
      preferred_username: payload.preferred_username ?? null,
      email: payload.email ?? null,
      email_verified: payload.email_verified ?? null,
    };

    const [session] = await db
      .insert(oidcSession)
      .values({
        sub: payload.sub,
        claims,
        idToken: tokens.id_token,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      })
      .returning();
    if (!session) {
      return fail('exchange');
    }

    return {
      location: '/',
      setCookies: [clearStateCookie(), setSessionCookie(session.id)],
    };
  } catch (err) {
    console.error('[oidc] login completion failed:', err);
    return fail('exchange');
  }
}

// RP-initiated logout: delete the session row and bounce to the provider's
// end-session endpoint, which clears the lets.church session too.
export async function buildLogout(
  req: Request,
): Promise<{ location: string; setCookie: string }> {
  const sid = parseCookies(req.headers.get('cookie'))[SESSION_COOKIE];
  let idToken: string | null = null;
  if (sid && UUID_RE.test(sid)) {
    const [row] = await db
      .delete(oidcSession)
      .where(eq(oidcSession.id, sid))
      .returning();
    idToken = row?.idToken ?? null;
  }

  const url = new URL(endSessionEndpoint);
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('post_logout_redirect_uri', POST_LOGOUT_REDIRECT_URI);
  // Proves to the provider that this end-session request is genuine, so it will
  // actually terminate the shared SSO session (its anti-CSRF check).
  if (idToken) {
    url.searchParams.set('id_token_hint', idToken);
  }
  return { location: url.toString(), setCookie: clearSessionCookie() };
}
