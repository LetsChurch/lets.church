import { AppUser, AppUserEmail, db } from '@letschurch/db';
import { desc, eq } from 'drizzle-orm';
import { getPublicImageUrl } from '@/util/server-env';

// Resolve the OIDC claims for a user, gated by the granted scopes. `sub` is the
// stable AppUser id and is always present; callers set it as the token subject.
export async function buildUserClaims(
  appUserId: string,
  scope: string,
): Promise<Record<string, unknown> | null> {
  const scopes = new Set(scope.split(/\s+/).filter(Boolean));

  const user = await db.query.AppUser.findFirst({
    where: eq(AppUser.id, appUserId),
    columns: {
      id: true,
      username: true,
      fullName: true,
      avatarPath: true,
    },
  });

  if (!user) {
    return null;
  }

  const claims: Record<string, unknown> = {};

  if (scopes.has('profile')) {
    claims.preferred_username = user.username;
    if (user.fullName) {
      claims.name = user.fullName;
    }
    if (user.avatarPath) {
      claims.picture = getPublicImageUrl(user.avatarPath);
    }
  }

  if (scopes.has('email')) {
    // Prefer a verified email; fall back to the most recently keyed one.
    const email = await db.query.AppUserEmail.findFirst({
      where: eq(AppUserEmail.appUserId, appUserId),
      orderBy: [desc(AppUserEmail.verifiedAt)],
      columns: { email: true, verifiedAt: true },
    });
    if (email) {
      claims.email = email.email;
      claims.email_verified = email.verifiedAt !== null;
    }
  }

  return claims;
}
