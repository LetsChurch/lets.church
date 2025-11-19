import { prisma } from '@letschurch/db';
import { Context } from '@temporalio/activity';
import logger from '../../util/logger';
import { backupS3 } from '../../util/s3';

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
  const uploadStates = await prisma.uploadState.findMany({
    where: {
      uploadRecordId,
    },
  });

  if (uploadStates.length === 0) {
    activityLogger.info(`No UploadState records found for ${uploadRecordId}`);
    return 0;
  }

  let deletedCount = 0;

  for (const uploadState of uploadStates) {
    Context.current().heartbeat(`Deleting backup ${uploadState.id}`);

    // Delete from backup if backed up
    if (uploadState.backupKey && uploadState.backupStatus === 'BACKED_UP') {
      try {
        await backupS3.deleteFile(uploadState.backupKey);
        activityLogger.info(`Deleted backup object ${uploadState.backupKey}`);
        deletedCount += 1;
      } catch (error) {
        activityLogger.error(
          error,
          `Failed to delete backup object ${uploadState.backupKey}`,
        );
        // Continue with other deletions even if one fails
      }
    }

    // Delete the UploadState record
    await prisma.uploadState.delete({
      where: { id: uploadState.id },
    });
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
    prefix,
  });

  activityLogger.info(`Deleting backups with prefix ${prefix}`);

  // Delete from backup
  const deletedCount = await backupS3.deletePrefix(prefix);

  // Delete UploadState records that match the prefix
  const deleteResult = await prisma.uploadState.deleteMany({
    where: {
      OR: [
        { s3Key: { startsWith: prefix } },
        { backupKey: { startsWith: prefix } },
      ],
    },
  });

  activityLogger.info(
    `Deleted ${deletedCount} backup objects and ${deleteResult.count} UploadState records with prefix ${prefix}`,
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
    uploadStateId,
  });

  const uploadState = await prisma.uploadState.findUnique({
    where: { id: uploadStateId },
  });

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
        error,
        `Failed to delete backup object ${uploadState.backupKey}`,
      );
      throw error;
    }
  }

  // Delete the UploadState record
  await prisma.uploadState.delete({
    where: { id: uploadStateId },
  });

  activityLogger.info(`Deleted UploadState ${uploadStateId}`);
  return true;
}
