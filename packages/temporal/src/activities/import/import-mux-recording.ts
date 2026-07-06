import { extname, join } from 'node:path';
import { ingestS3 } from '@letschurch/s3/ingest';
import { Context } from '@temporalio/activity';
import mime from 'mime';
import { mkdirp } from 'mkdirp';
import { rimraf } from 'rimraf';
import sanitizeFilename from 'sanitize-filename';
import { v4 as uuid } from 'uuid';
import { updateUploadRecord } from '../../client';
import { downloadFromUrl } from '../../util/import';
import logger from '../../util/logger';
import { getMuxRecordingMp4Url } from '../../util/mux';

const moduleLogger = logger.child({
  module: 'temporal/activities/import/import-mux-recording',
});

const WORK_DIR = process.env.IMPORT_WORKING_DIRECTORY ?? '/data/import';

// Download a finished Mux live-stream recording and stage it on the existing
// (live) UploadRecord so the normal processMediaWorkflow can transcode it onto
// our CDN. Unlike importMedia this does NOT create a record — it imports into
// the record that was created when the broadcast went live.
export default async function importMuxRecording(
  uploadRecordId: string,
  muxAssetId: string,
  title?: string | null,
) {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'importMuxRecording',
    context: { args: { uploadRecordId, muxAssetId } },
  });

  const heartbeat = (arg?: string) => Context.current().heartbeat(arg);

  const dir = join(WORK_DIR, uuid());
  await mkdirp(dir);

  let mediaUploadKey: string;

  try {
    const mp4Url = await getMuxRecordingMp4Url(muxAssetId);
    activityLogger.info(
      { context: { mp4Url } },
      'Resolved Mux recording MP4 URL',
    );

    const { mediaPath } = await downloadFromUrl(mp4Url, {
      dir,
      logger: activityLogger,
      heartbeat,
    });

    // Deterministic key (one asset per broadcast) so an activity retry
    // overwrites the same object instead of orphaning a new one each attempt.
    mediaUploadKey = `${uploadRecordId}/mux-${muxAssetId}`;

    await ingestS3.putFileMultipart({
      key: mediaUploadKey,
      contentType:
        mime.getType(extname(mediaPath)) ?? 'application/octet-stream',
      path: mediaPath,
      onProgress: (progress: number) =>
        heartbeat(`uploading ${Math.round(progress * 1000) / 10}%`),
    });

    const extension = extname(mediaPath).slice(1);
    const sanitizedTitle = sanitizeFilename(title || 'broadcast');
    const originalFileName = extension
      ? `${sanitizedTitle}.${extension}`
      : sanitizedTitle;

    await updateUploadRecord(uploadRecordId, {
      finalizedUploadKey: mediaUploadKey,
      uploadFinalized: true,
      uploadFinalizedAt: new Date(),
      originalFileName,
    });
  } catch (e) {
    activityLogger.error(
      { err: e instanceof Error ? e : new Error(String(e)) },
      'Failed to import Mux recording',
    );
    throw e;
  } finally {
    // Best-effort cleanup — a temp-dir removal failure must not fail an
    // otherwise-successful import (which would trigger a pointless retry).
    await rimraf(dir).catch((err) => {
      activityLogger.warn(
        { err: err instanceof Error ? err : new Error(String(err)) },
        'Failed to clean up Mux import working directory',
      );
    });
  }

  return { mediaUploadKey };
}
