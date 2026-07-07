import { createFileRoute } from '@tanstack/react-router';

import logger from '@/util/logger';
import { buildUserClaims } from '@/util/oidc/claims';
import { getClient, type OidcClient } from '@/util/oidc/clients';
import { ACCESS_TOKEN_TTL_SECONDS } from '@/util/oidc/config';
import { verifyPkceS256 } from '@/util/oidc/pkce';
import {
  consumeAuthorizationCode,
  mintAccessToken,
  mintIdToken,
  mintRefreshToken,
  rotateRefreshToken,
} from '@/util/oidc/tokens';

const moduleLogger = logger.child({ module: 'routes/oidc/token' });

const JSON_HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'no-store',
  pragma: 'no-cache',
};

function tokenError(status: number, error: string, description: string) {
  return new Response(
    JSON.stringify({ error, error_description: description }),
    {
      status,
      headers: { ...JSON_HEADERS },
    },
  );
}

// All clients are public (PKCE-only): there is no client secret. The client is
// identified by the `client_id` form parameter, and authenticated by PKCE (for
// the authorization_code grant) and by possession of the refresh token (for the
// refresh_token grant) — both bound to this client_id when issued.
function resolveClient(
  form: URLSearchParams,
): { client: OidcClient } | { error: Response } {
  const clientId = form.get('client_id');
  const client = clientId ? getClient(clientId) : null;
  if (!client) {
    return {
      error: tokenError(400, 'invalid_client', 'Unknown or missing client_id'),
    };
  }
  return { client };
}

async function tokenResponse(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: JSON_HEADERS,
  });
}

export const Route = createFileRoute('/oidc/token')({
  component: () => null,
  server: {
    handlers: {
      POST: async ({ request }) => {
        const form = new URLSearchParams(await request.text());

        const resolved = resolveClient(form);
        if ('error' in resolved) {
          return resolved.error;
        }
        const { client } = resolved;

        const grantType = form.get('grant_type');

        if (grantType === 'authorization_code') {
          const code = form.get('code');
          const redirectUri = form.get('redirect_uri');
          const codeVerifier = form.get('code_verifier');

          if (!code || !redirectUri || !codeVerifier) {
            return tokenError(
              400,
              'invalid_request',
              'Missing code, redirect_uri, or code_verifier',
            );
          }

          const row = await consumeAuthorizationCode(
            code,
            client.clientId,
            redirectUri,
          );
          if (!row) {
            return tokenError(
              400,
              'invalid_grant',
              'Invalid authorization code',
            );
          }

          if (
            !verifyPkceS256(
              codeVerifier,
              row.codeChallenge,
              row.codeChallengeMethod,
            )
          ) {
            return tokenError(400, 'invalid_grant', 'PKCE verification failed');
          }

          const claims =
            (await buildUserClaims(row.appUserId, row.scope)) ?? {};
          const authTime = Math.floor(row.authTime.getTime() / 1000);

          const [idToken, accessToken] = await Promise.all([
            mintIdToken({
              sub: row.appUserId,
              clientId: client.clientId,
              authTime,
              nonce: row.nonce,
              claims,
            }),
            mintAccessToken({
              sub: row.appUserId,
              clientId: client.clientId,
              scope: row.scope,
            }),
          ]);

          const body: Record<string, unknown> = {
            access_token: accessToken,
            token_type: 'Bearer',
            expires_in: ACCESS_TOKEN_TTL_SECONDS,
            id_token: idToken,
            scope: row.scope,
          };

          if (row.scope.split(/\s+/).includes('offline_access')) {
            body.refresh_token = await mintRefreshToken({
              appUserId: row.appUserId,
              clientId: client.clientId,
              scope: row.scope,
              authTime,
            });
          }

          moduleLogger.info(
            { context: { clientId: client.clientId, userId: row.appUserId } },
            'Issued tokens via authorization_code',
          );

          return tokenResponse(body);
        }

        if (grantType === 'refresh_token') {
          const refreshToken = form.get('refresh_token');
          if (!refreshToken) {
            return tokenError(400, 'invalid_request', 'Missing refresh_token');
          }

          const { rotation, newRefreshToken } = await rotateRefreshToken(
            refreshToken,
            client.clientId,
          );

          if (!rotation.ok) {
            if (rotation.reason === 'reuse') {
              moduleLogger.warn(
                { context: { clientId: client.clientId } },
                'Refresh token reuse detected; family revoked',
              );
            }
            return tokenError(400, 'invalid_grant', 'Invalid refresh token');
          }

          const claims =
            (await buildUserClaims(rotation.appUserId, rotation.scope)) ?? {};

          const [idToken, accessToken] = await Promise.all([
            // No nonce on refresh: it belongs to the original authentication.
            mintIdToken({
              sub: rotation.appUserId,
              clientId: client.clientId,
              authTime: rotation.authTime,
              nonce: null,
              claims,
            }),
            mintAccessToken({
              sub: rotation.appUserId,
              clientId: client.clientId,
              scope: rotation.scope,
            }),
          ]);

          return tokenResponse({
            access_token: accessToken,
            token_type: 'Bearer',
            expires_in: ACCESS_TOKEN_TTL_SECONDS,
            id_token: idToken,
            scope: rotation.scope,
            refresh_token: newRefreshToken,
          });
        }

        return tokenError(
          400,
          'unsupported_grant_type',
          'Unsupported grant_type',
        );
      },
    },
  },
});
