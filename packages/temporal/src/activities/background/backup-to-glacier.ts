import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { prisma } from '@letschurch/db';
import { heartbeat } from '@temporalio/activity';
import logger from '../../util/logger';
import { backupS3, ingestS3, publicS3 } from '../../util/s3';

const WORK_DIR = process.env.BACKUP_WORKING_DIRECTORY ?? '/data/backup';

// S3 has a 5GB limit for single PUT requests
// Use multipart upload for files larger than this threshold
const MULTIPART_THRESHOLD = 4.5 * 1024 * 1024 * 1024; // 4.5GB to be safe

/**
 * Backs up a file from S3 to backup storage with DEEP_ARCHIVE storage class.
 * For large files (>4.5GB), uses multipart upload to avoid the 5GB PUT limit.
 * Multipart uploads can handle files up to 5TB.
 * Updates the UploadState record with the backup status.
 */
export default async function backupToGlacier(
  uploadStateId: string,
): Promise<{ backupKey: string; sizeBytes: number }> {
  // Get the upload state to find the source
  const uploadState = await prisma.uploadState.findUnique({
    where: { id: uploadStateId },
  });

  if (!uploadState) {
    throw new Error(`UploadState not found: ${uploadStateId}`);
  }

  if (uploadState.backupStatus === 'BACKED_UP') {
    logger.info(`UploadState ${uploadStateId} is already backed up`);
    return {
      backupKey: uploadState.backupKey ?? uploadState.s3Key,
      sizeBytes: Number(uploadState.sizeBytes ?? 0),
    };
  }

  // Update status to BACKING_UP
  await prisma.uploadState.update({
    where: { id: uploadStateId },
    data: { backupStatus: 'BACKING_UP' },
  });

  heartbeat('Starting backup');

  // Create work directory for this upload
  const workDir = join(WORK_DIR, uploadStateId);
  const localFilePath = join(workDir, 'source');

  try {
    // Determine which S3 client to use based on the bucket
    const sourceS3 = uploadState.s3Bucket.toLowerCase().includes('ingest')
      ? ingestS3
      : publicS3;

    // Get the source object metadata and stream
    const sourceObject = await sourceS3.getObject(uploadState.s3Key);
    const sizeBytes = sourceObject.ContentLength ?? 0;

    if (!sourceObject.Body) {
      throw new Error(`No body in source object: ${uploadState.s3Key}`);
    }

    heartbeat('Downloading source file to disk');

    // Create work directory
    await mkdir(workDir, { recursive: true });

    // Download the source file to disk
    const writeStream = createWriteStream(localFilePath);
    await pipeline(
      sourceObject.Body.transformToWebStream() as unknown as NodeJS.ReadableStream,
      writeStream,
    );

    heartbeat('Uploading to backup');

    // Use multipart upload for large files to avoid size limits
    const backupKey = uploadState.s3Key;
    if (sizeBytes > MULTIPART_THRESHOLD) {
      logger.info(`Using multipart upload for large file: ${sizeBytes} bytes`);
      await backupS3.putFileMultipart({
        key: backupKey,
        contentType: sourceObject.ContentType ?? 'application/octet-stream',
        path: localFilePath,
        onProgress: (progress) => {
          heartbeat(`Uploading: ${(progress * 100).toFixed(1)}%`);
        },
      });
    } else {
      // Use single PUT for smaller files
      const readStream = createReadStream(localFilePath);
      await backupS3.putFile({
        key: backupKey,
        contentType: sourceObject.ContentType ?? 'application/octet-stream',
        body: readStream,
        contentLength: sizeBytes,
      });
    }

    heartbeat('Backup complete, updating status');

    // Update status to BACKED_UP
    await prisma.uploadState.update({
      where: { id: uploadStateId },
      data: {
        backupStatus: 'BACKED_UP',
        backupKey,
        sizeBytes: BigInt(sizeBytes),
        backedUpAt: new Date(),
      },
    });

    logger.info(
      `Successfully backed up ${uploadState.s3Key} (${sizeBytes} bytes)`,
    );

    return { backupKey, sizeBytes };
  } catch (error) {
    // Update status to BACKUP_FAILED on error
    await prisma.uploadState.update({
      where: { id: uploadStateId },
      data: { backupStatus: 'BACKUP_FAILED' },
    });

    logger.error(
      { err: error instanceof Error ? error : new Error(String(error)) },
      `Failed to backup ${uploadState.s3Key}`,
    );

    throw error;
  } finally {
    // Clean up the work directory
    try {
      await rm(workDir, { recursive: true, force: true });
    } catch (cleanupError) {
      logger.warn(
        {
          err:
            cleanupError instanceof Error
              ? cleanupError
              : new Error(String(cleanupError)),
        },
        `Failed to clean up work directory: ${workDir}`,
      );
    }
  }
}

/**
 * Retry a failed backup by resetting status and re-running backup.
 */
export async function retryBackup(
  uploadStateId: string,
): Promise<{ backupKey: string; sizeBytes: number }> {
  // Reset status to NOT_BACKED_UP first
  await prisma.uploadState.update({
    where: { id: uploadStateId },
    data: {
      backupStatus: 'NOT_BACKED_UP',
      backupKey: null,
      backedUpAt: null,
    },
  });

  return backupToGlacier(uploadStateId);
}
