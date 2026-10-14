import {
  db,
  StorageLocationPolicy,
  StorageMove,
  UploadRecord,
} from '@letschurch/db';
import { isStorageLocationId } from '@letschurch/s3/locations';
import {
  planRebalance,
  type RebalanceGoal,
} from '@letschurch/temporal/storage/rebalance';
import { getLocationCandidates } from '@letschurch/temporal/storage/usage';
import { TRPCError } from '@trpc/server';
import { and, count, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { z } from 'zod';

import {
  signalRebalance,
  startMoveOwnerImages,
  startMoveUploadRecord,
  startRebalanceStorage,
} from '@/temporal';
import logger from '@/util/logger';

import { authProcedure, router } from '../../trpc';

const moduleLogger = logger.child({
  module: 'trpc/procedures/dashboard/admin-storage',
});

const adminProcedure = authProcedure.use(async ({ ctx, next }) => {
  if (ctx.session.appUser.role !== 'ADMIN') {
    moduleLogger.warn(
      {
        appUserId: ctx.session.appUserId,
        context: { role: ctx.session.appUser.role },
      },
      'Non-admin user attempted admin storage action',
    );
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return next();
});

const locationIdSchema = z
  .string()
  .regex(/^[a-z0-9]+$/)
  .refine(isStorageLocationId, { message: 'Unknown storage location' });

const graceHoursSchema = z
  .number()
  .min(0)
  .max(24 * 14)
  .default(24);

const goalSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('bytes'), bytes: z.string().regex(/^\d+$/) }),
  z.object({ type: z.literal('percent'), percent: z.number().min(0).max(100) }),
  z.object({ type: z.literal('all') }),
]);

function bytesString(value: bigint | null): string | null {
  return value === null ? null : value.toString();
}

