import { prisma } from '@letschurch/db';
import logger from '@letschurch/util';
import { z } from 'zod';
import { IncomingIdSchema, OutgoingIdSchema } from '@/schemas/common';
import { authProcedure, publicProcedure } from '../trpc';

const moduleLogger = logger.child({
  module: 'trpc/procedures/common',
});

const clientEnv = z
  .object({ TURNSTILE_SITE_KEY: z.string() })
  .parse(process.env);

export const commonProcedures = {
  hasValidSession: publicProcedure.query(async ({ ctx }): Promise<boolean> => {
    const hasSession = Boolean(ctx.session);

    moduleLogger.info('Session validation check', {
      hasSession,
      sessionId: ctx.session?.id,
    });

    return hasSession;
  }),

  getCurrentUser: authProcedure.query(async ({ ctx }) => {
    moduleLogger.info('Current user info requested', {
      appUserId: ctx.session.appUserId,
      role: ctx.session.appUser.role,
    });

    return {
      id: ctx.session.appUser.id,
      role: ctx.session.appUser.role,
    };
  }),

  getClientEnv: publicProcedure.query(() => {
    moduleLogger.info('Client environment requested');
    return clientEnv;
  }),

  lookupSlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const { slug } = input;

      moduleLogger.info('Looking up slug', { slug });

      // Try to parse as an ID first
      const idResult = IncomingIdSchema.safeParse(slug);

      if (idResult.success) {
        // Check if this is a valid upload ID
        const upload = await prisma.uploadRecord.findUnique({
          where: { id: idResult.data },
          select: { id: true },
        });

        if (upload) {
          const outgoingId = OutgoingIdSchema.parse(idResult.data);
          return { type: 'media' as const, id: outgoingId };
        }
      }

      // Try to find a channel with this slug
      const channel = await prisma.channel.findUnique({
        where: { slug },
        select: { slug: true, visibility: true, approvedAt: true },
      });

      if (channel && channel.visibility === 'PUBLIC' && channel.approvedAt) {
        return { type: 'channel' as const, slug };
      }

      return { type: 'not-found' as const };
    }),
};
