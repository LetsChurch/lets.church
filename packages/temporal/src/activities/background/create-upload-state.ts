import { prisma } from '@letschurch/db';
import type {
  BackupStatus,
  UploadStateType,
} from '@letschurch/db/generated/prisma/client';
import { getS3Client, type S3ClientId } from '../../util/s3';
import type { UploadPostProcessValue } from '../../util/types';

export type CreateUploadStateParams = {
  s3Key: string;
  clientId: S3ClientId;
  uploadType: UploadPostProcessValue;
  sizeBytes?: bigint | number;
  uploadRecordId?: string;
  appUserId?: string;
  channelId?: string;
  organizationId?: string;
  backupStatus?: BackupStatus;
};

/**
 * Map from UploadPostProcessValue to UploadStateType enum
 */
function mapUploadTypeToStateType(
  uploadType: UploadPostProcessValue,
): UploadStateType {
  switch (uploadType) {
    case 'media':
      return 'MEDIA';
    case 'thumbnail':
      return 'THUMBNAIL';
    case 'profileAvatar':
      return 'PROFILE_AVATAR';
    case 'channelAvatar':
      return 'CHANNEL_AVATAR';
    case 'organizationAvatar':
      return 'ORGANIZATION_AVATAR';
    case 'channelDefaultThumbnail':
      return 'CHANNEL_DEFAULT_THUMBNAIL';
    default:
      throw new Error(`Unknown upload type: ${uploadType}`);
  }
}

/**
 * Creates an UploadState record to track an uploaded file and its backup status.
 */
export async function createUploadState(
  params: CreateUploadStateParams,
): Promise<string> {
  const uploadStateType = mapUploadTypeToStateType(params.uploadType);
  const s3Client = getS3Client(params.clientId);
  const s3Bucket = s3Client.getBucket();

  const uploadState = await prisma.uploadState.create({
    data: {
      s3Key: params.s3Key,
      s3Bucket,
      uploadType: uploadStateType,
      sizeBytes: params.sizeBytes ? BigInt(params.sizeBytes) : undefined,
      uploadRecordId: params.uploadRecordId,
      appUserId: params.appUserId,
      channelId: params.channelId,
      organizationId: params.organizationId,
      backupStatus: params.backupStatus ?? 'NOT_BACKED_UP',
    },
  });

  return uploadState.id;
}

/**
 * Updates the backup status of an UploadState record.
 */
export async function updateUploadStateBackupStatus(
  uploadStateId: string,
  backupStatus: BackupStatus,
  backupKey?: string,
): Promise<void> {
  await prisma.uploadState.update({
    where: { id: uploadStateId },
    data: {
      backupStatus,
      backupKey,
      backedUpAt: backupStatus === 'BACKED_UP' ? new Date() : undefined,
    },
  });
}

/**
 * Get UploadState by ID.
 */
export async function getUploadState(uploadStateId: string) {
  return prisma.uploadState.findUnique({
    where: { id: uploadStateId },
  });
}

/**
 * Get UploadState by S3 key.
 */
export async function getUploadStateByKey(s3Key: string) {
  return prisma.uploadState.findUnique({
    where: { s3Key },
  });
}

/**
 * Get upload states that need to be backed up.
 */
export async function getUploadStatesToBackup(
  limit: number,
  offset: number = 0,
) {
  return prisma.uploadState.findMany({
    where: {
      backupStatus: 'NOT_BACKED_UP',
    },
    orderBy: {
      createdAt: 'asc',
    },
    take: limit,
    skip: offset,
  });
}

/**
 * Count upload states by backup status.
 */
export async function countUploadStatesByStatus() {
  const results = await prisma.uploadState.groupBy({
    by: ['backupStatus'],
    _count: {
      id: true,
    },
  });

  return results.reduce(
    (acc, result) => {
      acc[result.backupStatus] = result._count.id;
      return acc;
    },
    {} as Record<BackupStatus, number>,
  );
}
