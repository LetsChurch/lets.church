import { createFileRoute } from '@tanstack/react-router';

import { getSession } from '@/util/auth';
import logger from '@/util/logger';
import {
  filterScope,
  getClient,
  isRegisteredRedirectUri,
} from '@/util/oidc/clients';
import { loginPath } from '@/util/oidc/config';
import { mintAuthorizationCode } from '@/util/oidc/tokens';

const moduleLogger = logger.child({ module: 'routes/oidc/authorize' });

function redirectTo(location: string) {
  return new Response(null, { status: 302, headers: { Location: location } });
}

// Bounce an OAuth error back to the client's redirect_uri (only ever called once
// the redirect_uri has been validated against the registered set).
function errorRedirect(
  redirectUri: string,
  error: string,
  description: string,
  state: string | null,
) {
  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  url.searchParams.set('error_description', description);
  if (state) {
    url.searchParams.set('state', state);
  }
  return redirectTo(url.toString());
}

export const Route = createFileRoute('/oidc/authorize')({
  component: () => null,
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const p = url.searchParams;

        const clientId = p.get('client_id');
        const redirectUri = p.get('redirect_uri');
        const state = p.get('state');

        // client_id + redirect_uri must be validated before we are willing to
        // redirect anywhere, otherwise we'd be an open redirector.
        const client = clientId ? getClient(clientId) : null;
        if (!client) {
          return new Response('Unknown client', { status: 400 });
        }
        if (!redirectUri || !isRegisteredRedirectUri(client, redirectUri)) {
          return new Response('Invalid redirect_uri', { status: 400 });
        }

        const responseType = p.get('response_type');
        if (responseType !== 'code') {
          return errorRedirect(
            redirectUri,
            'unsupported_response_type',
            'Only response_type=code is supported',
            state,
          );
        }

        // PKCE is mandatory for every client.
        const codeChallenge = p.get('code_challenge');
        const codeChallengeMethod = p.get('code_challenge_method') ?? 'plain';
        if (!codeChallenge || codeChallengeMethod !== 'S256') {
          return errorRedirect(
            redirectUri,
            'invalid_request',
            'PKCE with code_challenge_method=S256 is required',
            state,
          );
        }

        const scope = filterScope(client, p.get('scope') ?? 'openid');
        const nonce = p.get('nonce');
        const prompt = (p.get('prompt') ?? '').split(/\s+/).filter(Boolean);

        const session = await getSession();

        if (!session) {
          // Silent SSO checks (prompt=none) must not show UI.
          if (prompt.includes('none')) {
            return errorRedirect(
              redirectUri,
              'login_required',
              'No active session',
              state,
            );
          }
          // Bounce to the existing login UI, returning here afterwards.
          const returnTo = url.pathname + url.search;
          return redirectTo(
            `${loginPath}?redirect=${encodeURIComponent(returnTo)}`,
          );
        }

        // First-party clients: consent is implicit, so mint the code directly.
        const code = await mintAuthorizationCode({
          appUserId: session.appUserId,
          clientId: client.clientId,
          redirectUri,
          scope,
          nonce,
          codeChallenge,
          codeChallengeMethod,
          authTime: Math.floor(session.createdAt.getTime() / 1000),
        });

        moduleLogger.info(
          { context: { clientId: client.clientId, userId: session.appUserId } },
          'Issued authorization code',
        );

        const target = new URL(redirectUri);
        target.searchParams.set('code', code);
        if (state) {
          target.searchParams.set('state', state);
        }
        return redirectTo(target.toString());
      },
    },
  },
});
