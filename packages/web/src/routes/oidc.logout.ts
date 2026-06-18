import { createFileRoute } from '@tanstack/react-router';
import { deleteCookie } from '@tanstack/react-start/server';
import { getSession } from '@/util/auth';
import {
  clients,
  getClient,
  isRegisteredPostLogoutRedirectUri,
} from '@/util/oidc/clients';
import { verifyIdTokenHint } from '@/util/oidc/tokens';
import {
  clearSessionCookieOptions,
  SESSION_COOKIE,
} from '@/util/session-cookie';

function redirectTo(location: string) {
  return new Response(null, { status: 302, headers: { Location: location } });
}

// RP-initiated logout — the OIDC `end_session_endpoint`, per OpenID Connect
// RP-Initiated Logout 1.0 (https://openid.net/specs/openid-connect-rpinitiated-1_0.html).
// The RP logs the user out by redirecting the browser here, so this is a GET —
// the spec says the endpoint SHOULD support GET and POST; we implement GET.
// Clearing the lets.church session terminates the shared SSO session, so
// subsequent authorize requests re-authenticate.
//
// `id_token_hint` is the spec's RECOMMENDED parameter (the ID Token we issued,
// indicating which End-User session to end). We also use it as the CSRF gate:
// terminating the SSO session is destructive and this is a GET, so we must NOT
// clear on a forged/unauthenticated request (e.g. a cross-site
// `<img src=".../oidc/logout">` or a link prefetcher). We only clear when the
// caller presents an `id_token_hint` that WE signed AND whose subject matches the
// logged-in user — something a cross-site request cannot produce. (The spec's
// Security Considerations note that logout requests without a valid
// `id_token_hint` are a denial-of-service vector and the OP may need to confirm
// the request with the End-User; the hint check is that gate.) The validated
// `post_logout_redirect_uri` is honored either way (allowlisted, non-open
// redirect), so UX for already-logged-out users is intact.
//
// Future: back-channel/front-channel logout to actively terminate satellite
// sessions. That requires per-client logout endpoints + signed logout tokens
// and is intentionally out of scope here.
export const Route = createFileRoute('/oidc/logout')({
  component: () => null,
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const p = url.searchParams;

        const idTokenHint = p.get('id_token_hint');
        const postLogoutRedirectUri = p.get('post_logout_redirect_uri');
        const state = p.get('state');
        const clientId = p.get('client_id');

        const session = await getSession();
        const hintSub = idTokenHint
          ? await verifyIdTokenHint(idTokenHint)
          : null;
        if (session && hintSub && hintSub === session.appUserId) {
          deleteCookie(SESSION_COOKIE, clearSessionCookieOptions);
        }

        if (postLogoutRedirectUri) {
          // The URI must be registered by some client (the one named in
          // client_id if given, otherwise any client).
          const candidates = clientId
            ? [getClient(clientId)].filter((c) => c !== null)
            : clients;
          const allowed = candidates.some((c) =>
            isRegisteredPostLogoutRedirectUri(c, postLogoutRedirectUri),
          );

          if (allowed) {
            const target = new URL(postLogoutRedirectUri);
            if (state) {
              target.searchParams.set('state', state);
            }
            return redirectTo(target.toString());
          }
        }

        return redirectTo('/');
      },
    },
  },
});
