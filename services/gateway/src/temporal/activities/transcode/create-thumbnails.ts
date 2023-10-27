import { basename, join } from 'node:path';
import { stat } from 'node:fs/promises';
import mkdirp from 'mkdirp';
import { Context } from '@temporalio/activity';
import pMap from 'p-map';
import fastGlob from 'fast-glob';
import { chunk, compact, maxBy } from 'lodash-es';
import pRetry from 'p-retry';
import rimraf from 'rimraf';
import { retryablePutFile, streamObjectToFile } from '../../../util/s3';
import { runFfmpegThumbnails } from '../../../util/ffmpeg';
import { concatThumbs, imageToBlurhash } from '../../../util/images';
import type { Probe } from '../../../util/zod';
import { updateUploadRecord } from '../..';
import logger from '../../../util/logger';

const moduleLogger = logger.child({
  module: 'temporal/activities/transcode/create-thumbnails',
});

const WORK_DIR =
  process.env['THUMBNAILS_WORKING_DIRECTORY'] ?? '/data/thumbnails';

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

  await streamObjectToFile('INGEST', s3UploadKey, downloadPath, () =>
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
    const largestThumbnail = maxBy(thumbnailsWithSizes, 'size')?.path;
    if (largestThumbnail) {
      // Upload the largest thumbnail as the video thumbnail
      Context.current().heartbeat();
      activityLogger.info(`Uploading thumbnail: ${largestThumbnail}`);
      const key = `${uploadRecordId}/${basename(largestThumbnail)}`;
      await retryablePutFile({
        to: 'PUBLIC',
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
      await retryablePutFile({
        to: 'PUBLIC',
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
      thumbnailsWithSizesChunks.map((chunks) => maxBy(chunks, 'size')?.path),
    );
    Context.current().heartbeat();
    activityLogger.info({ pickedThumbnails });
    await concatThumbs(workingDir, pickedThumbnails);
    activityLogger.info('Uploading hovernail');
    await retryablePutFile({
      to: 'PUBLIC',
      key: `${uploadRecordId}/hovernail.jpg`,
      contentType: 'image/jpeg',
      path: join(workingDir, 'hovernail.jpg'),
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
