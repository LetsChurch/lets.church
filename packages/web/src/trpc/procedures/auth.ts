import { randomUUID } from 'node:crypto';

import {
  AppSession,
  AppUser,
  AppUserEmail,
  db,
  OidcAuthorizationCode,
  OidcRefreshToken,
  type TransactionClient,
} from '@letschurch/db';
import {
  decryptPayload,
  encryptPayload,
} from '@letschurch/util/server/encrypted-payload';
import type { EncryptedPayload } from '@letschurch/util/server/encrypted-payload-types';
import { getRequest, setCookie } from '@tanstack/react-start/server';
import * as argon2 from 'argon2';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';

import { emailSchema, loginSchema, registerSchema } from '@/schemas/auth';
import { postUserRegistration, sendEmail } from '@/temporal';
import { BannedError, login } from '@/util/auth';
import {
  consumeAuthToken,
  getUsableAuthToken,
  getUsableAuthTokenInTransaction,
  hasUsableAuthToken,
  issueAuthToken,
  normalizeAuthEmail,
  REGISTRATION_TTL_MINUTES,
} from '@/util/auth-token';
import { validateHCaptcha } from '@/util/hcaptcha';
import { createSessionJwt } from '@/util/jwt';
import logger from '@/util/logger';
import { sendBackchannelLogout } from '@/util/oidc/backchannel-logout';
import { sendPasswordResetEmail } from '@/util/password-reset';
import {
  enforcePublicActionRateLimit,
  PUBLIC_ACTION_RATE_LIMIT_MESSAGE,
} from '@/util/public-action-rate-limit';
import {
  generateAccountExistsEmail,
  generateFinishRegistrationEmail,
} from '@/util/registration-email';
import { sendEmailSignInLink } from '@/util/request-email-sign-in';
import { getClientIpAddress } from '@/util/request-ip';
import { safeRedirect } from '@/util/safe-redirect';
import { SESSION_COOKIE, sessionCookieOptions } from '@/util/session-cookie';
import testPassword from '@/util/zxcvbn';

import { anonProcedure } from '../trpc';

const moduleLogger = logger.child({
  module: 'trpc/procedures/auth',
});

type HandleLoginResponse = { error: false } | { error: string };
type HandleRegisterResponse = { error: false } | { error: string };

// The sign-up form, held (encrypted) in the REGISTRATION token until the
// emailed link is used.
const PendingRegistrationSchema = z.object({
  username: z.string(),
  fullName: z.string().nullable(),
  passwordHash: z.string(),
  subscribeNewsletter: z.boolean(),
  acceptedAt: z.iso.datetime(),
});
type PendingRegistration = z.infer<typeof PendingRegistrationSchema>;

/**
 * Ends every way back into an account that existed before an inbox-proven
 * takeover (email sign-in into an unverified account, or password reset):
 * web sessions, first-party OIDC authorization codes and refresh tokens, and
 * optionally the password. Runs before the new session is issued.
 *
 * Relying parties' own sessions (lets.bible's) are ended separately, after
 * the transaction commits, by `sendBackchannelLogout`. Already-issued access
 * tokens (10-minute TTL) are not revoked.
 */
async function revokeAccountCredentials(
  tx: TransactionClient,
  appUserId: string,
  { clearPassword }: { clearPassword: boolean },
) {
  const now = new Date();
  if (clearPassword) {
    await tx
      .update(AppUser)
      .set({ password: null, updatedAt: now })
      .where(eq(AppUser.id, appUserId));
  }
  await tx
    .update(AppSession)
    .set({ deletedAt: now, updatedAt: now })
    .where(
      and(eq(AppSession.appUserId, appUserId), isNull(AppSession.deletedAt)),
    );
  // An unredeemed code would mint a fresh refresh-token family after this.
  await tx
    .delete(OidcAuthorizationCode)
    .where(eq(OidcAuthorizationCode.appUserId, appUserId));
  await tx
    .update(OidcRefreshToken)
    .set({ revokedAt: now })
    .where(
      and(
        eq(OidcRefreshToken.appUserId, appUserId),
        isNull(OidcRefreshToken.revokedAt),
      ),
    );
}

function emailAccountUsername(email: string, userId: string) {
  const prefix =
    email
      .split('@')[0]
      ?.toLowerCase()
      .replaceAll(/[^a-z0-9_-]/g, '')
      .slice(0, 24) || 'member';
  return `${prefix}-${userId.replaceAll('-', '').slice(0, 8)}`;
}

