import { prisma } from '@letschurch/db';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import logger from '@/util/logger';
import { authProcedure, router } from '../trpc';

const moduleLogger = logger.child({
  module: 'trpc/procedures/newsletter-lists',
});

const { LISTMONK_INTERNAL_URL, LISTMONK_API_USER, LISTMONK_API_TOKEN } = z
  .object({
    LISTMONK_INTERNAL_URL: z.string().optional(),
    LISTMONK_API_USER: z.string().optional(),
    LISTMONK_API_TOKEN: z.string().optional(),
  })
  .parse(process.env);

const adminProcedure = authProcedure.use(async ({ ctx, next }) => {
  if (ctx.session.appUser.role !== 'ADMIN') {
    moduleLogger.warn('Non-admin user attempted admin action', {
      appUserId: ctx.session.appUserId,
      role: ctx.session.appUser.role,
    });

    throw new TRPCError({ code: 'FORBIDDEN' });
  }

  return next();
});

type ListmonkList = {
  id: number;
  uuid: string;
  name: string;
  type: 'public' | 'private';
  optin: 'single' | 'double';
  tags: string[];
  subscriber_count: number;
  created_at: string;
  updated_at: string;
  description: string;
};

type ListmonkApiResponse = {
  data: {
    results: ListmonkList[];
    total: number;
    per_page: number;
    page: number;
  };
};

export const newsletterListsRouter = router({
  getListmonkLists: adminProcedure.query(async () => {
    moduleLogger.info('Fetching lists from Listmonk');

    if (!LISTMONK_INTERNAL_URL) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Listmonk is not configured',
      });
    }

    if (!LISTMONK_API_USER || !LISTMONK_API_TOKEN) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Listmonk credentials not configured',
      });
    }

    try {
      const response = await fetch(`${LISTMONK_INTERNAL_URL}/api/lists`, {
        headers: {
          Authorization: `Basic ${Buffer.from(`${LISTMONK_API_USER}:${LISTMONK_API_TOKEN}`).toString('base64')}`,
        },
      });

      if (!response.ok) {
        moduleLogger.error('Failed to fetch lists from Listmonk', {
          status: response.status,
          statusText: response.statusText,
        });
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch lists from Listmonk',
        });
      }

      const data = (await response.json()) as ListmonkApiResponse;

      moduleLogger.info('Successfully fetched lists from Listmonk', {
        count: data.data.results.length,
      });

      return data.data.results;
    } catch (error) {
      moduleLogger.error('Error fetching lists from Listmonk', { error });
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch lists from Listmonk',
      });
    }
  }),

  getConfiguredLists: adminProcedure.query(async () => {
    moduleLogger.info('Fetching configured newsletter lists');

    const lists = await prisma.newsletterMailingList.findMany({
      orderBy: {
        name: 'asc',
      },
    });

    moduleLogger.info('Successfully fetched configured lists', {
      count: lists.length,
    });

    return lists;
  }),

  syncListsFromListmonk: adminProcedure.mutation(async () => {
    moduleLogger.info('Syncing lists from Listmonk');

    if (!LISTMONK_INTERNAL_URL) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Listmonk is not configured',
      });
    }

    if (!LISTMONK_API_USER || !LISTMONK_API_TOKEN) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Listmonk credentials not configured',
      });
    }

    try {
      const response = await fetch(`${LISTMONK_INTERNAL_URL}/api/lists`, {
        headers: {
          Authorization: `Basic ${Buffer.from(`${LISTMONK_API_USER}:${LISTMONK_API_TOKEN}`).toString('base64')}`,
        },
      });

      if (!response.ok) {
        moduleLogger.error('Failed to fetch lists from Listmonk', {
          status: response.status,
          statusText: response.statusText,
        });
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch lists from Listmonk',
        });
      }

      const data = (await response.json()) as ListmonkApiResponse;

      // Upsert each list into the database
      const syncedLists = await Promise.all(
        data.data.results.map((list) =>
          prisma.newsletterMailingList.upsert({
            where: { listmonkUuid: list.uuid },
            create: {
              listmonkUuid: list.uuid,
              name: list.name,
              type: list.type === 'public' ? 'PUBLIC' : 'PRIVATE',
              optin: list.optin === 'double' ? 'DOUBLE' : 'SINGLE',
              enabled: false, // Don't auto-enable new lists
              subscribeOnRegistration: false,
            },
            update: {
              name: list.name, // Update name if it changed in Listmonk
              type: list.type === 'public' ? 'PUBLIC' : 'PRIVATE',
              optin: list.optin === 'double' ? 'DOUBLE' : 'SINGLE',
            },
          }),
        ),
      );

      moduleLogger.info('Successfully synced lists from Listmonk', {
        count: syncedLists.length,
      });

      return {
        syncedCount: syncedLists.length,
        lists: syncedLists,
      };
    } catch (error) {
      moduleLogger.error('Error syncing lists from Listmonk', { error });
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to sync lists from Listmonk',
      });
    }
  }),

  updateListConfiguration: adminProcedure
    .input(
      z.object({
        listmonkUuid: z.uuid(),
        enabled: z.boolean().optional(),
        subscribeOnRegistration: z.boolean().optional(),
        type: z.enum(['PUBLIC', 'PRIVATE']).optional(),
        optin: z.enum(['SINGLE', 'DOUBLE']).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      moduleLogger.info('Updating list configuration', { input });

      const updated = await prisma.newsletterMailingList.update({
        where: { listmonkUuid: input.listmonkUuid },
        data: {
          ...(input.enabled !== undefined && { enabled: input.enabled }),
          ...(input.subscribeOnRegistration !== undefined && {
            subscribeOnRegistration: input.subscribeOnRegistration,
          }),
          ...(input.type !== undefined && { type: input.type }),
          ...(input.optin !== undefined && { optin: input.optin }),
        },
      });

      moduleLogger.info('Successfully updated list configuration', {
        listmonkUuid: input.listmonkUuid,
      });

      return updated;
    }),
});
