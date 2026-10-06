/**
 * Procedures for mirroring media from another platform into a channel. The
 * client is the YouTube Studio browser extension (packages/browser-extension):
 * it downloads the owner's original file from Studio and uploads it here.
 *
 * Unlike the dashboard flow (create record → presign as channel admin → edit
 * metadata as editor), these let any member who can upload create a record
 * *with* its metadata, upload, finalize, and cancel — but only for records they
 * created and that aren't finalized yet.
 */
import {
  ChannelMembership,
  db,
  UploadLicense,
  UploadRecord,
} from '@letschurch/db';
import { ingestS3 } from '@letschurch/s3/ingest';
import { TRPCError } from '@trpc/server';
import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';

import {
  abortMirrorUploadSchema,
  createMirrorUploadSchema,
  finalizeMirrorUploadSchema,
  findMirrorDuplicatesSchema,
} from '@/schemas/dashboard/mirror';
import {
  cancelMultipartMediaUpload,
  completeMultipartMediaUpload,
  deleteUpload,
} from '@/temporal';
import logger from '@/util/logger';
import { startMultipartUpload } from '@/util/media-multipart';
import {
  matchMirrorCandidates,
  mirrorCandidateDateWindow,
  normalizeMirrorFileName,
} from '@/util/mirror-duplicates';
import { consumeTokenBucketWithFallback } from '@/util/rate-limit';

import { authProcedure, router } from '../../trpc';
import { channelUploadProcedure } from './channels';

const moduleLogger = logger.child({
  module: 'trpc/procedures/dashboard/mirror',
});

// Bulk mirroring is client-paced (one video at a time), so this only needs to
// stop a runaway client: a burst of 60 records, refilling one per minute.
const CREATE_BUCKET = { capacity: 60, refillTokensPerSecond: 1 / 60 };

/**
 * Load an in-flight mirror upload the caller may finish or cancel: in the
 * authorized channel, created by this user, not finalized or deleted, and whose
 * S3 key is the one this record's multipart upload was opened under.
 */
async function findPendingMirrorUpload({
  channelId,
  uploadId,
  appUserId,
  s3UploadKey,
}: {
  channelId: string;
  uploadId: string;
  appUserId: string;
  s3UploadKey: string;
}) {
  const upload = await db.query.UploadRecord.findFirst({
    columns: { id: true },
    where: (t, { and, eq, isNull }) =>
      and(
        eq(t.id, uploadId),
        eq(t.channelId, channelId),
        eq(t.appUserId, appUserId),
        eq(t.uploadFinalized, false),
        isNull(t.deletedAt),
      ),
  });

  // Media multipart keys are `<uploadRecordId>/<uuid>` (the ingest client
  // appends a random suffix to the target id `startMultipartUpload` passes),
  // so requiring the prefix stops a caller finalizing or aborting another
  // record's upload.
  if (!upload || !s3UploadKey.startsWith(`${upload.id}/`)) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Upload not found',
    });
  }

  return upload;
}

