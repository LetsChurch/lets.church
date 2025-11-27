import { prisma } from '@letschurch/db';
import { z } from 'zod';
import { IncomingIdSchema, OutgoingIdSchema } from '@/schemas/common';
import logger from '@/util/logger';
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

    moduleLogger.info(
      { context: { hasSession, sessionId: ctx.session?.id } },
      'Session validation check',
    );

    return hasSession;
  }),

  getCurrentUser: authProcedure.query(async ({ ctx }) => {
    moduleLogger.info(
      {
        appUserId: ctx.session.appUserId,
        context: { role: ctx.session.appUser.role },
      },
      'Current user info requested',
    );

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

      moduleLogger.info({ context: { slug } }, 'Looking up slug');

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

          moduleLogger.info(
            { uploadId: outgoingId, context: { slug } },
            'Slug resolved to media upload',
          );

          return { type: 'media' as const, id: outgoingId };
        }

        moduleLogger.info(
          { context: { slug, parsedId: idResult.data } },
          'Slug parsed as ID but upload not found',
        );
      }

      // Try to find a channel with this slug
      const channel = await prisma.channel.findUnique({
        where: { slug, deletedAt: null },
        select: {
          slug: true,
          visibility: true,
          approvedAt: true,
          deletedAt: true,
        },
      });

      if (
        channel &&
        channel.visibility === 'PUBLIC' &&
        channel.approvedAt &&
        !channel.deletedAt
      ) {
        moduleLogger.info(
          {
            context: {
              slug,
              visibility: channel.visibility,
              approved: Boolean(channel.approvedAt),
            },
          },
          'Slug resolved to channel',
        );

        return { type: 'channel' as const, slug };
      }

      if (channel) {
        moduleLogger.info(
          {
            context: {
              slug,
              visibility: channel.visibility,
              approved: Boolean(channel.approvedAt),
            },
          },
          'Channel found but not accessible',
        );
      } else {
        moduleLogger.info({ context: { slug } }, 'Slug not found');
      }

      return { type: 'not-found' as const };
    }),
};
