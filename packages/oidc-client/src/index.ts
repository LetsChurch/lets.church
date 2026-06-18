import crypto from 'node:crypto';
import http from 'node:http';
import { createRemoteJWKSet, jwtVerify } from 'jose';

// ---------------------------------------------------------------------------
// Configuration
//
// This is a minimal, dependency-light example of a Relying Party (OIDC client)
// that authenticates users against the lets.church embedded OIDC provider using
// the authorization-code + PKCE flow. It is intentionally written with the Node
// http module and `jose` only, so the OIDC steps are easy to read.
//
// Two base URLs are configured because of local container networking:
//   - OIDC_ISSUER       — the PUBLIC, browser-facing origin (e.g. the user's
//                         browser redirects here to /oidc/authorize). This is
//                         also the `iss` value we validate ID tokens against.
//   - OIDC_INTERNAL_URL — the origin this server uses for back-channel calls
//                         (token exchange, JWKS, userinfo). In Docker this is
//                         the internal service URL (http://web:3000).
// In production both are the same (https://lets.church).
// ---------------------------------------------------------------------------

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

const PORT = Number(process.env.PORT ?? 3000);
const ISSUER = required('OIDC_ISSUER').replace(/\/+$/, '');
const INTERNAL = required('OIDC_INTERNAL_URL').replace(/\/+$/, '');
const CLIENT_ID = required('OIDC_CLIENT_ID');
const REDIRECT_URI = required('OIDC_REDIRECT_URI');
const POST_LOGOUT_REDIRECT_URI = required('OIDC_POST_LOGOUT_REDIRECT_URI');
const SCOPE = 'openid profile email offline_access';

// Browser-facing endpoints (user is redirected here).
const authorizationEndpoint = `${ISSUER}/oidc/authorize`;
const endSessionEndpoint = `${ISSUER}/oidc/logout`;
// Back-channel endpoints (this server calls these directly).
const tokenEndpoint = `${INTERNAL}/oidc/token`;
const userinfoEndpoint = `${INTERNAL}/oidc/userinfo`;
const jwks = createRemoteJWKSet(new URL(`${INTERNAL}/.well-known/jwks.json`));

// ---------------------------------------------------------------------------
// In-memory state (fine for an example; use a real session store in production)
// ---------------------------------------------------------------------------

type PendingAuth = { verifier: string; nonce: string; createdAt: number };
type Session = {
  claims: Record<string, unknown>;
  accessToken: string;
  refreshToken?: string;
  idToken: string;
};

const pending = new Map<string, PendingAuth>();
const sessions = new Map<string, Session>();

