import { z } from 'zod';
import { authProcedure, publicProcedure } from '../trpc';

const clientEnv = z
  .object({ TURNSTILE_SITE_KEY: z.string() })
  .parse(process.env);

export const commonProcedures = {
  hasValidSession: publicProcedure.query(async ({ ctx }): Promise<boolean> => {
    return Boolean(ctx.session);
  }),

  getCurrentUser: authProcedure.query(async ({ ctx }) => {
    return {
      id: ctx.session.appUser.id,
      role: ctx.session.appUser.role,
    };
  }),

  getClientEnv: publicProcedure.query(() => clientEnv),
};
