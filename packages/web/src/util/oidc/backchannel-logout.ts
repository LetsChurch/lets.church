import logger from '@/util/logger';

import { clients } from './clients';
import { mintLogoutToken } from './tokens';

const moduleLogger = logger.child({ module: 'util/oidc/backchannel-logout' });

/**
 * Tells every first-party client with a back-channel logout endpoint to drop
 * its own sessions for this user (OIDC Back-Channel Logout 1.0). Call it
 * after the transaction that revoked the user's lets.church credentials has
 * committed: revoking refresh tokens alone doesn't end a client's session,
 * because a client like lets.bible keeps its own long-lived session and
 * doesn't re-check with us.
 *
 * Best effort: the targets come from server config (never request data), a
 * failure is logged and doesn't fail the caller, and each call is bounded by
 * a short timeout.
 */
export async function sendBackchannelLogout(appUserId: string) {
  await Promise.all(
    clients.map(async (client) => {
      if (!client.backchannelLogoutUri) return;
      try {
        const logoutToken = await mintLogoutToken({
          sub: appUserId,
          clientId: client.clientId,
        });
        const res = await fetch(client.backchannelLogoutUri, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ logout_token: logoutToken }).toString(),
          redirect: 'error',
          signal: AbortSignal.timeout(5_000),
        });
        if (!res.ok) {
          throw new Error(`back-channel logout responded ${res.status}`);
        }
      } catch (error) {
        moduleLogger.error(
          {
            appUserId,
            context: { clientId: client.clientId },
            err: error instanceof Error ? error : new Error(String(error)),
          },
          'Back-channel logout failed; the client may keep its session',
        );
      }
    }),
  );
}
