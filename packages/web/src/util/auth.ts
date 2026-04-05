import { AppSession, AppUser, AppUserEmail, db } from '@letschurch/db';
import { getCookie } from '@tanstack/react-start/server';
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { parseSessionJwt } from './jwt';

export async function login(id: string, password: string) {
  // Find user by username or email
  const userByUsername = await db
    .select()
    .from(AppUser)
    .where(eq(AppUser.username, id))
    .then((r) => r[0] ?? null);

  const userByEmail = userByUsername
    ? null
    : await db
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

  const user = userByUsername ?? userByEmail;

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
    where: (t, { eq, and, gt }) =>
      and(eq(t.id, jwt.sub), gt(t.expiresAt, new Date())),
    with: {
      appUser: {
        columns: { id: true, role: true },
      },
    },
  });

  return session ?? null;
}