export const mirrorRouter = router({
  /** Who is signed in, and which channels they can mirror into. */
  getContext: authProcedure.query(async ({ ctx }) => {
    const channels = await db.query.ChannelMembership.findMany({
      columns: { channelId: true },
      where: (t, { and, eq, or }) =>
        and(
          eq(t.appUserId, ctx.session.appUserId),
          or(eq(t.canUpload, true), eq(t.isAdmin, true)),
        ),
      with: {
        channel: {
          columns: { id: true, name: true, slug: true },
        },
      },
      orderBy: [asc(ChannelMembership.channelId)],
    });

    const user = await db.query.AppUser.findFirst({
      columns: { username: true },
      where: (t, { eq }) => eq(t.id, ctx.session.appUserId),
    });

    return {
      username: user?.username ?? null,
      channels: channels
        .map((m) => m.channel)
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }),

  findDuplicates: channelUploadProcedure
    .input(findMirrorDuplicatesSchema)
    .query(async ({ input: { channelId, candidates } }) => {
      const window = mirrorCandidateDateWindow(candidates);
      const titles = candidates.map((c) => c.title.toLowerCase());
      const fileNames = candidates.flatMap((c) =>
        c.originalFileName ? [normalizeMirrorFileName(c.originalFileName)] : [],
      );

      const existing = await db
        .select({
          id: UploadRecord.id,
          title: UploadRecord.title,
          publishedAt: UploadRecord.publishedAt,
          lengthSeconds: UploadRecord.lengthSeconds,
          originalFileName: UploadRecord.originalFileName,
        })
        .from(UploadRecord)
        .where(
          and(
            eq(UploadRecord.channelId, channelId),
            isNull(UploadRecord.deletedAt),
            or(
              window
                ? and(
                    gte(UploadRecord.publishedAt, window.from),
                    lte(UploadRecord.publishedAt, window.to),
                  )
                : undefined,
              inArray(sql`lower(${UploadRecord.title})`, titles),
              fileNames.length > 0
                ? inArray(
                    sql`lower(${UploadRecord.originalFileName})`,
                    fileNames,
                  )
                : undefined,
            ),
          ),
        )
        .orderBy(asc(UploadRecord.createdAt), asc(UploadRecord.id));

      return matchMirrorCandidates(candidates, existing);
    }),

  createUpload: channelUploadProcedure
    .input(createMirrorUploadSchema)
    .mutation(async ({ ctx, input }) => {
      const appUserId = ctx.session.appUserId;
      const limit = await consumeTokenBucketWithFallback({
        key: `mirror-upload:${appUserId}`,
        cost: 1,
        ...CREATE_BUCKET,
      });
      if (!limit.allowed) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: `Too many uploads. Try again in ${Math.ceil(limit.retryAfterSeconds)} seconds.`,
        });
      }

      const channel = await db.query.Channel.findFirst({
        columns: {
          defaultUploadVisibility: true,
          defaultUploadLicense: true,
          defaultUploadCommentsEnabled: true,
          defaultUploadDownloadsEnabled: true,
        },
        where: (t, { eq }) => eq(t.id, input.channelId),
      });

      if (!channel) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      const [record] = await db
        .insert(UploadRecord)
        .values({
          title: input.title,
          description: input.description,
          publishedAt: input.publishedAt,
          originalFileName: input.originalFileName || null,
          license: channel.defaultUploadLicense ?? UploadLicense.enumValues[0],
          visibility:
            input.visibility ?? channel.defaultUploadVisibility ?? 'PRIVATE',
          userCommentsEnabled: channel.defaultUploadCommentsEnabled ?? true,
          downloadsEnabled: channel.defaultUploadDownloadsEnabled ?? true,
          channelId: input.channelId,
          appUserId,
          uploadFinalized: false,
          variants: [],
          updatedAt: new Date(),
          score: 0,
          transcodingProgress: 0,
        })
        .returning({ id: UploadRecord.id });

      if (!record) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create upload record',
        });
      }

      moduleLogger.info(
        { uploadId: record.id, channelId: input.channelId, appUserId },
        'Created mirror upload',
      );

      try {
        const multipart = await startMultipartUpload({
          targetId: record.id,
          uploadMimeType: input.uploadMimeType,
          bytes: input.bytes,
          postProcess: 'media',
        });

        return { uploadId: record.id, ...multipart };
      } catch (err) {
        // S3 or Temporal unavailable, …: don't leave an empty record behind.
        // The client never got the id, so it can't clean up itself.
        await deleteUpload(record.id).catch((cleanupErr: unknown) => {
          moduleLogger.error(
            {
              err:
                cleanupErr instanceof Error
                  ? cleanupErr
                  : new Error(String(cleanupErr)),
              uploadId: record.id,
            },
            'Failed to clean up mirror upload after setup error',
          );
        });
        throw err;
      }
    }),

  finalizeUpload: channelUploadProcedure
    .input(finalizeMirrorUploadSchema)
    .mutation(async ({ ctx, input }) => {
      await findPendingMirrorUpload({
        channelId: input.channelId,
        uploadId: input.uploadId,
        appUserId: ctx.session.appUserId,
        s3UploadKey: input.s3UploadKey,
      });

      await completeMultipartMediaUpload(
        input.s3UploadId,
        input.s3UploadKey,
        input.s3PartETags,
        ctx.session.appUserId,
      );

      return { uploadId: input.uploadId };
    }),

  /**
   * Cancel an in-flight mirror: stop the waiting workflow, abort the S3
   * multipart upload, and delete the never-finalized record.
   */
  abortUpload: channelUploadProcedure
    .input(abortMirrorUploadSchema)
    .mutation(async ({ ctx, input }) => {
      const upload = await findPendingMirrorUpload({
        channelId: input.channelId,
        uploadId: input.uploadId,
        appUserId: ctx.session.appUserId,
        s3UploadKey: input.s3UploadKey,
      });

      await cancelMultipartMediaUpload(input.s3UploadId, input.s3UploadKey);

      try {
        await ingestS3.abortMultipartUpload(
          input.s3UploadId,
          input.s3UploadKey,
        );
      } catch (err) {
        // Already aborted/completed upstream; the record still goes away.
        moduleLogger.warn(
          {
            err: err instanceof Error ? err : new Error(String(err)),
            uploadId: upload.id,
          },
          'Failed to abort mirror multipart upload',
        );
      }

      // The standard delete workflow also cleans up search and any objects.
      await deleteUpload(upload.id);

      return { uploadId: upload.id };
    }),
});
