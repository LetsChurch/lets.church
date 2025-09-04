import { z } from 'zod';
import { publicProcedure } from '../trpc';

const clientEnv = z
  .object({ TURNSTILE_SITE_KEY: z.string() })
  .parse(process.env);

export const commonProcedures = {
  hasValidSession: publicProcedure.query(async ({ ctx }): Promise<boolean> => {
    return Boolean(ctx.session);
  }),

  getClientEnv: publicProcedure.query(() => clientEnv),
};
