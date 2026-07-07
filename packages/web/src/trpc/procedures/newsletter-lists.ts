import { db, NewsletterMailingList } from '@letschurch/db';
import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
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
    moduleLogger.warn(
      {
        appUserId: ctx.session.appUserId,
        context: {
          role: ctx.session.appUser.role,
        },
      },
      'Non-admin user attempted admin action',
    );

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
        moduleLogger.error(
          {
            context: {
              status: response.status,
              statusText: response.statusText,
            },
          },
          'Failed to fetch lists from Listmonk',
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch lists from Listmonk',
        });
      }

      const data = (await response.json()) as ListmonkApiResponse;

      moduleLogger.info(
        {
          context: {
            count: data.data.results.length,
          },
        },
        'Successfully fetched lists from Listmonk',
      );

      return data.data.results;
    } catch (_error) {
      moduleLogger.error('Error fetching lists from Listmonk');
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch lists from Listmonk',
      });
    }
  }),

  getConfiguredLists: adminProcedure.query(async () => {
    moduleLogger.info('Fetching configured newsletter lists');

    const lists = await db.query.NewsletterMailingList.findMany({
      orderBy: (t, { asc }) => [asc(t.name)],
    });

    moduleLogger.info(
      {
        context: {
          count: lists.length,
        },
      },
      'Successfully fetched configured lists',
    );

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
        moduleLogger.error(
          {
            context: {
              status: response.status,
              statusText: response.statusText,
            },
          },
          'Failed to fetch lists from Listmonk',
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch lists from Listmonk',
        });
      }

      const data = (await response.json()) as ListmonkApiResponse;

      // Upsert each list into the database
      const syncedLists = await Promise.all(
        data.data.results.map((list) =>
          db
            .insert(NewsletterMailingList)
            .values({
              listmonkUuid: list.uuid,
              name: list.name,
              type: list.type === 'public' ? 'public' : 'private',
              optin: list.optin === 'double' ? 'double' : 'single',
              enabled: false, // Don't auto-enable new lists
              subscribeOnRegistration: false,
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: NewsletterMailingList.listmonkUuid,
              set: {
                name: list.name, // Update name if it changed in Listmonk
                type: list.type === 'public' ? 'public' : 'private',
                optin: list.optin === 'double' ? 'double' : 'single',
                updatedAt: new Date(),
              },
            })
            .returning()
            .then((r) => {
              const result = r[0];
              if (!result) {
                throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
              }
              return result;
            }),
        ),
      );

      moduleLogger.info(
        {
          context: {
            count: syncedLists.length,
          },
        },
        'Successfully synced lists from Listmonk',
      );

      return {
        syncedCount: syncedLists.length,
        lists: syncedLists,
      };
    } catch (_error) {
      moduleLogger.error('Error syncing lists from Listmonk');
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
        type: z.enum(['public', 'private']).optional(),
        optin: z.enum(['single', 'double']).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      moduleLogger.info('Updating list configuration');

      const [updated] = await db
        .update(NewsletterMailingList)
        .set({
          ...(input.enabled !== undefined && { enabled: input.enabled }),
          ...(input.subscribeOnRegistration !== undefined && {
            subscribeOnRegistration: input.subscribeOnRegistration,
          }),
          ...(input.type !== undefined && { type: input.type }),
          ...(input.optin !== undefined && { optin: input.optin }),
          updatedAt: new Date(),
        })
        .where(eq(NewsletterMailingList.listmonkUuid, input.listmonkUuid))
        .returning();

      moduleLogger.info(
        {
          context: {
            listmonkUuid: input.listmonkUuid,
          },
        },
        'Successfully updated list configuration',
      );

      return updated;
    }),
});
