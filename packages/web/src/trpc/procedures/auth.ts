import { prisma } from '@letschurch/db';
import logger from '@letschurch/util';
import { getRequest, setCookie } from '@tanstack/react-start/server';
import * as argon2 from 'argon2';
import { loginSchema, registerSchema } from '@/schemas/auth';
import { postUserRegistration } from '@/temporal';
import { login } from '@/util/auth';
import { createSessionJwt } from '@/util/jwt';
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
};
