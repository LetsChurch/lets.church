import { randomUUID } from 'node:crypto';

import { AppSession, AppUser, AppUserEmail, db } from '@letschurch/db';
import { getRequest, setCookie } from '@tanstack/react-start/server';
import { TRPCError } from '@trpc/server';
import * as argon2 from 'argon2';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { emailSchema, loginSchema, registerSchema } from '@/schemas/auth';
import { postUserRegistration } from '@/temporal';
import { BannedError, login } from '@/util/auth';
import {
  consumeAuthToken,
  getUsableAuthToken,
  getUsableAuthTokenInTransaction,
  hasUsableAuthToken,
  normalizeAuthEmail,
} from '@/util/auth-token';
import { validateHCaptcha } from '@/util/hcaptcha';
import { createSessionJwt } from '@/util/jwt';
import logger from '@/util/logger';
import { sendPasswordResetEmail } from '@/util/password-reset';
import {
  enforcePublicActionRateLimit,
  PUBLIC_ACTION_RATE_LIMIT_MESSAGE,
} from '@/util/public-action-rate-limit';
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

      try {
        const hash = await argon2.hash(value.password, {
          type: argon2.argon2id,
        });
        const acceptedAt = new Date();

        const registration = await db.transaction(async (tx) => {
          const [newUser] = await tx
            .insert(AppUser)
            .values({
              username: value.username,
              fullName: value.fullName || null,
              password: hash,
              statementOfTheologyAcceptedAt: acceptedAt,
              termsAcceptedAt: acceptedAt,
              updatedAt: new Date(),
            })
            .returning();
          if (!newUser) {
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
          }
          await tx.insert(AppUserEmail).values({
            email,
            appUserId: newUser.id,
          });
          const [newSession] = await tx
            .insert(AppSession)
            .values({ appUserId: newUser.id, updatedAt: new Date() })
            .returning({ id: AppSession.id });
          if (!newSession) {
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
          }
          return { user: newUser, session: newSession };
        });
        setCookie(
          SESSION_COOKIE,
          await createSessionJwt({ sub: registration.session.id }),
          sessionCookieOptions,
        );

        try {
          await postUserRegistration(registration.user.id, {
            userId: registration.user.id,
            username: value.username,
            email,
            subscribeToNewsletter: value.subscribeNewsletter,
          });
        } catch (error) {
          moduleLogger.error(
            {
              appUserId: registration.user.id,
              err: error instanceof Error ? error : new Error(String(error)),
            },
            'Registration follow-up could not be scheduled',
          );
        }

        moduleLogger.info(
          {
            appUserId: registration.user.id,
            context: {
              username: value.username,
            },
          },
          'Registration successful',
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
          'Registration failed - database error',
        );
        return { error: 'Error registering a new account, please try again!' };
      }
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
        } else if (!emailRecord.verifiedAt) {
          await tx
            .update(AppUserEmail)
            .set({ verifiedAt: new Date() })
            .where(eq(AppUserEmail.id, emailRecord.id));
        }

        if (!user || user.deletedAt) {
          return { denied: true as const, reason: null };
        }
        if (user.bannedAt) return { denied: true as const, reason: null };

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

      return { valid: true as const };
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
          await tx
            .update(AppSession)
            .set({ deletedAt: new Date(), updatedAt: new Date() })
            .where(eq(AppSession.appUserId, user.id));
          return true;
        });
        if (!reset) {
          return { error: 'Invalid or expired password reset link.' };
        }

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
