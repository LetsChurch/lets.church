import { AppSession, AppUser, AppUserEmail, db } from '@letschurch/db';
import { getCookie } from '@tanstack/react-start/server';
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { parseSessionJwt } from './jwt';

export async function login(id: string, password: string) {
  const lookupByUsername = () =>
    db
      .select()
      .from(AppUser)
      .where(eq(AppUser.username, id))
      .then((r) => r[0] ?? null);

  const lookupByEmail = () =>
    db
      .select({ appUserId: AppUserEmail.appUserId })
      .from(AppUserEmail)
      .where(eq(AppUserEmail.email, id))
      .then(async (r) => {
        if (!r[0]) return null;
        return db
          .select()
          .from(AppUser)
          .where(eq(AppUser.id, r[0].appUserId))
          .then((rows) => rows[0] ?? null);
      });

  // Resolve an email-shaped identifier through AppUserEmail *first*. Usernames
  // are not constrained to exclude `@`, so historically a user could set their
  // username to another user's email address and shadow that email at login /
  // password recovery. Looking up the email owner first prevents the shadow.
  const looksLikeEmail = id.includes('@');
  const user = looksLikeEmail
    ? ((await lookupByEmail()) ?? (await lookupByUsername()))
    : ((await lookupByUsername()) ?? (await lookupByEmail()));

  if (!user || !(await argon2.verify(user.password, password))) {
    throw new Error('Error logging in. Please try again.');
  }

  const [session] = await db
    .insert(AppSession)
    .values({ appUserId: user.id, updatedAt: new Date() })
    .returning();

  if (!session) {
    throw new Error('Failed to create session');
  }
  return session;
}

export async function getSession() {
  const cookie = getCookie('lc-session');

  if (!cookie) {
    return null;
  }

  const jwt = await parseSessionJwt(cookie);

  if (!jwt) {
    return null;
  }

  const session = await db.query.AppSession.findFirst({
    // Reject sessions that have been explicitly revoked (logout) in addition to
    // expired ones, so a captured cookie stops working the moment the user logs
    // out rather than at the 30-day expiry.
    where: (t, { eq, and, gt, isNull }) =>
      and(eq(t.id, jwt.sub), gt(t.expiresAt, new Date()), isNull(t.deletedAt)),
    with: {
      appUser: {
        columns: { id: true, role: true },
      },
    },
  });

  return session ?? null;
}
