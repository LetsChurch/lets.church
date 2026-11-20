import { AppUserEmail, AppUserPendingEmail, db } from '@letschurch/db';
import { createFileRoute } from '@tanstack/react-router';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { getSession } from '@/util/auth';
import { sendEmailChangeNotice } from '@/util/email-change-notice';
import logger from '@/util/logger';
import { loginPath } from '@/util/oidc/config';
import { isPendingEmailExpired } from '@/util/pending-email';
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

type EmailChangeResult = 'confirmed' | 'expired' | 'taken' | 'failed';

function profileRedirect(result: EmailChangeResult) {
  return redirectTo(
    `/dashboard/account/profile?${new URLSearchParams({ emailChange: result })}`,
  );
}

async function linkDonations(appUserId: string) {
  // The address is verified either way; a failure here only delays linking
  // donations (the donations page retries the claim).
  try {
    const { claimDonorsForVerifiedUser } = await import('@/donations/identity');
    await claimDonorsForVerifiedUser(appUserId);
  } catch (error) {
    moduleLogger.error(
      {
        appUserId,
        err: error instanceof Error ? error : new Error(String(error)),
      },
      'Verified email, but donation history could not be linked',
    );
  }
}

// The swapped-out address no longer controls the account; tell it, so a
// change made from a stolen session doesn't go unnoticed. Best effort.
async function notifyReplacedAddresses(
  appUserId: string,
  replaced: { username: string; oldEmails: string[]; newEmail: string },
) {
  for (const oldEmail of replaced.oldEmails) {
    try {
      await sendEmailChangeNotice({
        stage: 'confirmed',
        appUserId,
        username: replaced.username,
        oldEmail,
        newEmail: replaced.newEmail,
      });
    } catch (error) {
      moduleLogger.error(
        {
          appUserId,
          err: error instanceof Error ? error : new Error(String(error)),
        },
        'Email changed, but the notice to the old address could not be scheduled',
      );
    }
  }
}

// Swap a confirmed pending address in for the account's current one.
async function confirmPendingEmail(
  appUserId: string,
  pendingId: string,
  key: string,
): Promise<{
  result: EmailChangeResult;
  /** Verified addresses the swap replaced, to notify. */
  replaced?: { username: string; oldEmails: string[]; newEmail: string };
} | null> {
  return db.transaction(async (tx) => {
    const pending = await tx.query.AppUserPendingEmail.findFirst({
      where: (t, { and, eq }) =>
        and(eq(t.id, pendingId), eq(t.appUserId, appUserId), eq(t.key, key)),
    });
    if (!pending) return null;

    // Same lock email sign-in takes, so a sign-in that would create an
    // account for this address can't interleave with the swap.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${pending.email}, 0))`,
    );

    const dropPending = () =>
      tx
        .delete(AppUserPendingEmail)
        .where(eq(AppUserPendingEmail.id, pending.id));

    if (isPendingEmailExpired(pending.createdAt)) {
      await dropPending();
      return { result: 'expired' };
    }

    const holder = await tx.query.AppUserEmail.findFirst({
      where: (t, { eq }) => eq(t.email, pending.email),
      columns: { appUserId: true },
    });
    if (holder && holder.appUserId !== appUserId) {
      // Someone registered the address after the change was requested.
      await dropPending();
      return { result: 'taken' };
    }

    const { releaseDonorEmailForUser } = await import('@/donations/identity');
    const current = await tx.query.AppUserEmail.findMany({
      where: (t, { eq }) => eq(t.appUserId, appUserId),
    });
    for (const row of current) {
      await releaseDonorEmailForUser(tx, appUserId, row.email);
      await tx.delete(AppUserEmail).where(eq(AppUserEmail.id, row.id));
    }
    await tx.insert(AppUserEmail).values({
      appUserId,
      email: pending.email,
      verifiedAt: new Date(),
    });
    await dropPending();
    const user = await tx.query.AppUser.findFirst({
      where: (t, { eq }) => eq(t.id, appUserId),
      columns: { username: true },
    });
    return {
      result: 'confirmed',
      replaced: {
        username: user?.username ?? '',
        oldEmails: current
          .filter((row) => row.verifiedAt && row.email !== pending.email)
          .map((row) => row.email),
        newEmail: pending.email,
      },
    };
  });
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
          // Come back here after signing in, with a password or an email
          // sign-in link to the account's current address (the login page
          // explains this for verify links).
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
          await linkDonations(userIdFull);
          return redirectTo('/');
        }

        // Not an address on the account: maybe a requested email change.
        let change: Awaited<ReturnType<typeof confirmPendingEmail>>;
        try {
          change = await confirmPendingEmail(
            userIdFull,
            emailIdFull,
            emailKeyFull,
          );
        } catch (error) {
          moduleLogger.error(
            {
              appUserId: userIdFull,
              err: error instanceof Error ? error : new Error(String(error)),
            },
            'Could not confirm email change',
          );
          change = { result: 'failed' };
        }
        if (change?.replaced) {
          await linkDonations(userIdFull);
          await notifyReplacedAddresses(userIdFull, change.replaced);
        }
        if (change) return profileRedirect(change.result);

        return redirectTo('/');
      },
    },
  },
});
