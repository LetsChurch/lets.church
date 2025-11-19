import { prisma } from '@letschurch/db';
import type { UploadStateType } from '@letschurch/db/generated/prisma/client';
import logger from '../../util/logger';

export type BackfillBatchResult = {
  created: number;
  remaining: number;
};

/**
 * Get count of uploads that need to be backfilled into UploadState.
 */
export async function getBackfillCount(): Promise<number> {
  // Count finalized upload records that don't have an UploadState
  const mediaCount = await prisma.uploadRecord.count({
    where: {
      uploadFinalized: true,
      finalizedUploadKey: { not: null },
      uploadStates: {
        none: {
          uploadType: 'MEDIA',
        },
      },
    },
  });

  // Count upload records with thumbnails
  const thumbnailCount = await prisma.uploadRecord.count({
    where: {
      overrideThumbnailPath: { not: null },
      uploadStates: {
        none: {
          uploadType: 'THUMBNAIL',
        },
      },
    },
  });

  // Count users with avatars
  const profileAvatarCount = await prisma.appUser.count({
    where: {
      avatarPath: { not: null },
      uploadStates: {
        none: {
          uploadType: 'PROFILE_AVATAR',
        },
      },
    },
  });

  // Count channels with avatars
  const channelAvatarCount = await prisma.channel.count({
    where: {
      avatarPath: { not: null },
      uploadStates: {
        none: {
          uploadType: 'CHANNEL_AVATAR',
        },
      },
    },
  });

  // Count channels with default thumbnails
  const channelThumbnailCount = await prisma.channel.count({
    where: {
      defaultThumbnailPath: { not: null },
      uploadStates: {
        none: {
          uploadType: 'CHANNEL_DEFAULT_THUMBNAIL',
        },
      },
    },
  });

  // Count organizations with avatars
  const orgAvatarCount = await prisma.organization.count({
    where: {
      avatarPath: { not: null },
      uploadStates: {
        none: {
          uploadType: 'ORGANIZATION_AVATAR',
        },
      },
    },
  });

  return (
    mediaCount +
    thumbnailCount +
    profileAvatarCount +
    channelAvatarCount +
    channelThumbnailCount +
    orgAvatarCount
  );
}

/**
 * Backfill a batch of upload states for finalized media uploads.
 */
async function backfillMediaBatch(
  batchSize: number,
  ingestBucket: string,
): Promise<number> {
  const uploads = await prisma.uploadRecord.findMany({
    where: {
      uploadFinalized: true,
      finalizedUploadKey: { not: null },
      uploadStates: {
        none: {
          uploadType: 'MEDIA',
        },
      },
    },
    take: batchSize,
    select: {
      id: true,
      finalizedUploadKey: true,
      uploadSizeBytes: true,
    },
  });

  if (uploads.length === 0) return 0;

  const uploadsWithKeys = uploads.filter(
    (upload): upload is typeof upload & { finalizedUploadKey: string } =>
      upload.finalizedUploadKey !== null,
  );

  await prisma.uploadState.createMany({
    data: uploadsWithKeys.map((upload) => ({
      s3Key: upload.finalizedUploadKey,
      s3Bucket: ingestBucket,
      uploadType: 'MEDIA' as UploadStateType,
      sizeBytes: upload.uploadSizeBytes,
      uploadRecordId: upload.id,
      backupStatus: 'NOT_BACKED_UP' as const,
    })),
    skipDuplicates: true,
  });

  return uploadsWithKeys.length;
}

/**
 * Backfill a batch of upload states for thumbnails.
 */
async function backfillThumbnailBatch(
  batchSize: number,
  ingestBucket: string,
): Promise<number> {
  const uploads = await prisma.uploadRecord.findMany({
    where: {
      overrideThumbnailPath: { not: null },
      uploadStates: {
        none: {
          uploadType: 'THUMBNAIL',
        },
      },
    },
    take: batchSize,
    select: {
      id: true,
      overrideThumbnailPath: true,
    },
  });

  if (uploads.length === 0) return 0;

  const uploadsWithPaths = uploads.filter(
    (upload): upload is typeof upload & { overrideThumbnailPath: string } =>
      upload.overrideThumbnailPath !== null,
  );

  await prisma.uploadState.createMany({
    data: uploadsWithPaths.map((upload) => ({
      s3Key: upload.overrideThumbnailPath,
      s3Bucket: ingestBucket,
      uploadType: 'THUMBNAIL' as UploadStateType,
      uploadRecordId: upload.id,
      backupStatus: 'NOT_BACKED_UP' as const,
    })),
    skipDuplicates: true,
  });

  return uploadsWithPaths.length;
}

/**
 * Backfill a batch of upload states for profile avatars.
 */
async function backfillProfileAvatarBatch(
  batchSize: number,
  ingestBucket: string,
): Promise<number> {
  const users = await prisma.appUser.findMany({
    where: {
      avatarPath: { not: null },
      uploadStates: {
        none: {
          uploadType: 'PROFILE_AVATAR',
        },
      },
    },
    take: batchSize,
    select: {
      id: true,
      avatarPath: true,
    },
  });

  if (users.length === 0) return 0;

  const usersWithAvatars = users.filter(
    (user): user is typeof user & { avatarPath: string } =>
      user.avatarPath !== null,
  );

  await prisma.uploadState.createMany({
    data: usersWithAvatars.map((user) => ({
      s3Key: user.avatarPath,
      s3Bucket: ingestBucket,
      uploadType: 'PROFILE_AVATAR' as UploadStateType,
      appUserId: user.id,
      backupStatus: 'NOT_BACKED_UP' as const,
    })),
    skipDuplicates: true,
  });

  return usersWithAvatars.length;
}

