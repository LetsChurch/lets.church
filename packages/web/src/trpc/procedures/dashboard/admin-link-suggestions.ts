import {
  db,
  OrganizationChannelAssociation,
  OrganizationChannelLinkSuggestion,
} from '@letschurch/db';
import { findOrganizationChannelLinkSuggestions } from '@letschurch/temporal/util/org-channel-link-suggestions';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import logger from '@/util/logger';

import { authProcedure, router } from '../../trpc';

const moduleLogger = logger.child({
  module: 'trpc/procedures/dashboard/admin-link-suggestions',
});

const adminProcedure = authProcedure.use(async ({ ctx, next }) => {
  if (ctx.session.appUser.role !== 'ADMIN') {
    moduleLogger.warn(
      {
        appUserId: ctx.session.appUserId,
        context: { role: ctx.session.appUser.role },
      },
      'Non-admin user attempted admin link suggestion action',
    );
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return next();
});

const pairSchema = z.object({
  organizationId: z.string().uuid(),
  channelId: z.string().uuid(),
});

export const adminLinkSuggestionsRouter = router({
  list: adminProcedure.query(() => findOrganizationChannelLinkSuggestions()),

  link: adminProcedure
    .input(pairSchema.extend({ officialChannel: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      // Re-check against the live suggestion set so this can't be used to link
      // arbitrary pairs (e.g. a private or unapproved channel) by id.
      const suggestions = await findOrganizationChannelLinkSuggestions();
      const suggestion = suggestions.find(
        (s) =>
          s.organization.id === input.organizationId &&
          s.channel.id === input.channelId,
      );
      if (!suggestion) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Suggestion not found; it may already be linked',
        });
      }

      await db
        .insert(OrganizationChannelAssociation)
        .values({
          organizationId: input.organizationId,
          channelId: input.channelId,
          officialChannel: input.officialChannel,
          updatedAt: new Date(),
        })
        .onConflictDoNothing();

      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          channelId: input.channelId,
          organizationId: input.organizationId,
          context: { officialChannel: input.officialChannel },
        },
        'Linked suggested channel to organization',
      );

      return { success: true };
    }),

  dismiss: adminProcedure.input(pairSchema).mutation(async ({ ctx, input }) => {
    const now = new Date();
    await db
      .insert(OrganizationChannelLinkSuggestion)
      .values({
        organizationId: input.organizationId,
        channelId: input.channelId,
        dismissedAt: now,
        dismissedById: ctx.session.appUserId,
      })
      .onConflictDoUpdate({
        target: [
          OrganizationChannelLinkSuggestion.organizationId,
          OrganizationChannelLinkSuggestion.channelId,
        ],
        set: { dismissedAt: now, dismissedById: ctx.session.appUserId },
      });

    moduleLogger.info(
      {
        appUserId: ctx.session.appUserId,
        channelId: input.channelId,
        organizationId: input.organizationId,
      },
      'Dismissed organization/channel link suggestion',
    );

    return { success: true };
  }),
});
