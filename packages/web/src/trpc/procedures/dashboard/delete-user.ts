import {
  AppSession,
  AppUser,
  db,
  OidcAuthorizationCode,
  OidcRefreshToken,
} from '@letschurch/db';
import { TRPCError } from '@trpc/server';
import { and, eq, isNull } from 'drizzle-orm';

export async function deleteUserAccount({
  actingAdminId,
  appUserId,
}: {
  actingAdminId: string;
  appUserId: string;
}) {
  if (appUserId === actingAdminId) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'You cannot delete yourself.',
    });
  }

  await db.transaction(async (tx) => {
    const deletedAt = new Date();
    const [deletedUser] = await tx
      .update(AppUser)
      .set({ deletedAt, updatedAt: deletedAt })
      .where(and(eq(AppUser.id, appUserId), isNull(AppUser.deletedAt)))
      .returning({ id: AppUser.id });

    if (!deletedUser) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    await tx
      .update(AppSession)
      .set({ deletedAt })
      .where(
        and(eq(AppSession.appUserId, appUserId), isNull(AppSession.deletedAt)),
      );

    await tx
      .delete(OidcAuthorizationCode)
      .where(eq(OidcAuthorizationCode.appUserId, appUserId));

    await tx
      .update(OidcRefreshToken)
      .set({ revokedAt: deletedAt })
      .where(
        and(
          eq(OidcRefreshToken.appUserId, appUserId),
          isNull(OidcRefreshToken.revokedAt),
        ),
      );
  });
}