/**
 * Backfill a batch of upload states for channel avatars.
 */
async function backfillChannelAvatarBatch(
  batchSize: number,
  ingestBucket: string,
): Promise<number> {
  const channels = await prisma.channel.findMany({
    where: {
      avatarPath: { not: null },
      uploadStates: {
        none: {
          uploadType: 'CHANNEL_AVATAR',
        },
      },
    },
    take: batchSize,
    select: {
      id: true,
      avatarPath: true,
    },
  });

  if (channels.length === 0) return 0;

  const channelsWithAvatars = channels.filter(
    (channel): channel is typeof channel & { avatarPath: string } =>
      channel.avatarPath !== null,
  );

  await prisma.uploadState.createMany({
    data: channelsWithAvatars.map((channel) => ({
      s3Key: channel.avatarPath,
      s3Bucket: ingestBucket,
      uploadType: 'CHANNEL_AVATAR' as UploadStateType,
      channelId: channel.id,
      backupStatus: 'NOT_BACKED_UP' as const,
    })),
    skipDuplicates: true,
  });

  return channelsWithAvatars.length;
}

/**
 * Backfill a batch of upload states for channel default thumbnails.
 */
async function backfillChannelThumbnailBatch(
  batchSize: number,
  ingestBucket: string,
): Promise<number> {
  const channels = await prisma.channel.findMany({
    where: {
      defaultThumbnailPath: { not: null },
      uploadStates: {
        none: {
          uploadType: 'CHANNEL_DEFAULT_THUMBNAIL',
        },
      },
    },
    take: batchSize,
    select: {
      id: true,
      defaultThumbnailPath: true,
    },
  });

  if (channels.length === 0) return 0;

  const channelsWithThumbnails = channels.filter(
    (channel): channel is typeof channel & { defaultThumbnailPath: string } =>
      channel.defaultThumbnailPath !== null,
  );

  await prisma.uploadState.createMany({
    data: channelsWithThumbnails.map((channel) => ({
      s3Key: channel.defaultThumbnailPath,
      s3Bucket: ingestBucket,
      uploadType: 'CHANNEL_DEFAULT_THUMBNAIL' as UploadStateType,
      channelId: channel.id,
      backupStatus: 'NOT_BACKED_UP' as const,
    })),
    skipDuplicates: true,
  });

  return channelsWithThumbnails.length;
}

/**
 * Backfill a batch of upload states for organization avatars.
 */
async function backfillOrganizationAvatarBatch(
  batchSize: number,
  ingestBucket: string,
): Promise<number> {
  const orgs = await prisma.organization.findMany({
    where: {
      avatarPath: { not: null },
      uploadStates: {
        none: {
          uploadType: 'ORGANIZATION_AVATAR',
        },
      },
    },
    take: batchSize,
    select: {
      id: true,
      avatarPath: true,
    },
  });

  if (orgs.length === 0) return 0;

  const orgsWithAvatars = orgs.filter(
    (org): org is typeof org & { avatarPath: string } =>
      org.avatarPath !== null,
  );

  await prisma.uploadState.createMany({
    data: orgsWithAvatars.map((org) => ({
      s3Key: org.avatarPath,
      s3Bucket: ingestBucket,
      uploadType: 'ORGANIZATION_AVATAR' as UploadStateType,
      organizationId: org.id,
      backupStatus: 'NOT_BACKED_UP' as const,
    })),
    skipDuplicates: true,
  });

  return orgsWithAvatars.length;
}

/**
 * Backfill a batch of upload states from existing database records.
 * Returns the number of records created and remaining.
 */
export async function backfillUploadStatesBatch(
  batchSize: number,
  ingestBucket: string,
): Promise<BackfillBatchResult> {
  // Process each type in order
  let created = 0;

  // Try media first
  created = await backfillMediaBatch(batchSize, ingestBucket);
  if (created > 0) {
    const remaining = await getBackfillCount();
    logger.info(`Backfilled ${created} media uploads, ${remaining} remaining`);
    return { created, remaining };
  }

  // Then thumbnails
  created = await backfillThumbnailBatch(batchSize, ingestBucket);
  if (created > 0) {
    const remaining = await getBackfillCount();
    logger.info(`Backfilled ${created} thumbnails, ${remaining} remaining`);
    return { created, remaining };
  }

  // Then profile avatars
  created = await backfillProfileAvatarBatch(batchSize, ingestBucket);
  if (created > 0) {
    const remaining = await getBackfillCount();
    logger.info(
      `Backfilled ${created} profile avatars, ${remaining} remaining`,
    );
    return { created, remaining };
  }

  // Then channel avatars
  created = await backfillChannelAvatarBatch(batchSize, ingestBucket);
  if (created > 0) {
    const remaining = await getBackfillCount();
    logger.info(
      `Backfilled ${created} channel avatars, ${remaining} remaining`,
    );
    return { created, remaining };
  }

  // Then channel default thumbnails
  created = await backfillChannelThumbnailBatch(batchSize, ingestBucket);
  if (created > 0) {
    const remaining = await getBackfillCount();
    logger.info(
      `Backfilled ${created} channel thumbnails, ${remaining} remaining`,
    );
    return { created, remaining };
  }

  // Finally organization avatars
  created = await backfillOrganizationAvatarBatch(batchSize, ingestBucket);
  const remaining = await getBackfillCount();
  logger.info(`Backfilled ${created} org avatars, ${remaining} remaining`);
  return { created, remaining };
}
