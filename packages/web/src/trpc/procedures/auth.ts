import { prisma } from '@letschurch/db';
import { getRequest, setCookie } from '@tanstack/react-start/server';
import * as argon2 from 'argon2';
import { z } from 'zod';
import { loginSchema, registerSchema } from '@/schemas/auth';
import {
  completeResetPassword,
  postUserRegistration,
  resetPassword,
} from '@/temporal';
import { login } from '@/util/auth';
import { createSessionJwt } from '@/util/jwt';
import logger from '@/util/logger';
import { getClientIpAddress } from '@/util/request-ip';
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

        moduleLogger.info('Login attempt', {
          userId: id,
          clientIp,
        });

        if (!(await validateTurnstile(turnstile, clientIp))) {
          moduleLogger.warn('Login failed - invalid CAPTCHA', {
            userId: id,
            clientIp,
          });
          return { error: 'Invalid CAPTCHA' };
        }

        try {
          const session = await login(id, password);

          setCookie('lc-session', await createSessionJwt({ sub: session.id }), {
            sameSite: 'lax',
          });

          moduleLogger.info('Login successful', {
            userId: id,
            sessionId: session.id,
            clientIp,
          });

          return { error: false };
        } catch (e) {
          moduleLogger.warn('Login failed - invalid credentials', {
            userId: id,
            clientIp,
            error: e instanceof Error ? e.message : String(e),
          });
          return { error: 'Invalid user id or password' };
        }
      },
    ),

  register: anonProcedure
    .input(registerSchema)
    .mutation(async ({ input: value }): Promise<HandleRegisterResponse> => {
      const clientIp = getClientIpAddress(getRequest().headers);

      moduleLogger.info('Registration attempt', {
        username: value.username,
        email: value.email,
        clientIp,
      });

      if (!(await validateTurnstile(value.turnstile, clientIp))) {
        moduleLogger.warn('Registration failed - invalid CAPTCHA', {
          username: value.username,
          email: value.email,
          clientIp,
        });
        return { error: 'Invalid CAPTCHA' };
      }

      const passwordTest = testPassword(value.password);

      if (passwordTest) {
        moduleLogger.warn('Registration failed - weak password', {
          username: value.username,
          email: value.email,
          passwordError: passwordTest,
          clientIp,
        });
        return { error: passwordTest };
      }

      try {
        const hash = await argon2.hash(value.password, {
          type: argon2.argon2id,
        });
        const user = await prisma.appUser.create({
          data: {
            username: value.username,
            fullName: value.fullName || null,
            password: hash,
            emails: {
              create: {
                email: value.email,
              },
            },
          },
        });

        await postUserRegistration(user.id, {
          userId: user.id,
          username: value.username,
          email: value.email,
          subscribeToNewsletter: value.subscribeNewsletter,
        });

        moduleLogger.info('Registration successful', {
          userId: user.id,
          username: value.username,
          email: value.email,
          clientIp,
        });

        return { error: false };
      } catch (e) {
        moduleLogger.error('Registration failed - database error', {
          username: value.username,
          email: value.email,
          clientIp,
          error: e instanceof Error ? e.message : String(e),
        });
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

        moduleLogger.info('Password reset request', {
          identifier: input.identifier,
          clientIp,
        });

        if (!(await validateTurnstile(input.turnstile, clientIp))) {
          moduleLogger.warn('Password reset failed - invalid CAPTCHA', {
            identifier: input.identifier,
            clientIp,
          });
          return { error: 'Invalid CAPTCHA' };
        }

        try {
          // Look up user by email or username
          const user = await prisma.appUser.findFirst({
            where: {
              OR: [
                { username: input.identifier },
                {
                  emails: {
                    some: {
                      email: input.identifier,
                    },
                  },
                },
              ],
            },
            select: {
              id: true,
              username: true,
              emails: {
                select: { email: true, key: true },
                take: 1,
              },
            },
          });

          // Always return success to avoid leaking user existence
          // But only send email if user exists
          if (user) {
            const emailRecord = user.emails[0];

            if (emailRecord) {
              const { generateResetPasswordEmail } = await import(
                '@/util/reset-password-email'
              );
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

              moduleLogger.info('Password reset email sent', {
                userId: user.id,
                identifier: input.identifier,
                clientIp,
              });
            } else {
              moduleLogger.warn('Password reset - user has no email', {
                userId: user.id,
                identifier: input.identifier,
                clientIp,
              });
            }
          } else {
            moduleLogger.info('Password reset - user not found', {
              identifier: input.identifier,
              clientIp,
            });
          }

          // Generic success message that doesn't leak information
          return { error: false };
        } catch (e) {
          moduleLogger.error('Password reset failed - error', {
            identifier: input.identifier,
            clientIp,
            error: e instanceof Error ? e.message : String(e),
          });
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
      const clientIp = getClientIpAddress(getRequest().headers);

      moduleLogger.info('Complete password reset attempt', {
        userId,
        clientIp,
      });

      try {
        const passwordError = testPassword(password);
        if (passwordError) {
          moduleLogger.warn('Password reset failed - weak password', {
            userId,
            clientIp,
            passwordError,
          });
          return { error: passwordError };
        }

        const hash = await argon2.hash(password, {
          type: argon2.argon2id,
        });

        await completeResetPassword(userId, hash);

        moduleLogger.info('Password reset completed', {
          userId,
          clientIp,
        });

        return { error: false };
      } catch (e) {
        moduleLogger.error('Complete password reset failed', {
          userId,
          clientIp,
          error: e instanceof Error ? e.message : String(e),
        });
        return {
          error: 'Failed to reset password. Please try again.',
        };
      }
    }),
};
