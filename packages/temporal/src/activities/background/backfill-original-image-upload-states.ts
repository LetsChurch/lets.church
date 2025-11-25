import { prisma } from '@letschurch/db';
import type { UploadStateType } from '@letschurch/db/generated/prisma/client';
import logger from '../../util/logger';
import { ingestS3 } from '../../util/s3';

export type BackfillOriginalImageBatchResult = {
  created: number;
  remaining: number;
};

/**
 * Scans the ingest bucket for .imagemagick.json probe files to find original
 * image uploads and creates UploadState records for them.
 *
 * Strategy:
 * - List objects in ingest bucket with .imagemagick.json suffix
 * - For each probe file, check if the original image exists
 * - Determine the upload type based on the path pattern
 * - Create UploadState record if one doesn't exist for that key
 */
export async function backfillOriginalImageUploadStatesBatch(
  batchSize: number,
  ingestBucket: string,
): Promise<BackfillOriginalImageBatchResult> {
  let created = 0;
  let processed = 0;

  // Iterate through objects in the ingest bucket
  for await (const obj of ingestS3.listObjects()) {
    // Only process .imagemagick.json files
    if (!obj.Key?.endsWith('.imagemagick.json')) {
      continue;
    }

    if (processed >= batchSize) {
      break;
    }

    const probeKey = obj.Key;
    processed++;

    // Get the original file key by removing .imagemagick.json suffix
    const originalKey = probeKey.replace('.imagemagick.json', '');

    // Check if original file exists
    try {
      await ingestS3.headObject(originalKey);
    } catch (_error) {
      logger.warn(`Original file not found for probe: ${probeKey}, skipping`);
      continue;
    }

    // Check if UploadState already exists for this key
    const existing = await prisma.uploadState.findUnique({
      where: { s3Key: originalKey },
    });

    if (existing) {
      continue; // Already have an UploadState for this
    }

    // Try to determine the upload type and related record
    // Pattern: ${uploadRecordId}/${uuid} for thumbnails from imports
    // We need to check the database to see what this relates to
    const uploadType = await determineUploadType(originalKey);

    if (!uploadType) {
      logger.warn(`Could not determine upload type for: ${originalKey}`);
      continue;
    }

    // Get file size
    let sizeBytes: bigint | undefined;
    try {
      const headResult = await ingestS3.headObject(originalKey);
      if (headResult) {
        sizeBytes = headResult.ContentLength
          ? BigInt(headResult.ContentLength)
          : undefined;
      }
    } catch (_error) {
      logger.warn(`Could not get size for: ${originalKey}`);
    }

    // Create UploadState
    await prisma.uploadState.create({
      data: {
        s3Key: originalKey,
        s3Bucket: ingestBucket,
        uploadType: uploadType.type,
        sizeBytes,
        uploadRecordId: uploadType.uploadRecordId,
        appUserId: uploadType.appUserId,
        channelId: uploadType.channelId,
        organizationId: uploadType.organizationId,
        backupStatus: 'NOT_BACKED_UP',
      },
    });

    created++;
  }

  // We can't easily determine remaining without scanning the entire bucket
  // So we'll just return 0 if we processed less than batchSize
  const remaining = processed < batchSize ? 0 : batchSize;

  logger.info(
    `Backfilled ${created} original image uploads from ${processed} probe files`,
  );

  return {
    created,
    remaining,
  };
}

type UploadTypeInfo = {
  type: UploadStateType;
  uploadRecordId?: string;
  appUserId?: string;
  channelId?: string;
  organizationId?: string;
};

/**
 * Attempts to determine the upload type and related entity for an original image key.
 * This is a best-effort approach based on patterns we can detect.
 */
async function determineUploadType(
  s3Key: string,
): Promise<UploadTypeInfo | null> {
  // Pattern 1: Check if this is a thumbnail for an UploadRecord
  // The optimized thumbnail would be stored in overrideThumbnailPath
  // We need to check if any UploadRecord has a matching ID in the path
  const pathParts = s3Key.split('/');
  if (pathParts.length >= 2) {
    const potentialUploadId = pathParts[0];

    // Check if this is an upload record ID
    const uploadRecord = await prisma.uploadRecord.findUnique({
      where: { id: potentialUploadId },
      select: { id: true, overrideThumbnailPath: true },
    });

    if (uploadRecord) {
      return {
        type: 'THUMBNAIL',
        uploadRecordId: uploadRecord.id,
      };
    }

    // Check if this matches a user avatar pattern
    const user = await prisma.appUser.findUnique({
      where: { id: potentialUploadId },
      select: { id: true, avatarPath: true },
    });

    if (user) {
      return {
        type: 'PROFILE_AVATAR',
        appUserId: user.id,
      };
    }

    // Check if this matches a channel avatar or default thumbnail
    const channel = await prisma.channel.findUnique({
      where: { id: potentialUploadId },
      select: { id: true, avatarPath: true, defaultThumbnailPath: true },
    });

    if (channel) {
      // Determine if it's avatar or default thumbnail based on the optimized path
      if (channel.avatarPath) {
        return {
          type: 'CHANNEL_AVATAR',
          channelId: channel.id,
        };
      }
      if (channel.defaultThumbnailPath) {
        return {
          type: 'CHANNEL_DEFAULT_THUMBNAIL',
          channelId: channel.id,
        };
      }
    }

    // Check if this matches an organization avatar
    const org = await prisma.organization.findUnique({
      where: { id: potentialUploadId },
      select: { id: true, avatarPath: true },
    });

    if (org) {
      return {
        type: 'ORGANIZATION_AVATAR',
        organizationId: org.id,
      };
    }
  }

  return null;
}