function gc() {
  const now = Date.now();
  for (const [state, p] of pending) {
    if (now - p.createdAt > 10 * 60 * 1000) pending.delete(state);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function b64url(buf: Buffer) {
  return buf.toString('base64url');
}

function randomToken() {
  return b64url(crypto.randomBytes(32));
}

function pkceChallenge(verifier: string) {
  return b64url(crypto.createHash('sha256').update(verifier).digest());
}

function parseCookies(header?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(
      part.slice(idx + 1).trim(),
    );
  }
  return out;
}

function html(res: http.ServerResponse, status: number, body: string) {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><meta charset="utf-8"><title>OIDC Client Example</title>
<style>body{font-family:system-ui,sans-serif;max-width:42rem;margin:3rem auto;padding:0 1rem;line-height:1.5}
a.button,button{display:inline-block;background:#2563eb;color:#fff;border:0;padding:.6rem 1rem;border-radius:.4rem;text-decoration:none;cursor:pointer;font-size:1rem}
pre{background:#f4f4f5;padding:1rem;border-radius:.4rem;overflow:auto}code{background:#f4f4f5;padding:.1rem .3rem;border-radius:.2rem}</style>
${body}`);
}

function redirect(
  res: http.ServerResponse,
  location: string,
  cookies: string[] = [],
) {
  res.writeHead(302, {
    location,
    ...(cookies.length ? { 'set-cookie': cookies } : {}),
  });
  res.end();
}

async function exchangeToken(params: Record<string, string>) {
  // Public client (PKCE-only): no client secret. We identify ourselves with the
  // client_id form parameter; PKCE / refresh-token possession is the proof.
  const res = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, ...params }).toString(),
  });
  const json = (await res.json()) as Record<string, string>;
  if (!res.ok) {
    throw new Error(`token endpoint ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

// Verify an ID token's signature + standard claims, returning its payload.
async function verifyIdToken(idToken: string, expectedNonce?: string) {
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: ISSUER,
    audience: CLIENT_ID,
  });
  if (expectedNonce && payload.nonce !== expectedNonce) {
    throw new Error('nonce mismatch');
  }
  return payload as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

function getSession(req: http.IncomingMessage): Session | null {
  const sid = parseCookies(req.headers.cookie).sid;
  return sid ? (sessions.get(sid) ?? null) : null;
}

function home(req: http.IncomingMessage, res: http.ServerResponse) {
  const session = getSession(req);
  if (!session) {
    return html(
      res,
      200,
      `<h1>OIDC Client Example</h1>
       <p>This sample app authenticates you with your <strong>lets.church</strong> account.</p>
       <p><a class="button" href="/login">Sign in with Lets.Church</a></p>`,
    );
  }
  const name =
    (session.claims.name as string) ||
    (session.claims.preferred_username as string) ||
    (session.claims.sub as string);
  return html(
    res,
    200,
    `<h1>Signed in</h1>
     <p>Welcome, <strong>${escapeHtml(name)}</strong> (sub: <code>${escapeHtml(String(session.claims.sub))}</code>)</p>
     <h2>ID token claims</h2>
     <pre>${escapeHtml(JSON.stringify(session.claims, null, 2))}</pre>
     <p>
       <a class="button" href="/userinfo">Call /userinfo</a>
       ${session.refreshToken ? '<a class="button" href="/refresh">Refresh tokens</a>' : ''}
       <a class="button" href="/logout">Log out</a>
     </p>`,
  );
}

function login(_req: http.IncomingMessage, res: http.ServerResponse) {
  gc();
  const state = randomToken();
  const nonce = randomToken();
  const verifier = randomToken();
  pending.set(state, { verifier, nonce, createdAt: Date.now() });

  const url = new URL(authorizationEndpoint);
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SCOPE);
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', nonce);
  url.searchParams.set('code_challenge', pkceChallenge(verifier));
  url.searchParams.set('code_challenge_method', 'S256');
  redirect(res, url.toString());
}

async function callback(res: http.ServerResponse, url: URL) {
  const error = url.searchParams.get('error');
  if (error) {
    return html(
      res,
      400,
      `<h1>Login failed</h1><pre>${escapeHtml(error)}: ${escapeHtml(url.searchParams.get('error_description') ?? '')}</pre><a href="/">Home</a>`,
    );
  }

  const state = url.searchParams.get('state') ?? '';
  const code = url.searchParams.get('code') ?? '';
  const tx = pending.get(state);
  if (!tx || !code) {
    return html(res, 400, '<h1>Invalid login state</h1><a href="/">Home</a>');
  }
  pending.delete(state);

  try {
    const tokens = await exchangeToken({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: tx.verifier,
    });

    const claims = await verifyIdToken(tokens.id_token, tx.nonce);

    const sid = randomToken();
    sessions.set(sid, {
      claims,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      idToken: tokens.id_token,
    });
    redirect(res, '/', [
      `sid=${sid}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400`,
    ]);
  } catch (e) {
    html(
      res,
      500,
      `<h1>Token exchange failed</h1><pre>${escapeHtml(String(e))}</pre><a href="/">Home</a>`,
    );
  }
}

async function userinfo(req: http.IncomingMessage, res: http.ServerResponse) {
  const session = getSession(req);
  if (!session) return redirect(res, '/');
  const r = await fetch(userinfoEndpoint, {
    headers: { authorization: `Bearer ${session.accessToken}` },
  });
  const body = await r.json();
  return html(
    res,
    200,
    `<h1>/userinfo response</h1><pre>${escapeHtml(JSON.stringify(body, null, 2))}</pre><a href="/">Home</a>`,
  );
}

async function refresh(req: http.IncomingMessage, res: http.ServerResponse) {
  const sid = parseCookies(req.headers.cookie).sid;
  const session = sid ? sessions.get(sid) : null;
  if (!sid || !session?.refreshToken) return redirect(res, '/');
  try {
    const tokens = await exchangeToken({
      grant_type: 'refresh_token',
      refresh_token: session.refreshToken,
    });
    const claims = await verifyIdToken(tokens.id_token);
    sessions.set(sid, {
      claims,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? session.refreshToken,
      idToken: tokens.id_token,
    });
  } catch {
    // If refresh fails (e.g. reuse detected / revoked), drop the session.
    sessions.delete(sid);
  }
  return redirect(res, '/');
}

function logout(req: http.IncomingMessage, res: http.ServerResponse) {
  const sid = parseCookies(req.headers.cookie).sid;
  const session = sid ? sessions.get(sid) : null;
  if (sid) sessions.delete(sid);

  // RP-initiated logout: clear our session and ask the provider to end its
  // session, then return the user here.
  const url = new URL(endSessionEndpoint);
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('post_logout_redirect_uri', POST_LOGOUT_REDIRECT_URI);
  if (session?.idToken) url.searchParams.set('id_token_hint', session.idToken);
  redirect(res, url.toString(), [
    'sid=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0',
  ]);
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&'
      ? '&amp;'
      : c === '<'
        ? '&lt;'
        : c === '>'
          ? '&gt;'
          : c === '"'
            ? '&quot;'
            : '&#39;',
  );
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const route = `${req.method} ${url.pathname}`;

  const handler = async () => {
    switch (route) {
      case 'GET /':
        return home(req, res);
      case 'GET /login':
        return login(req, res);
      case 'GET /callback':
        return callback(res, url);
      case 'GET /userinfo':
        return userinfo(req, res);
      case 'GET /refresh':
        return refresh(req, res);
      case 'GET /logout':
        return logout(req, res);
      default:
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('Not found');
    }
  };

  handler().catch((e) => {
    if (!res.headersSent) {
      res.writeHead(500, { 'content-type': 'text/plain' });
    }
    res.end(`Internal error: ${e}`);
  });
});

server.listen(PORT, () => {
  console.log(`oidc-client example listening on :${PORT}`);
  console.log(`  issuer (browser):   ${ISSUER}`);
  console.log(`  issuer (internal):  ${INTERNAL}`);
  console.log(`  client_id:          ${CLIENT_ID}`);
  console.log(`  redirect_uri:       ${REDIRECT_URI}`);
});
