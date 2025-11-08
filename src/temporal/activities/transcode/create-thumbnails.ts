import { stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Context } from '@temporalio/activity';
import { chunk, compact, maxBy } from 'es-toolkit';
import fastGlob from 'fast-glob';
import { mkdirp } from 'mkdirp';
import pMap from 'p-map';
import pRetry from 'p-retry';
import { rimraf } from 'rimraf';
import { runFfmpegThumbnails } from '../../../util/ffmpeg';
import { concatThumbs, imageToBlurhash } from '../../../util/images';
import logger from '../../../util/logger';
import { ingestS3, publicS3 } from '../../../util/s3';
import type { Probe } from '../../../util/zod';
import { updateUploadRecord } from '../..';

const moduleLogger = logger.child({
  module: 'temporal/activities/transcode/create-thumbnails',
});

const WORK_DIR = process.env.THUMBNAILS_WORKING_DIRECTORY ?? '/data/thumbnails';

export default async function createThumbnails(
  uploadRecordId: string,
  s3UploadKey: string,
  probe: Probe,
) {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'createThumbnails',
    args: {
      uploadRecordId,
      s3UploadKey,
    },
  });

  const cancellationSignal = Context.current().cancellationSignal;
  const workingDir = join(WORK_DIR, s3UploadKey);

  activityLogger.info('Making working directory');
  await mkdirp(workingDir);
  const downloadPath = join(workingDir, 'download');

  await ingestS3.streamObjectToFile(s3UploadKey, downloadPath, () =>
    Context.current().heartbeat('download'),
  );

  Context.current().heartbeat();
  try {
    activityLogger.info('Creating thumbnails with ffmpeg');
    const proc = runFfmpegThumbnails(
      workingDir,
      downloadPath,
      probe,
      cancellationSignal,
    );
    proc.stdout?.on('data', () => Context.current().heartbeat('stdout'));
    proc.stderr?.on('data', () => Context.current().heartbeat('stderr'));
    await proc;
    const thumbnailJpgs = (await fastGlob(join(workingDir, '*.jpg'))).sort();
    const thumbnailsWithSizes = await pMap(
      thumbnailJpgs,
      async (p) => ({
        path: p,
        size: (await stat(p)).size,
      }),
      { concurrency: 5 },
    );
    Context.current().heartbeat();
    activityLogger.info('Uploading thumbnails');
    const largestThumbnail = maxBy(thumbnailsWithSizes, (t) => t.size)?.path;
    if (largestThumbnail) {
      // Upload the largest thumbnail as the video thumbnail
      Context.current().heartbeat();
      activityLogger.info(`Uploading thumbnail: ${largestThumbnail}`);
      const key = `${uploadRecordId}/${basename(largestThumbnail)}`;
      await publicS3.retryablePutFile({
        key,
        contentType: 'image/jpeg',
        path: largestThumbnail,
        contentLength: (await stat(largestThumbnail)).size,
        signal: Context.current().cancellationSignal,
      });
      await pRetry(
        async (attempt) => {
          activityLogger.info(`Setting thumbnail path: attempt ${attempt}`);

          const blurhash = await imageToBlurhash(largestThumbnail);

          await updateUploadRecord(uploadRecordId, {
            defaultThumbnailPath: key,
            defaultThumbnailBlurhash: blurhash,
            thumbnailCount: thumbnailJpgs.length,
          });
        },
        {
          retries: 5,
          onFailedAttempt: (e) => {
            activityLogger.warn(
              `${e.attemptNumber}: Failed to set thumbnail path: ${e}`,
            );
          },
        },
      );
      Context.current().heartbeat();
      activityLogger.info(`Done uploading thumbnail: ${largestThumbnail}`);
    }
    // Upload the remaining thumbnails
    for (const path of thumbnailJpgs) {
      // Skip uploading the largest thumbnail here
      if (path === largestThumbnail) {
        return;
      }

      Context.current().heartbeat();
      activityLogger.info(`Uploading thumbnail: ${path}`);
      await publicS3.retryablePutFile({
        key: `${uploadRecordId}/${basename(path)}`,
        contentType: 'image/jpeg',
        path,
        contentLength: (await stat(path)).size,
        signal: Context.current().cancellationSignal,
      });
      Context.current().heartbeat();
      activityLogger.info(`Done uploading thumbnail: ${path}`);
    }
    const chunkSize = Math.ceil(thumbnailsWithSizes.length / 5);
    const thumbnailsWithSizesChunks = chunk(thumbnailsWithSizes, chunkSize);
    const pickedThumbnails = compact(
      thumbnailsWithSizesChunks.map(
        (chunks) => maxBy(chunks, (c) => c.size)?.path,
      ),
    );
    Context.current().heartbeat();
    activityLogger.info({ pickedThumbnails });
    await concatThumbs(workingDir, pickedThumbnails);
    activityLogger.info('Uploading hovernail');
    const path = join(workingDir, 'hovernail.jpg');
    await publicS3.retryablePutFile({
      key: `${uploadRecordId}/hovernail.jpg`,
      contentType: 'image/jpeg',
      contentLength: (await stat(path)).size,
      path,
      signal: Context.current().cancellationSignal,
    });
    Context.current().heartbeat();
    activityLogger.info('Done uploading hovernail');
  } catch (e) {
    activityLogger.error(e instanceof Error ? e.message : e);
    throw e;
  } finally {
    await rimraf(workingDir);
  }
}