export const adminStorageRouter = router({
  /** Every env-configured location with its policy, caps and usage. */
  listLocations: adminProcedure.query(async () => {
    const [candidates, parked, moving] = await Promise.all([
      getLocationCandidates(),
      db
        .select({ location: UploadRecord.storageLocation, n: count() })
        .from(UploadRecord)
        .where(isNotNull(UploadRecord.storageWaitingSince))
        .groupBy(UploadRecord.storageLocation),
      db
        .select({ location: UploadRecord.storageLocation, n: count() })
        .from(UploadRecord)
        .where(isNotNull(UploadRecord.storageMoveId))
        .groupBy(UploadRecord.storageLocation),
    ]);
    const parkedBy = new Map(parked.map((r) => [r.location, r.n]));
    const movingBy = new Map(moving.map((r) => [r.location, r.n]));

    return candidates.map((c) => ({
      id: c.id,
      complete: c.complete,
      weight: c.weight,
      acceptingUploads: c.acceptingUploads,
      ingest: {
        used: c.usage.ingestUsed.toString(),
        max: bytesString(c.ingestMax),
      },
      public: {
        used: c.usage.publicUsed.toString(),
        reserved: c.usage.publicReserved.toString(),
        max: bytesString(c.publicMax),
      },
      publicRatio: c.usage.publicRatio,
      parkedRecords: parkedBy.get(c.id) ?? 0,
      movingRecords: movingBy.get(c.id) ?? 0,
    }));
  }),

  updatePolicy: adminProcedure
    .input(
      z.object({
        locationId: locationIdSchema,
        weight: z.number().int().min(0).max(1000),
        acceptingUploads: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await db
        .insert(StorageLocationPolicy)
        .values({ ...input, updatedById: ctx.session.appUserId })
        .onConflictDoUpdate({
          target: StorageLocationPolicy.locationId,
          set: {
            weight: input.weight,
            acceptingUploads: input.acceptingUploads,
            updatedById: ctx.session.appUserId,
            updatedAt: new Date(),
          },
        });
      moduleLogger.info(
        { appUserId: ctx.session.appUserId, context: input },
        'Updated storage location policy',
      );
      return { success: true };
    }),

  getUploadStorage: adminProcedure
    .input(z.object({ uploadRecordId: z.uuid() }))
    .query(async ({ input }) => {
      const record = await db.query.UploadRecord.findFirst({
        where: (t, { eq }) => eq(t.id, input.uploadRecordId),
        columns: {
          id: true,
          title: true,
          storageLocation: true,
          storageMoveId: true,
          storageWaitingSince: true,
          uploadSizeBytes: true,
          publicSizeBytes: true,
        },
      });
      if (!record) throw new TRPCError({ code: 'NOT_FOUND' });
      return {
        ...record,
        uploadSizeBytes: bytesString(record.uploadSizeBytes),
        publicSizeBytes: bytesString(record.publicSizeBytes),
      };
    }),

  moveUpload: adminProcedure
    .input(
      z.object({
        uploadRecordId: z.uuid(),
        targetLocation: locationIdSchema,
        graceHours: graceHoursSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const record = await db.query.UploadRecord.findFirst({
        where: (t, { eq }) => eq(t.id, input.uploadRecordId),
        columns: { storageLocation: true, storageMoveId: true },
      });
      if (!record) throw new TRPCError({ code: 'NOT_FOUND' });
      if (record.storageLocation === input.targetLocation) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Upload is already at that location',
        });
      }
      if (record.storageMoveId) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Upload is already being moved',
        });
      }

      const [move] = await db
        .insert(StorageMove)
        .values({
          kind: 'UPLOAD_RECORD',
          sourceLocation: record.storageLocation,
          targetLocation: input.targetLocation,
          uploadRecordId: input.uploadRecordId,
          totalItems: 1,
          triggeredById: ctx.session.appUserId,
        })
        .returning({ id: StorageMove.id });
      if (!move) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      const handle = await startMoveUploadRecord({
        storageMoveId: move.id,
        uploadRecordId: input.uploadRecordId,
        graceSeconds: Math.round(input.graceHours * 3600),
      });
      await db
        .update(StorageMove)
        .set({ workflowId: handle.workflowId })
        .where(eq(StorageMove.id, move.id));
      return { storageMoveId: move.id };
    }),

  moveOwnerImages: adminProcedure
    .input(
      z.object({
        owner: z.enum(['APP_USER', 'CHANNEL', 'ORGANIZATION']),
        ownerId: z.uuid(),
        targetLocation: locationIdSchema,
        graceHours: graceHoursSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [move] = await db
        .insert(StorageMove)
        .values({
          kind: 'IMAGES',
          // Images can sit at several locations; record the target only.
          sourceLocation: '*',
          targetLocation: input.targetLocation,
          imageOwner: input.owner,
          imageOwnerId: input.ownerId,
          totalItems: 1,
          triggeredById: ctx.session.appUserId,
        })
        .returning({ id: StorageMove.id });
      if (!move) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      const handle = await startMoveOwnerImages({
        storageMoveId: move.id,
        owner: input.owner,
        ownerId: input.ownerId,
        targetLocation: input.targetLocation,
        graceSeconds: Math.round(input.graceHours * 3600),
      });
      await db
        .update(StorageMove)
        .set({ workflowId: handle.workflowId })
        .where(eq(StorageMove.id, move.id));
      return { storageMoveId: move.id };
    }),

  previewRebalance: adminProcedure
    .input(z.object({ sourceLocation: locationIdSchema, goal: goalSchema }))
    .query(async ({ input }) => {
      try {
        return await planRebalance({
          sourceLocation: input.sourceLocation,
          goal: input.goal as RebalanceGoal,
        });
      } catch (err) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }),

  startRebalance: adminProcedure
    .input(
      z.object({
        sourceLocation: locationIdSchema,
        // Null drains to whichever locations placement picks per record.
        targetLocation: locationIdSchema.nullable(),
        goal: goalSchema,
        concurrency: z.number().int().min(1).max(16).default(2),
        graceHours: graceHoursSchema,
        // Stop placing new uploads at the source (drain).
        stopAcceptingUploads: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.targetLocation === input.sourceLocation) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Source and target must differ',
        });
      }
      const running = await db
        .select({ id: StorageMove.id })
        .from(StorageMove)
        .where(
          and(
            eq(StorageMove.kind, 'REBALANCE'),
            eq(StorageMove.sourceLocation, input.sourceLocation),
            inArray(StorageMove.status, ['PENDING', 'COPYING', 'PAUSED']),
          ),
        );
      if (running.length > 0) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'A rebalance off this location is already running',
        });
      }

      if (input.stopAcceptingUploads) {
        await db
          .insert(StorageLocationPolicy)
          .values({
            locationId: input.sourceLocation,
            acceptingUploads: false,
            updatedById: ctx.session.appUserId,
          })
          .onConflictDoUpdate({
            target: StorageLocationPolicy.locationId,
            set: {
              acceptingUploads: false,
              updatedById: ctx.session.appUserId,
              updatedAt: new Date(),
            },
          });
      }

      const [move] = await db
        .insert(StorageMove)
        .values({
          kind: 'REBALANCE',
          sourceLocation: input.sourceLocation,
          targetLocation: input.targetLocation,
          goal: { ...input.goal, concurrency: input.concurrency },
          triggeredById: ctx.session.appUserId,
        })
        .returning({ id: StorageMove.id });
      if (!move) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      const handle = await startRebalanceStorage({
        storageMoveId: move.id,
        sourceLocation: input.sourceLocation,
        targetLocation: input.targetLocation,
        goal: input.goal as RebalanceGoal,
        concurrency: input.concurrency,
        graceSeconds: Math.round(input.graceHours * 3600),
      });
      await db
        .update(StorageMove)
        .set({ workflowId: handle.workflowId })
        .where(eq(StorageMove.id, move.id));
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          context: { ...input, moveId: move.id },
        },
        'Started storage rebalance',
      );
      return { storageMoveId: move.id };
    }),

  controlRebalance: adminProcedure
    .input(
      z.object({
        storageMoveId: z.uuid(),
        action: z.enum(['pause', 'resume', 'cancel']),
      }),
    )
    .mutation(async ({ input }) => {
      await signalRebalance(input.storageMoveId, input.action);
      return { success: true };
    }),

  /** Recent top-level moves (single moves and rebalances), newest first. */
  listMoves: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).default(50) }))
    .query(async ({ input }) => {
      const rows = await db
        .select()
        .from(StorageMove)
        .where(isNull(StorageMove.parentId))
        .orderBy(desc(StorageMove.createdAt))
        .limit(input.limit);
      return rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        status: r.status,
        sourceLocation: r.sourceLocation,
        targetLocation: r.targetLocation,
        uploadRecordId: r.uploadRecordId,
        imageOwner: r.imageOwner,
        imageOwnerId: r.imageOwnerId,
        goal: r.goal,
        totalBytes: r.totalBytes.toString(),
        copiedBytes: r.copiedBytes.toString(),
        totalItems: r.totalItems,
        completedItems: r.completedItems,
        failedItems: r.failedItems,
        error: r.error,
        createdAt: r.createdAt,
        startedAt: r.startedAt,
        finishedAt: r.finishedAt,
      }));
    }),
});
