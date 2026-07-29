import { stat } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { ingestS3 } from '@letschurch/s3/ingest';
import { publicS3 } from '@letschurch/s3/public';
import { Context } from '@temporalio/activity';
import { chunk, compact, maxBy } from 'es-toolkit';
import fastGlob from 'fast-glob';
import { mkdirp } from 'mkdirp';
import pMap from 'p-map';
import pRetry from 'p-retry';
import { rimraf } from 'rimraf';

import { updateUploadRecord } from '../../../client';
import { amaDeviceBudget } from '../../../util/ama-budget';
import {
  probeToDecodeCost,
  resolveHwAccel,
  runFfmpegThumbnails,
  thumbnailsUseAma,
} from '../../../util/ffmpeg';
import { concatThumbs, imageToBlurhash } from '../../../util/images';
import logger from '../../../util/logger';
import type { Probe } from '../../../util/zod';

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
    context: {
      args: {
        uploadRecordId,
        s3UploadKey,
      },
    },
  });

  // A reprocessing run must hide candidates from the previous run until every
  // new frame is available. This is also the explicit "in progress" signal
  // consumed by the dashboard polling query.
  await updateUploadRecord(uploadRecordId, {
    thumbnailCount: null,
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

  // On the AMA path, thumbnail extraction hardware-decodes the whole source and
  // JPEG-encodes on-device, so it claims device budget (1 jpeg_ama session + the
  // source decode pixels) before running ffmpeg — the same dual-constraint pool
  // the transcode encoder uses, so the two can't jointly oversubscribe the
  // device. No-op on the software path.
  const hwAccel = resolveHwAccel();
  let releaseBudget: () => void = () => {};
  let generatedThumbnailCount = 0;

  try {
    if (thumbnailsUseAma(probe, hwAccel)) {
      // Hardware thumbnail extraction = 1 jpeg_ama session + the source decode
      // load. Charged against the same device budget as transcode encode work.
      const cost = { sessions: 1, pixels: probeToDecodeCost(probe) };
      activityLogger.info(
        `Acquiring AMA device budget for thumbnails (sessions: ${cost.sessions}, pixels: ${cost.pixels.toFixed(
          2,
        )}; free sessions ${amaDeviceBudget.freeSessions()}/${amaDeviceBudget.max.sessions}, pixels ${amaDeviceBudget
          .freePixels()
          .toFixed(2)}/${amaDeviceBudget.max.pixels})`,
      );
      const waitHeartbeat = setInterval(
        () =>
          Context.current().heartbeat('waiting for AMA budget (thumbnails)'),
        30_000,
      );
      try {
        releaseBudget = await amaDeviceBudget.acquire(cost, cancellationSignal);
      } finally {
        clearInterval(waitHeartbeat);
      }
    }

    activityLogger.info('Creating thumbnails with ffmpeg');
    const proc = runFfmpegThumbnails(
      workingDir,
      downloadPath,
      probe,
      cancellationSignal,
      hwAccel,
    );
    proc.stdout?.on('data', () => Context.current().heartbeat('stdout'));
    proc.stderr?.on('data', () => Context.current().heartbeat('stderr'));
    await proc;
    // The device is done decoding; release before the CPU/IO tail (uploads,
    // blurhash, hovernail). Idempotent with the finally below.
    releaseBudget();
    const thumbnailJpgs = (await fastGlob(join(workingDir, '*.jpg'))).sort();
    generatedThumbnailCount = thumbnailJpgs.length;
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
      // Skip uploading the largest thumbnail here (already uploaded above).
      // `continue`, not `return` — a `return` would abandon the rest of the
      // thumbnails and the hovernail generation below.
      if (path === largestThumbnail) {
        continue;
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
    activityLogger.info({ context: { pickedThumbnails } });
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
    activityLogger.error(
      { err: e instanceof Error ? e : new Error(String(e)) },
      'Failed to create thumbnails',
    );
    throw e;
  } finally {
    // Safety net: return any still-held device budget (e.g. ffmpeg threw before
    // the post-decode release). Idempotent, so the success path's earlier
    // release makes this a no-op.
    releaseBudget();
    await rimraf(workingDir);
  }

  // Publish the candidate count and completion signal together, only after all
  // individual frames and the hovernail have finished uploading. This keeps
  // clients from constructing URLs for objects that are not available yet.
  await pRetry(
    async (attempt) => {
      activityLogger.info(
        `Publishing generated thumbnails: attempt ${attempt}`,
      );
      await updateUploadRecord(uploadRecordId, {
        thumbnailCount: generatedThumbnailCount,
      });
    },
    {
      retries: 5,
      onFailedAttempt: (e) => {
        activityLogger.warn(
          `${e.attemptNumber}: Failed to publish generated thumbnails: ${e}`,
        );
      },
    },
  );
}
