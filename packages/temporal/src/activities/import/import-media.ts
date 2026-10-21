import { stat } from 'node:fs/promises';
import { extname, join } from 'node:path';

import { getLocation } from '@letschurch/s3/locations';
import { Context } from '@temporalio/activity';
import mime from 'mime';
import { mkdirp } from 'mkdirp';
import { rimraf } from 'rimraf';
import sanitizeFilename from 'sanitize-filename';
import { v4 as uuid } from 'uuid';

import {
  createUploadRecord,
  type UploadRecordCreateData,
  updateUploadRecord,
} from '../../client';
import { downloadFromUrl } from '../../util/import';
import { downloadUrl } from '../../util/import/download';
import logger from '../../util/logger';

const moduleLogger = logger.child({
  module: 'temporal/activities/import/import-media',
});

const WORK_DIR = process.env.IMPORT_WORKING_DIRECTORY ?? '/data/import';

// Fallback artwork (feed/CSV cover images) has no business being this large.
const MAX_THUMBNAIL_BYTES = 25 * 1024 * 1024;

export default async function importMedia(
  url: string,
  {
    trimSilence = false,
    thumbnailUrl,
    ...data
  }: UploadRecordCreateData & {
    trimSilence?: boolean;
    // Artwork to use when the downloader doesn't produce its own thumbnail
    // (plain media URLs never do), e.g. a podcast's cover image.
    thumbnailUrl?: string | null;
  },
) {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'importMedia',
    context: {
      args: {
        url,
        channelSlug: data.channelSlug,
      },
      meta: JSON.stringify({ data }),
    },
  });

  const heartbeat = (arg?: string) => Context.current().heartbeat(arg);
  const creationOperationId =
    Context.current().info.workflowExecution?.workflowId;
  if (!creationOperationId) {
    throw new Error(
      'Import workflow ID is required to create an upload record',
    );
  }

  let uploadRecordId: string;
  let storageLocation: string;
  const dir = join(WORK_DIR, uuid());
  await mkdirp(dir);

  let mediaUploadKey: string;
  let thumbnailUploadKey: string | null = null;

  try {
    const { mediaPath, thumbnailPath: downloadedThumbnailPath } =
      await downloadFromUrl(url, {
        dir,
        logger: activityLogger,
        heartbeat,
      });

    let thumbnailPath = downloadedThumbnailPath;
    if (!thumbnailPath && thumbnailUrl) {
      // Best-effort: missing artwork shouldn't fail the media import.
      try {
        thumbnailPath = await downloadUrl(
          thumbnailUrl,
          dir,
          activityLogger,
          heartbeat,
          { maxBytes: MAX_THUMBNAIL_BYTES },
        );
      } catch (e) {
        activityLogger.warn(
          { err: e instanceof Error ? e : new Error(String(e)) },
          'Failed to download fallback thumbnail',
        );
      }
    }

    // Placement happens at record creation (on a DB-backed worker); the
    // downloaded size lets it reserve capacity for source + output.
    const created = await createUploadRecord(
      { ...data, sourceBytes: (await stat(mediaPath)).size },
      creationOperationId,
    );
    uploadRecordId = created.id;
    storageLocation = created.storageLocation;
    const { ingest: ingestS3 } = getLocation(created.storageLocation);
    mediaUploadKey = `${uploadRecordId}/${uuid()}`;

    await ingestS3.putFileMultipart({
      key: mediaUploadKey,
      contentType:
        mime.getType(extname(mediaPath)) ?? 'application/octet-stream',
      path: mediaPath,
      onProgress: (progress: number) =>
        heartbeat(`uploading ${Math.round(progress * 1000) / 10}%`),
    });

    if (thumbnailPath) {
      thumbnailUploadKey = `${uploadRecordId}/${uuid()}`;

      await ingestS3.putFile({
        key: thumbnailUploadKey,
        contentType:
          mime.getType(extname(thumbnailPath)) ?? 'application/octet-stream',
        path: thumbnailPath,
      });
    }

    // Create originalFileName from sanitized title + file extension
    const extension = extname(mediaPath).slice(1); // Remove leading dot
    const sanitizedTitle = sanitizeFilename((data.title as string) || 'media');
    const originalFileName = extension
      ? `${sanitizedTitle}.${extension}`
      : sanitizedTitle;

    await updateUploadRecord(uploadRecordId, {
      finalizedUploadKey: mediaUploadKey,
      uploadFinalizedAt: new Date(),
      originalFileName,
    });
  } catch (e) {
    activityLogger.error(
      { err: e instanceof Error ? e : new Error(String(e)) },
      'Failed to import media',
    );
    throw e;
  } finally {
    await rimraf(dir);
  }

  return {
    uploadRecordId,
    storageLocation,
    mediaUploadKey,
    thumbnailUploadKey,
  };
}
