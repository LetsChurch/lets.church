import { randomUUID } from 'node:crypto';

import {
  ChannelImportHistoryBatch,
  ChannelImportHistoryItem,
  ChannelImportRun,
  ChannelImportSource,
  db,
  type TransactionClient,
} from '@letschurch/db';
import { TRPCError } from '@trpc/server';
import { count, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import {
  type historicalImportItemSchema,
  importRunsQuerySchema,
  importSourceFilterSchema,
  importSourceIdSchema,
  importSourceSchema,
  updateImportSourceSchema,
} from '@/schemas/dashboard/import-sources';
import {
  cancelImportSourceScheduler,
  deleteImportSourceScheduler,
  startImportSourceScheduler,
  triggerHistoricalImport,
  triggerManualImport,
} from '@/temporal';
import logger from '@/util/logger';

import { authProcedure, router } from '../../trpc';

const moduleLogger = logger.child({
  module: 'trpc/procedures/dashboard/import-sources',
});

// Nine bound values per row yields 4,500 parameters per insert, comfortably
// below PostgreSQL's 65,535 parameter ceiling.
export const HISTORICAL_IMPORT_STAGE_CHUNK_SIZE = 500;

type HistoricalImportItem = z.infer<typeof historicalImportItemSchema>;

type StartupResult = {
  ok: boolean;
  historicalBatchStarted: boolean;
  schedulerStarted: boolean;
  errors: string[];
};

async function stageHistoricalImport(
  tx: TransactionClient,
  importSourceId: string,
  items: HistoricalImportItem[] | undefined,
) {
  if (!items?.length) {
    return null;
  }

  const batchId = randomUUID();
  const [batch] = await tx
    .insert(ChannelImportHistoryBatch)
    .values({
      id: batchId,
      importSourceId,
      totalItems: items.length,
      updatedAt: new Date(),
    })
    .returning();

  if (!batch) {
    throw new Error('Failed to create historical import batch');
  }

  for (
    let offset = 0;
    offset < items.length;
    offset += HISTORICAL_IMPORT_STAGE_CHUNK_SIZE
  ) {
    await tx.insert(ChannelImportHistoryItem).values(
      items
        .slice(offset, offset + HISTORICAL_IMPORT_STAGE_CHUNK_SIZE)
        .map((item, chunkIndex) => ({
          id: randomUUID(),
          batchId,
          importSourceId,
          ordinal: offset + chunkIndex,
          publishedAt: item.publishedAt,
          source: item.source ?? null,
          title: item.title,
          description: item.description ?? null,
          url: item.url ?? null,
        })),
    );
  }

  return batch;
}

export async function startImportSourceWorkflows(
  importSourceId: string,
  historicalBatchId?: string,
): Promise<StartupResult> {
  const source = await db.query.ChannelImportSource.findFirst({
    where: (t, { eq }) => eq(t.id, importSourceId),
  });
  if (!source) {
    throw new TRPCError({ code: 'NOT_FOUND' });
  }

  const retryBatch = historicalBatchId
    ? await db.query.ChannelImportHistoryBatch.findFirst({
        where: (t, { and, eq }) =>
          and(
            eq(t.id, historicalBatchId),
            eq(t.importSourceId, importSourceId),
          ),
      })
    : await db.query.ChannelImportHistoryBatch.findFirst({
        where: (t, { and, eq }) =>
          and(eq(t.importSourceId, importSourceId), eq(t.status, 'FAILED')),
        orderBy: (t, { desc }) => [desc(t.createdAt)],
      });

  const result: StartupResult = {
    ok: true,
    historicalBatchStarted: false,
    schedulerStarted: false,
    errors: [],
  };

  if (retryBatch && retryBatch.status !== 'DONE') {
    try {
      await triggerHistoricalImport(importSourceId, retryBatch.id);
      await db
        .update(ChannelImportHistoryBatch)
        .set({
          status: 'PENDING',
          lastError: null,
          failedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(ChannelImportHistoryBatch.id, retryBatch.id));
      result.historicalBatchStarted = true;
    } catch (error) {
      const message = 'Failed to start historical import workflow';
      await db
        .update(ChannelImportHistoryBatch)
        .set({
          status: 'FAILED',
          lastError: message,
          failedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(ChannelImportHistoryBatch.id, retryBatch.id));
      moduleLogger.error(message, {
        importSourceId,
        batchId: retryBatch.id,
        error,
      });
      result.ok = false;
      result.errors.push(message);
    }
  }

  if (source.enabled && source.workflowStatus !== 'RUNNING') {
    try {
      await startImportSourceScheduler(importSourceId);
      result.schedulerStarted = true;
    } catch (error) {
      const message = 'Failed to start scheduler workflow';
      await db
        .update(ChannelImportSource)
        .set({
          workflowStatus: 'FAILED',
          lastErrorAt: new Date(),
          lastErrorMessage: message,
          updatedAt: new Date(),
        })
        .where(eq(ChannelImportSource.id, importSourceId));
      moduleLogger.error(message, { importSourceId, error });
      result.ok = false;
      result.errors.push(message);
    }
  }

  return result;
}

// Admin-only procedure for managing import sources
const adminProcedure = authProcedure.use(async ({ ctx, next }) => {
  if (!ctx.isSiteAdmin) {
    moduleLogger.warn(
      { appUserId: ctx.session.appUserId },
      'User is not site admin',
    );
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return next();
});

// Channel member procedure for viewing stats
const channelMemberProcedure = authProcedure
  .input(z.object({ channelId: z.string().uuid() }))
  .use(async ({ ctx, input, next }) => {
    // Skip membership query for site admins
    const membership = ctx.isSiteAdmin
      ? null
      : await db.query.ChannelMembership.findFirst({
          where: (t, { and, eq }) =>
            and(
              eq(t.appUserId, ctx.session.appUserId),
              eq(t.channelId, input.channelId),
            ),
        });

    if (!ctx.isSiteAdmin && !membership) {
      moduleLogger.warn(
        { appUserId: ctx.session.appUserId, channelId: input.channelId },
        'User cannot view channel',
      );
      throw new TRPCError({ code: 'FORBIDDEN' });
    }

    return next({ ctx: { ...ctx, membership } });
  });

export const importSourcesRouter = router({
  // Admin: List all import sources (with optional channel filter)
  listAll: adminProcedure
    .input(importSourceFilterSchema)
    .query(async ({ input }) => {
      const channelIdFilter = input?.channelId;
      const sources = await db.query.ChannelImportSource.findMany({
        where: channelIdFilter
          ? (t, { eq }) => eq(t.channelId, channelIdFilter)
          : undefined,
        with: {
          channel: {
            columns: { id: true, name: true, slug: true },
          },
          historicalImportBatches: {
            orderBy: (t, { desc }) => [desc(t.createdAt)],
            limit: 1,
          },
        },
        orderBy: (t, { desc }) => [desc(t.createdAt)],
      });

      const importRunCountRows =
        sources.length > 0
          ? await db
              .select({
                importSourceId: ChannelImportRun.importSourceId,
                cnt: count(),
              })
              .from(ChannelImportRun)
              .where(
                inArray(
                  ChannelImportRun.importSourceId,
                  sources.map((s) => s.id),
                ),
              )
              .groupBy(ChannelImportRun.importSourceId)
          : [];
      const importRunCountMap = new Map(
        importRunCountRows.map((r) => [r.importSourceId, Number(r.cnt)]),
      );

      return sources.map(({ historicalImportBatches, ...source }) => ({
        ...source,
        historicalImportBatch: historicalImportBatches[0] ?? null,
        _count: { importRuns: importRunCountMap.get(source.id) ?? 0 },
      }));
    }),

  // Admin: Get single import source by ID
  get: adminProcedure
    .input(z.object({ id: importSourceIdSchema }))
    .query(async ({ input }) => {
      const source = await db.query.ChannelImportSource.findFirst({
        where: (t, { eq }) => eq(t.id, input.id),
        with: {
          channel: {
            columns: { id: true, name: true, slug: true },
          },
          createdBy: {
            columns: { id: true, username: true },
          },
          historicalImportBatches: {
            orderBy: (t, { desc }) => [desc(t.createdAt)],
            limit: 1,
          },
        },
      });

      if (!source) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      const { historicalImportBatches, ...sourceData } = source;
      return {
        ...sourceData,
        historicalImportBatch: historicalImportBatches[0] ?? null,
      };
    }),

  // Admin: Create import source and durable historical staging atomically.
  create: adminProcedure
    .input(importSourceSchema)
    .mutation(async ({ ctx, input }) => {
      const { importHistory, ...sourceData } = input;
      const { source, batch } = await db.transaction(async (tx) => {
        const [source] = await tx
          .insert(ChannelImportSource)
          .values({
            ...sourceData,
            createdById: ctx.session.appUserId,
            deduplicationFields: input.deduplicationFields || [],
            updatedAt: new Date(),
          })
          .returning();

        if (!source) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        }

        const batch = await stageHistoricalImport(tx, source.id, importHistory);
        return { source, batch };
      });

      moduleLogger.info('Created import source', {
        importSourceId: source.id,
        historicalItemCount: batch?.totalItems ?? 0,
      });

      const startup = await startImportSourceWorkflows(source.id, batch?.id);
      return { ...source, historicalImportBatch: batch, startup };
    }),

  // Admin: Update import source and stage any new history atomically.
  update: adminProcedure
    .input(updateImportSourceSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await db.query.ChannelImportSource.findFirst({
        where: (t, { eq }) => eq(t.id, input.id),
      });

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      const { importHistory, ...updateData } = input.data;
      const { updated, batch } = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(ChannelImportSource)
          .set({
            ...updateData,
            updatedById: ctx.session.appUserId,
            updatedAt: new Date(),
          })
          .where(eq(ChannelImportSource.id, input.id))
          .returning();

        if (!updated) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        }

        const batch = await stageHistoricalImport(
          tx,
          updated.id,
          importHistory,
        );
        return { updated, batch };
      });

      let startup: StartupResult = {
        ok: true,
        historicalBatchStarted: false,
        schedulerStarted: false,
        errors: [],
      };

      if (batch || (updated.enabled && !existing.enabled)) {
        startup = await startImportSourceWorkflows(updated.id, batch?.id);
      } else if (!updated.enabled && existing.enabled) {
        try {
          await cancelImportSourceScheduler(updated.id);
        } catch (error) {
          const message = 'Failed to stop scheduler workflow';
          await db
            .update(ChannelImportSource)
            .set({
              workflowStatus: 'FAILED',
              lastErrorAt: new Date(),
              lastErrorMessage: message,
              updatedAt: new Date(),
            })
            .where(eq(ChannelImportSource.id, updated.id));
          moduleLogger.error(message, {
            importSourceId: updated.id,
            error,
          });
          startup = {
            ok: false,
            historicalBatchStarted: false,
            schedulerStarted: false,
            errors: [message],
          };
        }
      }

      moduleLogger.info('Updated import source', {
        importSourceId: updated.id,
        historicalItemCount: batch?.totalItems ?? 0,
      });
      return { ...updated, historicalImportBatch: batch, startup };
    }),

  // Admin: Retry only workflows whose durable state says startup failed.
  retryWorkflows: adminProcedure
    .input(z.object({ id: importSourceIdSchema }))
    .mutation(async ({ input }) => {
      const startup = await startImportSourceWorkflows(input.id);
      return { success: startup.ok, startup };
    }),

  // Admin: Delete import source
  delete: adminProcedure
    .input(z.object({ id: importSourceIdSchema }))
    .mutation(async ({ input }) => {
      const source = await db.transaction(async (tx) => {
        const source = await tx.query.ChannelImportSource.findFirst({
          where: (t, { eq }) => eq(t.id, input.id),
        });

        if (!source) {
          throw new TRPCError({ code: 'NOT_FOUND' });
        }

        await tx
          .delete(ChannelImportSource)
          .where(eq(ChannelImportSource.id, input.id));

        return source;
      });

      moduleLogger.info('Deleted import source from database');

      // Delete schedule if it exists - after DB transaction completes
      if (source.workflowId) {
        try {
          await deleteImportSourceScheduler(source.id);
          moduleLogger.info('Deleted import source scheduler');
        } catch (_error) {
          moduleLogger.error('Failed to delete import source scheduler');
        }
      }

      return { success: true };
    }),

  // Admin: Pause import source (disable without deleting)
  pause: adminProcedure
    .input(z.object({ id: importSourceIdSchema }))
    .mutation(async ({ input }) => {
      const [source] = await db
        .update(ChannelImportSource)
        .set({
          enabled: false,
          workflowStatus: 'PAUSED',
          updatedAt: new Date(),
        })
        .where(eq(ChannelImportSource.id, input.id))
        .returning();

      if (!source) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      try {
        await cancelImportSourceScheduler(source.id);
        moduleLogger.info('Paused import source');
      } catch (_error) {
        moduleLogger.error('Failed to cancel workflow when pausing');
      }

      return source;
    }),

  // Admin: Resume import source
  resume: adminProcedure
    .input(z.object({ id: importSourceIdSchema }))
    .mutation(async ({ input }) => {
      const [source] = await db
        .update(ChannelImportSource)
        .set({ enabled: true, updatedAt: new Date() })
        .where(eq(ChannelImportSource.id, input.id))
        .returning();

      if (!source) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      try {
        await startImportSourceScheduler(source.id);
        moduleLogger.info('Resumed import source');
      } catch (_error) {
        moduleLogger.error('Failed to start workflow when resuming');
      }

      return source;
    }),

  // Admin: Trigger manual import
  triggerManual: adminProcedure
    .input(z.object({ id: importSourceIdSchema }))
    .mutation(async ({ input }) => {
      const source = await db.query.ChannelImportSource.findFirst({
        where: (t, { eq }) => eq(t.id, input.id),
      });

      if (!source) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      try {
        await triggerManualImport(source.id);
        moduleLogger.info('Triggered manual import');
      } catch (_error) {
        moduleLogger.error('Failed to trigger manual import');
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to trigger manual import',
        });
      }

      return { success: true };
    }),

  // Channel members: View import stats for their channel
  getStats: channelMemberProcedure.query(async ({ input }) => {
    const sources = await db.query.ChannelImportSource.findMany({
      columns: {
        id: true,
        url: true,
        lastImportedAt: true,
        lastSuccessfulImportAt: true,
        earliestImportDate: true,
        workflowStatus: true,
        enabled: true,
      },
      where: (t, { eq }) => eq(t.channelId, input.channelId),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    });

    const importRunCountRows =
      sources.length > 0
        ? await db
            .select({
              importSourceId: ChannelImportRun.importSourceId,
              cnt: count(),
            })
            .from(ChannelImportRun)
            .where(
              inArray(
                ChannelImportRun.importSourceId,
                sources.map((s) => s.id),
              ),
            )
            .groupBy(ChannelImportRun.importSourceId)
        : [];
    const importRunCountMap = new Map(
      importRunCountRows.map((r) => [r.importSourceId, Number(r.cnt)]),
    );

    return sources.map((source) => ({
      ...source,
      _count: { importRuns: importRunCountMap.get(source.id) ?? 0 },
    }));
  }),

  // Admin: Get import run history
  getImportRuns: adminProcedure
    .input(importRunsQuerySchema)
    .query(async ({ input }) => {
      return db.query.ChannelImportRun.findMany({
        where: (t, { eq }) => eq(t.importSourceId, input.importSourceId),
        orderBy: (t, { desc }) => [desc(t.startedAt)],
        limit: input.limit,
      });
    }),
});
