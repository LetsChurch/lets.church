import { AppSession, AppUser, AppUserEmail, db } from '@letschurch/db';
import { getCookie } from '@tanstack/react-start/server';
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';

import { normalizeAuthEmail } from './auth-token';
import { parseSessionJwt } from './jwt';

/**
 * Thrown by {@link login} when valid credentials belong to a banned account.
 * Distinct from the generic invalid-credentials error so callers can surface a
 * clear "banned" message — this only ever reaches a caller who supplied the
 * correct password, so it doesn't leak account existence to guessers. Carries
 * the admin-supplied ban reason (if any) so it can be shown to the user.
 */
export class BannedError extends Error {
  readonly reason: string | null;

  constructor(reason: string | null = null) {
    super('This account has been banned.');
    this.name = 'BannedError';
    this.reason = reason;
  }
}

export async function login(id: string, password: string) {
  const identifier = id.trim();
  const lookupByUsername = () =>
    db
      .select()
      .from(AppUser)
      .where(eq(AppUser.username, identifier))
      .then((r) => r[0] ?? null);

  const lookupByEmail = () =>
    db
      .select({ appUserId: AppUserEmail.appUserId })
      .from(AppUserEmail)
      .where(eq(AppUserEmail.email, normalizeAuthEmail(identifier)))
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
  const looksLikeEmail = identifier.includes('@');
  const user = looksLikeEmail
    ? ((await lookupByEmail()) ?? (await lookupByUsername()))
    : ((await lookupByUsername()) ?? (await lookupByEmail()));

  if (
    !user ||
    user.deletedAt ||
    !user.password ||
    !(await argon2.verify(user.password, password))
  ) {
    throw new Error('Error logging in. Please try again.');
  }

  if (user.bannedAt) {
    throw new BannedError(user.banReason);
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
        columns: {
          id: true,
          role: true,
          bannedAt: true,
          deletedAt: true,
          statementOfTheologyAcceptedAt: true,
          termsAcceptedAt: true,
        },
      },
    },
  });

  // Treat a banned user as having no session so the ban takes effect on their
  // very next request (role/ban state is read fresh from the DB here), rather
  // than waiting for the session cookie to expire.
  if (session?.appUser?.bannedAt || session?.appUser?.deletedAt) {
    return null;
  }

  return session ?? null;
}
