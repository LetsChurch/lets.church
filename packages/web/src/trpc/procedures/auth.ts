import { AppUser, AppUserEmail, db } from '@letschurch/db';
import { getRequest, setCookie } from '@tanstack/react-start/server';
import { TRPCError } from '@trpc/server';
import * as argon2 from 'argon2';
import { z } from 'zod';

import { loginSchema, registerSchema } from '@/schemas/auth';
import {
  completeResetPassword,
  postUserRegistration,
  resetPassword,
} from '@/temporal';
import { BannedError, login } from '@/util/auth';
import { createSessionJwt, parsePasswordResetJwt } from '@/util/jwt';
import logger from '@/util/logger';
import { getClientIpAddress } from '@/util/request-ip';
import { generateResetPasswordEmail } from '@/util/reset-password-email';
import { SESSION_COOKIE, sessionCookieOptions } from '@/util/session-cookie';
import { validateTurnstile } from '@/util/turnstile';
import testPassword from '@/util/zxcvbn';

import { anonProcedure } from '../trpc';

const moduleLogger = logger.child({
  module: 'trpc/procedures/auth',
});

type HandleLoginResponse = { error: false } | { error: string };
type HandleRegisterResponse = { error: false } | { error: string };

export const authProcedures = {
  login: anonProcedure
    .input(loginSchema)
    .mutation(
      async ({
        input: { id, password, turnstile },
      }): Promise<HandleLoginResponse> => {
        const clientIp = getClientIpAddress(getRequest().headers);

        moduleLogger.info(
          { context: { userId: id, clientIp } },
          'Login attempt',
        );

        if (!(await validateTurnstile(turnstile, clientIp))) {
          moduleLogger.warn(
            { context: { userId: id, clientIp } },
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
            { context: { userId: id, sessionId: session.id, clientIp } },
            'Login successful',
          );

          return { error: false };
        } catch (e) {
          if (e instanceof BannedError) {
            moduleLogger.warn(
              { context: { userId: id, clientIp } },
              'Login failed - account banned',
            );
            return {
              error: e.reason
                ? `This account has been banned. Reason: ${e.reason}`
                : 'This account has been banned.',
            };
          }

          moduleLogger.warn(
            {
              context: {
                userId: id,
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

      moduleLogger.info(
        {
          context: {
            username: value.username,
            email: value.email,
          },
        },
        'Registration attempt',
      );

      if (!(await validateTurnstile(value.turnstile, clientIp))) {
        moduleLogger.warn(
          {
            context: {
              username: value.username,
              email: value.email,
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
              email: value.email,
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

        const user = await db.transaction(async (tx) => {
          const [newUser] = await tx
            .insert(AppUser)
            .values({
              username: value.username,
              fullName: value.fullName || null,
              password: hash,
              updatedAt: new Date(),
            })
            .returning();
          if (!newUser) {
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
          }
          await tx.insert(AppUserEmail).values({
            email: value.email,
            appUserId: newUser.id,
          });
          return newUser;
        });

        await postUserRegistration(user.id, {
          userId: user.id,
          username: value.username,
          email: value.email,
          subscribeToNewsletter: value.subscribeNewsletter,
        });

        moduleLogger.info(
          {
            context: {
              userId: user.id,
              username: value.username,
              email: value.email,
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
              email: value.email,
              error: e instanceof Error ? e.message : String(e),
            },
          },
          'Registration failed - database error',
        );
        return { error: 'Error registering a new account, please try again!' };
      }
    }),

  forgotPassword: anonProcedure
    .input(
      z.object({
        identifier: z.string().min(1),
        turnstile: z.string(),
      }),
    )
    .mutation(
      async ({ input }): Promise<{ error: false } | { error: string }> => {
        const clientIp = getClientIpAddress(getRequest().headers);

        moduleLogger.info(
          {
            context: {
              identifier: input.identifier,
            },
          },
          'Password reset request',
        );

        if (!(await validateTurnstile(input.turnstile, clientIp))) {
          moduleLogger.warn(
            {
              context: {
                identifier: input.identifier,
              },
            },
            'Password reset failed - invalid CAPTCHA',
          );
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
              where: (t, { eq }) => eq(t.email, input.identifier),
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
              const { text, html } = await generateResetPasswordEmail(
                user.id,
                user.username,
              );

              await resetPassword(
                user.id,
                user.id,
                emailRecord.email,
                text,
                html,
              );

              moduleLogger.info(
                {
                  context: {
                    userId: user.id,
                    identifier: input.identifier,
                  },
                },
                'Password reset email sent',
              );
            } else {
              moduleLogger.warn(
                {
                  context: {
                    userId: user.id,
                    identifier: input.identifier,
                  },
                },
                'Password reset - user has no email',
              );
            }
          } else {
            moduleLogger.info(
              {
                context: {
                  identifier: input.identifier,
                },
              },
              'Password reset - user not found',
            );
          }

          // Generic success message that doesn't leak information
          return { error: false };
        } catch (e) {
          moduleLogger.error(
            {
              context: {
                identifier: input.identifier,
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
        password: z.string().min(6).max(1024),
      }),
    )
    .mutation(async ({ input: { token, password } }) => {
      const _clientIp = getClientIpAddress(getRequest().headers);

      moduleLogger.info('Complete password reset attempt');

      try {
        // Authorize the reset from the signed, purpose-scoped token that was only
        // ever minted in `forgotPassword` and only delivered in the reset email.
        // This must NOT accept the raw AppUserEmail.key: that value is also
        // embedded in the email-verification link, so accepting it here would let
        // anyone who saw a victim's verification link take over the account. The
        // token is signature-verified, expires in 15 minutes, and its `purpose`
        // literal rejects tokens minted for any other flow (session, verification).
        const claims = await parsePasswordResetJwt(token);

        if (!claims) {
          moduleLogger.warn('Password reset failed - invalid or expired token');
          return {
            error: 'Invalid or expired password reset link.',
          };
        }

        const userId = claims.sub;

        // Confirm the user still exists before signaling the reset workflow.
        const user = await db.query.AppUser.findFirst({
          where: (t, { eq }) => eq(t.id, userId),
          columns: { id: true },
        });

        if (!user) {
          moduleLogger.warn('Password reset failed - user not found');
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

        await completeResetPassword(userId, hash);

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
