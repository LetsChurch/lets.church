import { getWebRequest, setCookie } from '@tanstack/react-start/server';
import * as argon2 from 'argon2';
import { loginSchema, registerSchema } from '@/schemas/auth';
import { postUserRegistration } from '@/temporal';
import { login } from '@/util/auth';
import db from '@/util/db';
import { createSessionJwt } from '@/util/jwt';
import { getClientIpAddress } from '@/util/request-ip';
import { validateTurnstile } from '@/util/turnstile';
import testPassword from '@/util/zxcvbn';
import { anonProcedure } from '../trpc';

type HandleLoginResponse = { error: false } | { error: string };
type HandleRegisterResponse = { error: false } | { error: string };

export const authProcedures = {
  login: anonProcedure
    .input(loginSchema)
    .mutation(
      async ({
        input: { id, password, turnstile },
      }): Promise<HandleLoginResponse> => {
        if (
          !(await validateTurnstile(
            turnstile,
            getClientIpAddress(getWebRequest().headers),
          ))
        ) {
          return { error: 'Invalid CAPTCHA' };
        }

        try {
          const session = await login(id, password);

          setCookie('lc-session', await createSessionJwt({ sub: session.id }), {
            sameSite: 'lax',
          });

          return { error: false };
        } catch (_e) {
          return { error: 'Invalid user id or password' };
        }
      },
    ),

  register: anonProcedure
    .input(registerSchema)
    .mutation(async ({ input: value }): Promise<HandleRegisterResponse> => {
      if (
        !(await validateTurnstile(
          value.turnstile,
          getClientIpAddress(getWebRequest().headers),
        ))
      ) {
        return { error: 'Invalid CAPTCHA' };
      }

      const passwordTest = testPassword(value.password);

      if (passwordTest) {
        return { error: passwordTest };
      }

      try {
        const hash = await argon2.hash(value.password, {
          type: argon2.argon2id,
        });
        const user = await db.appUser.create({
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

        return { error: false };
      } catch (_e) {
        return { error: 'Error registering a new account, please try again!' };
      }
    }),
};
