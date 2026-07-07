import {
  type BackupStatus,
  db,
  UploadState,
  type UploadStateType,
} from '@letschurch/db';
import { ingestS3 } from '@letschurch/s3/ingest';
import { count, eq, sql } from 'drizzle-orm';

import type { UploadPostProcessValue } from '../../util/types';

type BackupStatusValue = (typeof BackupStatus.enumValues)[number];
type UploadStateTypeValue = (typeof UploadStateType.enumValues)[number];

export type CreateUploadStateParams = {
  s3Key: string;
  uploadType: UploadPostProcessValue;
  sizeBytes?: string;
  uploadRecordId?: string;
  appUserId?: string;
  channelId?: string;
  organizationId?: string;
  backupStatus?: BackupStatusValue;
};

/**
 * Map from UploadPostProcessValue to UploadStateType enum
 */
function mapUploadTypeToStateType(
  uploadType: UploadPostProcessValue,
): UploadStateTypeValue {
  switch (uploadType) {
    case 'media':
      return 'MEDIA';
    case 'thumbnail':
      return 'THUMBNAIL';
    case 'profileAvatar':
      return 'PROFILE_AVATAR';
    case 'channelAvatar':
      return 'CHANNEL_AVATAR';
    case 'channelCover':
      return 'CHANNEL_COVER';
    case 'organizationAvatar':
      return 'ORGANIZATION_AVATAR';
    case 'organizationCover':
      return 'ORGANIZATION_COVER';
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
  const s3Bucket = ingestS3.getBucket();

  const [uploadState] = await db
    .insert(UploadState)
    .values({
      s3Key: params.s3Key,
      s3Bucket,
      uploadType: uploadStateType,
      sizeBytes: params.sizeBytes ? BigInt(params.sizeBytes) : undefined,
      uploadRecordId: params.uploadRecordId,
      appUserId: params.appUserId,
      channelId: params.channelId,
      organizationId: params.organizationId,
      backupStatus: params.backupStatus ?? 'NOT_BACKED_UP',
      updatedAt: new Date(),
    })
    .returning();

  if (!uploadState)
    throw new Error(`Failed to insert UploadState for key: ${params.s3Key}`);
  return uploadState.id;
}

/**
 * Updates the backup status of an UploadState record.
 */
export async function updateUploadStateBackupStatus(
  uploadStateId: string,
  backupStatus: BackupStatusValue,
  backupKey?: string,
): Promise<void> {
  await db
    .update(UploadState)
    .set({
      backupStatus,
      backupKey,
      backedUpAt: backupStatus === 'BACKED_UP' ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(UploadState.id, uploadStateId));
}

/**
 * Get UploadState by ID.
 */
export async function getUploadState(uploadStateId: string) {
  return db
    .select()
    .from(UploadState)
    .where(eq(UploadState.id, uploadStateId))
    .then((r) => r[0] ?? null);
}

/**
 * Get UploadState by S3 key.
 */
export async function getUploadStateByKey(s3Key: string) {
  return db
    .select()
    .from(UploadState)
    .where(eq(UploadState.s3Key, s3Key))
    .then((r) => r[0] ?? null);
}

/**
 * Get upload states that need to be backed up.
 */
export async function getUploadStatesToBackup(
  limit: number,
  offset: number = 0,
): Promise<Array<{ id: string }>> {
  return db
    .select({ id: UploadState.id })
    .from(UploadState)
    .where(eq(UploadState.backupStatus, 'NOT_BACKED_UP'))
    .orderBy(UploadState.createdAt)
    .limit(limit)
    .offset(offset);
}

/**
 * Atomically claim a batch of upload states for backup by marking them as BACKING_UP.
 * This prevents other workflows from selecting the same uploads.
 * Returns the IDs of the claimed uploads.
 */
export async function claimUploadStatesForBackup(
  limit: number,
): Promise<Array<{ id: string }>> {
  // Use a raw query to atomically select and update in one operation
  // This prevents race conditions where multiple batches select the same uploads
  const claimed = await db.execute<{ id: string }>(sql`
    UPDATE "upload_state"
    SET "backup_status" = 'BACKING_UP', "updated_at" = NOW()
    WHERE id IN (
      SELECT id FROM "upload_state"
      WHERE "backup_status" = 'NOT_BACKED_UP'
      ORDER BY "created_at" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `);

  return claimed.rows;
}

/**
 * Count upload states by backup status.
 */
export async function countUploadStatesByStatus() {
  const results = await db
    .select({
      backupStatus: UploadState.backupStatus,
      count: count(UploadState.id),
    })
    .from(UploadState)
    .groupBy(UploadState.backupStatus);

  return results.reduce(
    (acc, result) => {
      acc[result.backupStatus] = Number(result.count);
      return acc;
    },
    {} as Record<BackupStatusValue, number>,
  );
}
