import { db, UploadState } from '@letschurch/db';
import { backupS3 } from '@letschurch/s3/backup';
import { Context } from '@temporalio/activity';
import { eq, sql } from 'drizzle-orm';

import logger from '../../util/logger';

const moduleLogger = logger.child({
  module: 'temporal/activities/background/delete-glacier-backup',
});

/**
 * Delete backups for a specific upload record.
 * This deletes all UploadState records associated with the upload
 * and their corresponding backup objects.
 */
export async function deleteUploadRecordGlacierBackups(
  uploadRecordId: string,
): Promise<number> {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'deleteUploadRecordGlacierBackups',
    uploadRecordId,
  });

  activityLogger.info(`Deleting backups for upload record ${uploadRecordId}`);

  // Find all UploadState records for this upload
  const uploadStates = await db
    .select()
    .from(UploadState)
    .where(eq(UploadState.uploadRecordId, uploadRecordId));

  if (uploadStates.length === 0) {
    activityLogger.info(`No UploadState records found for ${uploadRecordId}`);
    return 0;
  }

  let deletedCount = 0;

  for (const uploadState of uploadStates) {
    Context.current().heartbeat(`Deleting backup ${uploadState.id}`);

    // Delete from backup if backed up. Let failures propagate so Temporal
    // retries: previously this swallowed the error and then deleted the
    // UploadState row anyway, orphaning the archive object (its backupKey/status
    // record was gone, so nothing could retry the object delete). S3 deletes are
    // idempotent and the row select re-runs each attempt, so retry is safe.
    if (uploadState.backupKey && uploadState.backupStatus === 'BACKED_UP') {
      await backupS3.deleteFile(uploadState.backupKey);
      activityLogger.info(`Deleted backup object ${uploadState.backupKey}`);
      deletedCount += 1;
    }

    // Only delete the tracking row once any backup object is confirmed gone.
    await db.delete(UploadState).where(eq(UploadState.id, uploadState.id));
    activityLogger.info(`Deleted UploadState record ${uploadState.id}`);
  }

  activityLogger.info(
    `Deleted ${deletedCount} backups and ${uploadStates.length} UploadState records for ${uploadRecordId}`,
  );

  return deletedCount;
}

/**
 * Delete backups by prefix (for uploads stored with ID-based prefixes).
 * This also deletes associated UploadState records.
 */
export async function deleteGlacierBackupsByPrefix(
  prefix: string,
): Promise<number> {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'deleteGlacierBackupsByPrefix',
    context: { prefix },
  });

  activityLogger.info(`Deleting backups with prefix ${prefix}`);

  // Delete from backup
  const deletedCount = await backupS3.deletePrefix(prefix);

  // Escape LIKE special characters so prefix is treated literally.
  const escapedPrefix = prefix
    .replaceAll('\\', '\\\\')
    .replaceAll('%', '\\%')
    .replaceAll('_', '\\_');
  const likePattern = `${escapedPrefix}%`;

  // Delete UploadState records that match the prefix
  const _deleteResult = await db.execute(sql`
    DELETE FROM "upload_state"
    WHERE "s3_key" LIKE ${likePattern} ESCAPE '\'
       OR "backup_key" LIKE ${likePattern} ESCAPE '\'
  `);

  activityLogger.info(
    `Deleted ${deletedCount} backup objects and ${_deleteResult.rowCount ?? 0} UploadState records with prefix ${prefix}`,
  );

  return deletedCount;
}

/**
 * Delete a single UploadState and its backup.
 */
export async function deleteUploadStateAndBackup(
  uploadStateId: string,
): Promise<boolean> {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'deleteUploadStateAndBackup',
    context: { uploadStateId },
  });

  const uploadState = await db
    .select()
    .from(UploadState)
    .where(eq(UploadState.id, uploadStateId))
    .then((r) => r[0] ?? null);

  if (!uploadState) {
    activityLogger.warn(`UploadState ${uploadStateId} not found`);
    return false;
  }

  // Delete from backup if backed up
  if (uploadState.backupKey && uploadState.backupStatus === 'BACKED_UP') {
    try {
      await backupS3.deleteFile(uploadState.backupKey);
      activityLogger.info(`Deleted backup object ${uploadState.backupKey}`);
    } catch (error) {
      activityLogger.error(
        { err: error instanceof Error ? error : new Error(String(error)) },
        `Failed to delete backup object ${uploadState.backupKey}`,
      );
      throw error;
    }
  }

  // Delete the UploadState record
  await db.delete(UploadState).where(eq(UploadState.id, uploadStateId));

  activityLogger.info(`Deleted UploadState ${uploadStateId}`);
  return true;
}
