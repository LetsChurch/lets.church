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
import { login } from '@/util/auth';
import { createSessionJwt, SESSION_EXPIRATION_SECONDS } from '@/util/jwt';
import logger from '@/util/logger';
import { getClientIpAddress } from '@/util/request-ip';
import { generateResetPasswordEmail } from '@/util/reset-password-email';
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

          setCookie('lc-session', await createSessionJwt({ sub: session.id }), {
            sameSite: 'lax',
            maxAge: SESSION_EXPIRATION_SECONDS,
          });

          moduleLogger.info(
            { context: { userId: id, sessionId: session.id, clientIp } },
            'Login successful',
          );

          return { error: false };
        } catch (e) {
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
          // Look up user by username
          const userByUsername = await db.query.AppUser.findFirst({
            where: (t, { eq }) => eq(t.username, input.identifier),
            columns: { id: true, username: true },
            with: {
              emails: {
                columns: { email: true, key: true },
                limit: 1,
              },
            },
          });

          // Look up user by email
          const userByEmail = userByUsername
            ? null
            : await db.query.AppUserEmail.findFirst({
                where: (t, { eq }) => eq(t.email, input.identifier),
                columns: { appUserId: true, email: true, key: true },
              }).then(async (emailRecord) => {
                if (!emailRecord) return null;
                const u = await db.query.AppUser.findFirst({
                  where: (t, { eq }) => eq(t.id, emailRecord.appUserId),
                  columns: { id: true, username: true },
                });
                if (!u) return null;
                return {
                  ...u,
                  emails: [{ email: emailRecord.email, key: emailRecord.key }],
                };
              });

          const user = userByUsername ?? userByEmail;

          // Always return success to avoid leaking user existence
          // But only send email if user exists
          if (user) {
            const emailRecord = user.emails[0];

            if (emailRecord) {
              const { text, html } = generateResetPasswordEmail(
                user.id,
                user.username,
                emailRecord.key,
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
        userId: z.string(),
        password: z.string().min(6),
      }),
    )
    .mutation(async ({ input: { userId, password } }) => {
      const _clientIp = getClientIpAddress(getRequest().headers);

      moduleLogger.info('Complete password reset attempt');

      try {
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
