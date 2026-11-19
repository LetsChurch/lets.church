import { AppUserEmail, db } from '@letschurch/db';
import { createFileRoute } from '@tanstack/react-router';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { getSession } from '@/util/auth';
import logger from '@/util/logger';
import { loginPath } from '@/util/oidc/config';
import { uuidTranslator } from '@/util/uuid';

const QuerySchema = z.object({
  userId: z.string(),
  emailId: z.string(),
  emailKey: z.string(),
});

const moduleLogger = logger.child({ module: 'routes/auth/verify' });

function redirectTo(location: string) {
  return new Response(null, { status: 302, headers: { Location: location } });
}

export const Route = createFileRoute('/auth_/verify')({
  component: () => null,
  server: {
    handlers: {
      // Verifying requires being signed in as the account the address is
      // attached to. Clicking the link proves control of the inbox, but not
      // that the clicker set up this account: anyone can register with a
      // stranger's address, and the stranger would then get this email. If
      // a click alone verified the address, the squatter's account would own
      // it (and adopt the stranger's guest donations) while keeping its own
      // password and sessions. Requiring the account's session means only
      // the person who registered can verify; a stranger's click, or a mail
      // scanner's prefetch (no cookies), changes nothing. The stranger can
      // still take the address over through email sign-in, which revokes
      // the squatter's credentials first.
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const parsed = QuerySchema.safeParse(
          Object.fromEntries(
            ['userId', 'emailId', 'emailKey'].map((k) => [
              k,
              url.searchParams.get(k),
            ]),
          ),
        );
        if (!parsed.success) return redirectTo('/');

        let userIdFull: string;
        let emailIdFull: string;
        let emailKeyFull: string;
        try {
          userIdFull = uuidTranslator.toUUID(parsed.data.userId);
          emailIdFull = uuidTranslator.toUUID(parsed.data.emailId);
          emailKeyFull = uuidTranslator.toUUID(parsed.data.emailKey);
        } catch {
          return redirectTo('/');
        }
        // A mangled short id can decode to a non-UUID; don't let it reach
        // Postgres as a 500.
        if (
          ![userIdFull, emailIdFull, emailKeyFull].every(
            (id) => z.uuid().safeParse(id).success,
          )
        ) {
          return redirectTo('/');
        }

        const session = await getSession();
        if (!session) {
          // Come back here after signing in with the account's password.
          return redirectTo(
            `${loginPath}?${new URLSearchParams({
              redirect: `${url.pathname}${url.search}`,
            })}`,
          );
        }
        if (session.appUserId !== userIdFull) return redirectTo('/');

        const result = await db
          .update(AppUserEmail)
          .set({ verifiedAt: new Date() })
          .where(
            and(
              eq(AppUserEmail.id, emailIdFull),
              eq(AppUserEmail.appUserId, userIdFull),
              eq(AppUserEmail.key, emailKeyFull),
            ),
          )
          .returning({ id: AppUserEmail.id });

        if (result.length > 0) {
          // The address is verified either way; a failure here only delays
          // linking donations (the donations page retries the claim).
          try {
            const { claimDonorsForVerifiedUser } =
              await import('@/donations/identity');
            await claimDonorsForVerifiedUser(userIdFull);
          } catch (error) {
            moduleLogger.error(
              {
                appUserId: userIdFull,
                err: error instanceof Error ? error : new Error(String(error)),
              },
              'Verified email, but donation history could not be linked',
            );
          }
        }

        return redirectTo('/');
      },
    },
  },
});
