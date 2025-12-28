import { prisma } from '@letschurch/db';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
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
      : await prisma.channelMembership.findFirst({
          where: {
            appUserId: ctx.session.appUserId,
            channelId: input.channelId,
          },
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
      return prisma.channelImportSource.findMany({
        where: input?.channelId ? { channelId: input.channelId } : undefined,
        include: {
          channel: {
            select: { id: true, name: true, slug: true },
          },
          _count: {
            select: { importRuns: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    }),

  // Admin: Get single import source by ID
  get: adminProcedure
    .input(z.object({ id: importSourceIdSchema }))
    .query(async ({ input }) => {
      const source = await prisma.channelImportSource.findUnique({
        where: { id: input.id },
        include: {
          channel: {
            select: { id: true, name: true, slug: true },
          },
          createdBy: {
            select: { id: true, username: true },
          },
        },
      });

      if (!source) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      return source;
    }),

  // Admin: Create import source
  create: adminProcedure
    .input(importSourceSchema)
    .mutation(async ({ ctx, input }) => {
      const { importHistory, ...sourceData } = input;

      const source = await prisma.channelImportSource.create({
        data: {
          ...sourceData,
          createdById: ctx.session.appUserId,
          deduplicationFields: input.deduplicationFields || [],
        },
      });

      moduleLogger.info('Created import source');

      // If import history provided, trigger historical import first
      if (importHistory && importHistory.length > 0) {
        try {
          await triggerHistoricalImport(source.id, importHistory);
          moduleLogger.info('Triggered historical import', {
            itemCount: importHistory.length,
          });
        } catch (_error) {
          moduleLogger.error('Failed to trigger historical import');
        }
      }

      // Start workflow if enabled
      if (source.enabled) {
        try {
          await startImportSourceScheduler(source.id);
          moduleLogger.info('Started import source scheduler workflow');
        } catch (_error) {
          moduleLogger.error(
            'Failed to start import source scheduler workflow',
          );
        }
      }

      return source;
    }),

  // Admin: Update import source
  update: adminProcedure
    .input(updateImportSourceSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.channelImportSource.findUnique({
        where: { id: input.id },
      });

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      const { importHistory, ...updateData } = input.data;

      const updated = await prisma.channelImportSource.update({
        where: { id: input.id },
        data: {
          ...updateData,
          updatedById: ctx.session.appUserId,
        },
      });

      moduleLogger.info('Updated import source');

      // If import history provided, trigger historical import
      if (importHistory && importHistory.length > 0) {
        try {
          await triggerHistoricalImport(updated.id, importHistory);
          moduleLogger.info('Triggered historical import after update', {
            itemCount: importHistory.length,
          });
        } catch (_error) {
          moduleLogger.error(
            'Failed to trigger historical import after update',
          );
        }
      }

      // Restart workflow if enabled status changed
      if (
        input.data.enabled !== undefined &&
        input.data.enabled !== existing.enabled
      ) {
        try {
          if (updated.enabled) {
            await startImportSourceScheduler(updated.id);
            moduleLogger.info('Started import source scheduler workflow');
          } else {
            await cancelImportSourceScheduler(updated.id);
            moduleLogger.info('Cancelled import source scheduler workflow');
          }
        } catch (_error) {
          moduleLogger.error(
            'Failed to update import source scheduler workflow',
          );
        }
      }

      return updated;
    }),

  // Admin: Delete import source
  delete: adminProcedure
    .input(z.object({ id: importSourceIdSchema }))
    .mutation(async ({ input }) => {
      const source = await prisma.channelImportSource.findUnique({
        where: { id: input.id },
      });

      if (!source) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      // Delete schedule if it exists
      if (source.workflowId) {
        try {
          await deleteImportSourceScheduler(source.id);
          moduleLogger.info('Deleted import source scheduler before deletion');
        } catch (_error) {
          moduleLogger.error('Failed to delete schedule before deletion');
        }
      }

      await prisma.channelImportSource.delete({
        where: { id: input.id },
      });

      moduleLogger.info('Deleted import source');

      return { success: true };
    }),

  // Admin: Pause import source (disable without deleting)
  pause: adminProcedure
    .input(z.object({ id: importSourceIdSchema }))
    .mutation(async ({ input }) => {
      const source = await prisma.channelImportSource.update({
        where: { id: input.id },
        data: { enabled: false, workflowStatus: 'PAUSED' },
      });

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
      const source = await prisma.channelImportSource.update({
        where: { id: input.id },
        data: { enabled: true },
      });

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
      const source = await prisma.channelImportSource.findUnique({
        where: { id: input.id },
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
    const sources = await prisma.channelImportSource.findMany({
      where: { channelId: input.channelId },
      select: {
        id: true,
        url: true,
        lastImportedAt: true,
        lastSuccessfulImportAt: true,
        earliestImportDate: true,
        workflowStatus: true,
        enabled: true,
        _count: {
          select: { importRuns: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return sources;
  }),

  // Admin: Get import run history
  getImportRuns: adminProcedure
    .input(importRunsQuerySchema)
    .query(async ({ input }) => {
      return prisma.channelImportRun.findMany({
        where: { importSourceId: input.importSourceId },
        orderBy: { startedAt: 'desc' },
        take: input.limit,
      });
    }),
});