export const authProcedures = {
  login: anonProcedure
    .input(loginSchema)
    .mutation(
      async ({
        input: { id, password, hcaptchaToken },
      }): Promise<HandleLoginResponse> => {
        const clientIp = getClientIpAddress(getRequest().headers);

        moduleLogger.info({ context: { clientIp } }, 'Login attempt');

        if (!(await validateHCaptcha(hcaptchaToken, clientIp))) {
          moduleLogger.warn(
            { context: { clientIp } },
            'Login failed - invalid CAPTCHA',
          );
          return { error: 'Invalid CAPTCHA' };
        }

        try {
          const session = await login(id, password);

          setCookie(
            SESSION_COOKIE,
            await createSessionJwt({ sub: session.id }),
            sessionCookieOptions,
          );

          moduleLogger.info(
            {
              appUserId: session.appUserId,
              context: {
                sessionId: session.id,
                clientIp,
              },
            },
            'Login successful',
          );

          return { error: false };
        } catch (e) {
          if (e instanceof BannedError) {
            moduleLogger.warn(
              { context: { clientIp } },
              'Login failed - account banned',
            );
            return { error: 'This account is not available.' };
          }

          moduleLogger.warn(
            {
              context: {
                clientIp,
                error: e instanceof Error ? e.message : String(e),
              },
            },
            'Login failed - invalid credentials',
          );
          return { error: 'Invalid user id or password' };
        }
      },
    ),

  register: anonProcedure
    .input(registerSchema)
    .mutation(async ({ input: value }): Promise<HandleRegisterResponse> => {
      const clientIp = getClientIpAddress(getRequest().headers);
      const email = normalizeAuthEmail(value.email);

      moduleLogger.info(
        {
          context: {
            username: value.username,
          },
        },
        'Registration attempt',
      );

      if (!(await validateHCaptcha(value.hcaptchaToken, clientIp))) {
        moduleLogger.warn(
          {
            context: {
              username: value.username,
            },
          },
          'Registration failed - invalid CAPTCHA',
        );
        return { error: 'Invalid CAPTCHA' };
      }

      const passwordTest = testPassword(value.password);

      if (passwordTest) {
        moduleLogger.warn(
          {
            context: {
              username: value.username,
              passwordError: passwordTest,
            },
          },
          'Registration failed - weak password',
        );
        return { error: passwordTest };
      }

      // Usernames are public (profile URLs), so saying one is taken leaks
      // nothing. Whether the email has an account is never said here.
      const usernameHolder = await db.query.AppUser.findFirst({
        where: (t, { eq }) => eq(t.username, value.username),
        columns: { id: true },
      });
      if (usernameHolder) {
        return { error: 'Username is already taken' };
      }

      const rateLimit = await enforcePublicActionRateLimit({
        headers: getRequest().headers,
        email,
        kind: 'registration',
      });
      if (!rateLimit.allowed) {
        moduleLogger.warn(
          { context: { limitedBy: rateLimit.limitedBy } },
          'Registration rate limited',
        );
        return { error: PUBLIC_ACTION_RATE_LIMIT_MESSAGE };
      }

      // Nothing is created yet. The address gets a link to finish creating
      // the account, or, if it already has one, an email saying so, and the
      // form shows the same "check your email" result either way. That
      // keeps registration from revealing which addresses are registered,
      // and means only the inbox owner can create an account for an
      // address (no pre-registering someone else's email).
      try {
        const hash = await argon2.hash(value.password, {
          type: argon2.argon2id,
        });
        const registration: PendingRegistration = {
          username: value.username,
          fullName: value.fullName || null,
          passwordHash: hash,
          subscribeNewsletter: value.subscribeNewsletter,
          acceptedAt: new Date().toISOString(),
        };
        // Issued whether or not the address is taken, so both paths do the
        // same work; an unsent token just expires.
        const issued = await issueAuthToken({
          type: 'REGISTRATION',
          email,
          payload: encryptPayload(JSON.stringify(registration)),
          ttlMinutes: REGISTRATION_TTL_MINUTES,
          replaceExisting: false,
        });
        const holder = await db.query.AppUserEmail.findFirst({
          where: (t, { eq }) => eq(t.email, email),
          columns: { id: true },
        });
        const message = {
          from: 'hello@lets.church',
          to: email,
          ...(holder
            ? generateAccountExistsEmail()
            : generateFinishRegistrationEmail({
                token: issued.token,
                username: value.username,
              })),
        };
        await sendEmail(`registration:${issued.id}`, {
          kind: 'encrypted',
          payload: encryptPayload(JSON.stringify(message)),
        });

        moduleLogger.info(
          { context: { username: value.username } },
          'Registration email sent',
        );
        return { error: false };
      } catch (e) {
        moduleLogger.error(
          {
            context: {
              username: value.username,
              error: e instanceof Error ? e.message : String(e),
            },
          },
          'Registration failed',
        );
        return { error: 'Error registering a new account, please try again!' };
      }
    }),

  getRegistrationDetails: anonProcedure
    .input(z.object({ token: z.string().min(32).max(512) }))
    .query(async ({ input }) => ({
      valid: await hasUsableAuthToken(input.token, 'REGISTRATION'),
    })),

  completeRegistration: anonProcedure
    .input(z.object({ token: z.string().min(32).max(512) }))
    .mutation(async ({ input }) => {
      const result = await db.transaction(async (tx) => {
        const available = await getUsableAuthTokenInTransaction(
          tx,
          input.token,
          'REGISTRATION',
        );
        if (!available) return { error: 'invalid' as const };

        // Same lock email sign-in takes, so the two can't both create an
        // account for this address.
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${available.email}, 0))`,
        );
        const record = await consumeAuthToken(tx, input.token, 'REGISTRATION', {
          consumeSiblings: true,
        });
        if (!record) return { error: 'invalid' as const };

        const registration = PendingRegistrationSchema.parse(
          JSON.parse(decryptPayload(record.payload as EncryptedPayload)),
        );

        const holder = await tx.query.AppUserEmail.findFirst({
          where: (t, { eq }) => eq(t.email, record.email),
          columns: { id: true },
        });
        if (holder) return { error: 'exists' as const };

        const usernameHolder = await tx.query.AppUser.findFirst({
          where: (t, { eq }) => eq(t.username, registration.username),
          columns: { id: true },
        });
        if (usernameHolder) {
          return {
            error: 'username' as const,
            username: registration.username,
          };
        }

        const acceptedAt = new Date(registration.acceptedAt);
        const [newUser] = await tx
          .insert(AppUser)
          .values({
            username: registration.username,
            fullName: registration.fullName,
            password: registration.passwordHash,
            statementOfTheologyAcceptedAt: acceptedAt,
            termsAcceptedAt: acceptedAt,
            updatedAt: new Date(),
          })
          .returning({ id: AppUser.id });
        if (!newUser) throw new Error('Failed to create account');
        // Using the emailed link proves the inbox, so the address starts
        // verified.
        await tx.insert(AppUserEmail).values({
          appUserId: newUser.id,
          email: record.email,
          verifiedAt: new Date(),
        });
        const [session] = await tx
          .insert(AppSession)
          .values({ appUserId: newUser.id, updatedAt: new Date() })
          .returning({ id: AppSession.id });
        if (!session) throw new Error('Failed to create session');

        return {
          error: null,
          appUserId: newUser.id,
          sessionId: session.id,
          email: record.email,
          returnTo: record.returnTo,
          registration,
        };
      });

      if (result.error === 'invalid') {
        return {
          error: 'This link is invalid, has expired, or was already used.',
        };
      }
      if (result.error === 'exists') {
        return {
          error:
            'This email address already has an account. Sign in to it instead.',
        };
      }
      if (result.error === 'username') {
        return {
          error: `Someone took the username "${result.username}" after you signed up. Register again with a different username.`,
        };
      }

      setCookie(
        SESSION_COOKIE,
        await createSessionJwt({ sub: result.sessionId }),
        sessionCookieOptions,
      );

      const { claimDonorsForVerifiedUser } =
        await import('@/donations/identity');
      try {
        await claimDonorsForVerifiedUser(result.appUserId);
      } catch (error) {
        moduleLogger.error(
          {
            appUserId: result.appUserId,
            err: error instanceof Error ? error : new Error(String(error)),
          },
          'Registered, but donation history could not be linked',
        );
      }

      if (result.registration.subscribeNewsletter) {
        try {
          await postUserRegistration(result.appUserId, {
            userId: result.appUserId,
            username: result.registration.username,
            email: result.email,
            subscribeToNewsletter: true,
            sendVerification: false,
          });
        } catch (error) {
          moduleLogger.error(
            {
              appUserId: result.appUserId,
              err: error instanceof Error ? error : new Error(String(error)),
            },
            'Registration follow-up could not be scheduled',
          );
        }
      }

      moduleLogger.info(
        { appUserId: result.appUserId },
        'Registration completed',
      );
      return {
        error: false as const,
        redirect: safeRedirect(result.returnTo ?? undefined) ?? '/',
      };
    }),

  requestEmailSignIn: anonProcedure
    .input(
      z.object({
        email: emailSchema,
        redirect: z.string().max(2_048).optional(),
        hcaptchaToken: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const clientIp = getClientIpAddress(getRequest().headers);
      if (!(await validateHCaptcha(input.hcaptchaToken, clientIp))) {
        return { error: 'Invalid CAPTCHA' };
      }

      const email = normalizeAuthEmail(input.email);
      const rateLimit = await enforcePublicActionRateLimit({
        headers: getRequest().headers,
        email,
        kind: 'email-sign-in',
      });
      if (!rateLimit.allowed) {
        moduleLogger.warn(
          {
            context: {
              limitedBy: rateLimit.limitedBy,
              retryAfterSeconds: rateLimit.retryAfterSeconds,
            },
          },
          'Email sign-in request rate limited',
        );
        return { error: PUBLIC_ACTION_RATE_LIMIT_MESSAGE };
      }
      const emailRecord = await db.query.AppUserEmail.findFirst({
        where: (table, { eq }) => eq(table.email, email),
        columns: { appUserId: true },
      });

      try {
        await sendEmailSignInLink({
          email,
          appUserId: emailRecord?.appUserId ?? null,
          returnTo: safeRedirect(input.redirect) ?? null,
        });
        return { error: false as const };
      } catch (error) {
        moduleLogger.error(
          {
            err: error instanceof Error ? error : new Error(String(error)),
          },
          'Failed to send email sign-in link',
        );
        return {
          error: 'We could not send the sign-in email. Try again shortly.',
        };
      }
    }),

  completeEmailSignIn: anonProcedure
    .input(
      z.object({
        token: z.string().min(32).max(512),
      }),
    )
    .mutation(async ({ input }) => {
      const result = await db.transaction(async (tx) => {
        const availableToken = await getUsableAuthTokenInTransaction(
          tx,
          input.token,
          'EMAIL_SIGN_IN',
        );
        if (!availableToken) return null;

        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${availableToken.email}, 0))`,
        );

        const tokenRecord = await consumeAuthToken(
          tx,
          input.token,
          'EMAIL_SIGN_IN',
          { consumeSiblings: true },
        );
        if (!tokenRecord) return null;

        let emailRecord = await tx.query.AppUserEmail.findFirst({
          where: (table, { eq }) => eq(table.email, tokenRecord.email),
        });
        const existingAppUserId = emailRecord?.appUserId;
        let user = existingAppUserId
          ? await tx.query.AppUser.findFirst({
              where: (table, { eq }) => eq(table.id, existingAppUserId),
            })
          : null;

        if (!emailRecord) {
          const userId = randomUUID();
          const donor = await tx.query.DonationDonor.findFirst({
            where: (table, { eq }) => eq(table.email, tokenRecord.email),
            columns: { name: true },
          });
          const [newUser] = await tx
            .insert(AppUser)
            .values({
              id: userId,
              username: emailAccountUsername(tokenRecord.email, userId),
              password: null,
              fullName: donor?.name ?? null,
              updatedAt: new Date(),
            })
            .returning();
          if (!newUser) {
            throw new Error('Failed to create account');
          }
          const [newEmail] = await tx
            .insert(AppUserEmail)
            .values({
              appUserId: newUser.id,
              email: tokenRecord.email,
              verifiedAt: new Date(),
            })
            .returning();
          if (!newEmail) {
            throw new Error('Failed to create account email');
          }
          user = newUser;
          emailRecord = newEmail;
        }

        if (!user || user.deletedAt) {
          return { denied: true as const, reason: null };
        }
        if (user.bannedAt) return { denied: true as const, reason: null };

        // Set when this sign-in removed a password the account had, so the
        // page can say so instead of the next password login failing
        // unexplained.
        let passwordCleared = false;
        let credentialsRevoked = false;
        if (!emailRecord.verifiedAt) {
          // An unverified address proves nothing about who set up this
          // account: anyone can type a stranger's email into register or
          // their profile. Whoever holds this token has now proven control
          // of the inbox, so they take the account over the same way a
          // password reset does: every credential the account had before is
          // revoked, so if a squatter created it they lose all access. A
          // legitimate holder who never verified just lands in their own
          // account and can set a new password from account security.
          await revokeAccountCredentials(tx, user.id, { clearPassword: true });
          await tx
            .update(AppUserEmail)
            .set({ verifiedAt: new Date() })
            .where(eq(AppUserEmail.id, emailRecord.id));
          passwordCleared = user.password !== null;
          credentialsRevoked = true;
        }

        const [session] = await tx
          .insert(AppSession)
          .values({ appUserId: user.id, updatedAt: new Date() })
          .returning({ id: AppSession.id });
        if (!session) {
          throw new Error('Failed to create session');
        }
        return {
          denied: false as const,
          appUserId: user.id,
          sessionId: session.id,
          returnTo: tokenRecord.returnTo,
          passwordCleared,
          credentialsRevoked,
        };
      });

      if (!result) {
        return { error: 'This sign-in link is invalid or has expired.' };
      }
      if (result.denied) {
        return { error: 'This account is not available.' };
      }

      setCookie(
        SESSION_COOKIE,
        await createSessionJwt({ sub: result.sessionId }),
        sessionCookieOptions,
      );
      if (result.credentialsRevoked) {
        // The new lets.bible session (if any) is created after this, so only
        // sessions from before the takeover are dropped.
        await sendBackchannelLogout(result.appUserId);
      }
      const { claimDonorsForVerifiedUser } =
        await import('@/donations/identity');
      try {
        await claimDonorsForVerifiedUser(result.appUserId);
      } catch (error) {
        moduleLogger.error(
          {
            appUserId: result.appUserId,
            err: error instanceof Error ? error : new Error(String(error)),
          },
          'Signed in, but donation history could not be linked',
        );
      }

      return {
        error: false as const,
        redirect: safeRedirect(result.returnTo ?? undefined) ?? '/',
        passwordCleared: result.passwordCleared,
      };
    }),

  getEmailSignInDetails: anonProcedure
    .input(z.object({ token: z.string().min(32).max(512) }))
    .query(async ({ input }) => {
      const tokenRecord = await getUsableAuthToken(
        input.token,
        'EMAIL_SIGN_IN',
      );
      if (!tokenRecord) return { valid: false as const };

      // Warn up front when continuing will be a takeover that removes a
      // password (see completeEmailSignIn). Only the inbox owner holds this
      // token, so telling them about the account on their own address leaks
      // nothing new.
      const emailRecord = await db.query.AppUserEmail.findFirst({
        where: (t, { eq }) => eq(t.email, tokenRecord.email),
        columns: { verifiedAt: true },
        with: { appUser: { columns: { password: true } } },
      });
      const removesPassword = Boolean(
        emailRecord && !emailRecord.verifiedAt && emailRecord.appUser?.password,
      );

      return { valid: true as const, removesPassword };
    }),

  forgotPassword: anonProcedure
    .input(
      z.object({
        identifier: z.string().trim().min(1),
        hcaptchaToken: z.string().min(1),
      }),
    )
    .mutation(
      async ({ input }): Promise<{ error: false } | { error: string }> => {
        const clientIp = getClientIpAddress(getRequest().headers);

        moduleLogger.info('Password reset request');

        if (!(await validateHCaptcha(input.hcaptchaToken, clientIp))) {
          moduleLogger.warn('Password reset failed - invalid CAPTCHA');
          return { error: 'Invalid CAPTCHA' };
        }

        try {
          const lookupByUsername = () =>
            db.query.AppUser.findFirst({
              where: (t, { eq }) => eq(t.username, input.identifier),
              columns: { id: true, username: true },
              with: {
                emails: {
                  columns: { email: true },
                  limit: 1,
                },
              },
            }).then((u) => u ?? null);

          const lookupByEmail = () =>
            db.query.AppUserEmail.findFirst({
              where: (t, { eq }) =>
                eq(t.email, normalizeAuthEmail(input.identifier)),
              columns: { appUserId: true, email: true },
            }).then(async (emailRecord) => {
              if (!emailRecord) return null;
              const u = await db.query.AppUser.findFirst({
                where: (t, { eq }) => eq(t.id, emailRecord.appUserId),
                columns: { id: true, username: true },
              });
              if (!u) return null;
              return {
                ...u,
                emails: [{ email: emailRecord.email }],
              };
            });

          // Resolve an email-shaped identifier through AppUserEmail first (same
          // as login): otherwise a user who set their username to a victim's
          // email would shadow the victim here, and the reset email would go to
          // the shadower's own address — hijacking/denying the victim's reset.
          const looksLikeEmail = input.identifier.includes('@');
          const user = looksLikeEmail
            ? ((await lookupByEmail()) ?? (await lookupByUsername()))
            : ((await lookupByUsername()) ?? (await lookupByEmail()));

          // Always return success to avoid leaking user existence
          // But only send email if user exists
          if (user) {
            const emailRecord = user.emails[0];

            if (emailRecord) {
              await sendPasswordResetEmail({
                userId: user.id,
                username: user.username,
                email: emailRecord.email,
              });

              moduleLogger.info(
                {
                  context: {
                    userId: user.id,
                  },
                },
                'Password reset email sent',
              );
            } else {
              moduleLogger.warn(
                {
                  context: {
                    userId: user.id,
                  },
                },
                'Password reset - user has no email',
              );
            }
          } else {
            moduleLogger.info('Password reset - user not found');
          }

          // Generic success message that doesn't leak information
          return { error: false };
        } catch (e) {
          moduleLogger.error(
            {
              context: {
                error: e instanceof Error ? e.message : String(e),
              },
            },
            'Password reset failed - error',
          );
          return {
            error:
              'An error occurred processing your request. Please try again.',
          };
        }
      },
    ),

  completeResetPassword: anonProcedure
    .input(
      z.object({
        token: z.string().min(1),
        password: z.string().min(8).max(1024),
      }),
    )
    .mutation(async ({ input: { token, password } }) => {
      const _clientIp = getClientIpAddress(getRequest().headers);

      moduleLogger.info('Complete password reset attempt');

      try {
        if (!(await hasUsableAuthToken(token, 'PASSWORD_RESET'))) {
          moduleLogger.warn('Password reset failed - invalid or expired token');
          return {
            error: 'Invalid or expired password reset link.',
          };
        }

        const passwordError = testPassword(password);
        if (passwordError) {
          moduleLogger.warn('Password reset failed - weak password');
          return { error: passwordError };
        }

        const hash = await argon2.hash(password, {
          type: argon2.argon2id,
        });

        const reset = await db.transaction(async (tx) => {
          const tokenRecord = await consumeAuthToken(
            tx,
            token,
            'PASSWORD_RESET',
          );
          if (!tokenRecord?.appUserId) return false;

          const user = await tx.query.AppUser.findFirst({
            where: (table, { eq }) => eq(table.id, tokenRecord.appUserId!),
            columns: { id: true, deletedAt: true },
          });
          const emailRecord = await tx.query.AppUserEmail.findFirst({
            where: (table, { and, eq }) =>
              and(
                eq(table.appUserId, tokenRecord.appUserId!),
                eq(table.email, tokenRecord.email),
              ),
            columns: { id: true },
          });
          if (!user || user.deletedAt || !emailRecord) return false;

          await tx
            .update(AppUser)
            .set({ password: hash, updatedAt: new Date() })
            .where(eq(AppUser.id, user.id));
          await tx
            .update(AppUserEmail)
            .set({ verifiedAt: new Date() })
            .where(eq(AppUserEmail.id, emailRecord.id));
          await revokeAccountCredentials(tx, user.id, {
            clearPassword: false,
          });
          return { appUserId: user.id };
        });
        if (!reset) {
          return { error: 'Invalid or expired password reset link.' };
        }
        await sendBackchannelLogout(reset.appUserId);

        moduleLogger.info('Password reset completed');

        return { error: false };
      } catch (e) {
        moduleLogger.error(
          {
            context: {
              error: e instanceof Error ? e.message : String(e),
            },
          },
          'Complete password reset failed',
        );
        return {
          error: 'Failed to reset password. Please try again.',
        };
      }
    }),
};
