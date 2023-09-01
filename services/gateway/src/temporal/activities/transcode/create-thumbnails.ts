import { basename, join } from 'node:path';
import { stat } from 'node:fs/promises';
import mkdirp from 'mkdirp';
import { Context } from '@temporalio/activity';
import pMap from 'p-map';
import fastGlob from 'fast-glob';
import { chunk, compact, maxBy } from 'lodash-es';
import pRetry from 'p-retry';
import rimraf from 'rimraf';
import { createPresignedGetUrl, retryablePutFile } from '../../../util/s3';
import { runFfmpegThumbnails } from '../../../util/ffmpeg';
import { concatThumbs, imageToBlurhash } from '../../../util/images';
import type { Probe } from '../../../util/zod';
import { updateUploadRecord } from '../..';
import { streamUrlToDisk } from '../../../util/node';
import { dataHeartbeat } from '../../../util/temporal';

const WORK_DIR =
  process.env['THUMBNAILS_WORKING_DIRECTORY'] ?? '/data/thumbnails';

export default async function createThumbnails(
  uploadRecordId: string,
  s3UploadKey: string,
  probe: Probe,
) {
  const cancellationSignal = Context.current().cancellationSignal;
  const workingDir = join(WORK_DIR, s3UploadKey);

  console.log('Making working directory');
  await mkdirp(workingDir);
  const downloadPath = join(workingDir, 'download');

  await streamUrlToDisk(
    await createPresignedGetUrl('INGEST', s3UploadKey),
    downloadPath,
    () => dataHeartbeat('download'),
  );

  Context.current().heartbeat();
  try {
    console.log('Creating thumbnails with ffmpeg');
    const proc = runFfmpegThumbnails(
      workingDir,
      downloadPath,
      probe,
      cancellationSignal,
    );
    proc.stdout?.on('data', dataHeartbeat);
    proc.stderr?.on('data', dataHeartbeat);
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
    console.log('Uploading thumbnails');
    const largestThumbnail = maxBy(thumbnailsWithSizes, 'size')?.path;
    if (largestThumbnail) {
      // Upload the largest thumbnail as the video thumbnail
      Context.current().heartbeat();
      console.log(`Uploading thumbnail: ${largestThumbnail}`);
      const key = `${uploadRecordId}/${basename(largestThumbnail)}`;
      await retryablePutFile({
        to: 'PUBLIC',
        key,
        contentType: 'image/jpeg',
        path: largestThumbnail,
        contentLength: (await stat(largestThumbnail)).size,
      });
      await pRetry(
        async (attempt) => {
          console.log(`Setting thumbnail path: attempt ${attempt}`);

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
            console.log(
              `${e.attemptNumber}: Failed to set thumbnail path: ${e}`,
            );
          },
        },
      );
      Context.current().heartbeat();
      console.log(`Done uploading thumbnail: ${largestThumbnail}`);
    }
    // Upload the remaining thumbnails
    for (const path of thumbnailJpgs) {
      // Skip uploading the largest thumbnail here
      if (path === largestThumbnail) {
        return;
      }

      Context.current().heartbeat();
      console.log(`Uploading thumbnail: ${path}`);
      await retryablePutFile({
        to: 'PUBLIC',
        key: `${uploadRecordId}/${basename(path)}`,
        contentType: 'image/jpeg',
        path,
        contentLength: (await stat(path)).size,
      });
      Context.current().heartbeat();
      console.log(`Done uploading thumbnail: ${path}`);
    }
    const chunkSize = Math.ceil(thumbnailsWithSizes.length / 5);
    const thumbnailsWithSizesChunks = chunk(thumbnailsWithSizes, chunkSize);
    const pickedThumbnails = compact(
      thumbnailsWithSizesChunks.map((chunks) => maxBy(chunks, 'size')?.path),
    );
    Context.current().heartbeat();
    console.log({ pickedThumbnails });
    await concatThumbs(workingDir, pickedThumbnails);
    console.log('Uploading hovernail');
    await retryablePutFile({
      to: 'PUBLIC',
      key: `${uploadRecordId}/hovernail.jpg`,
      contentType: 'image/jpeg',
      path: join(workingDir, 'hovernail.jpg'),
    });
    Context.current().heartbeat();
    console.log('Done uploading hovernail');
  } catch (e) {
    console.log('Error!');
    console.log(e);
    throw e;
  } finally {
    dataHeartbeat.flush();
    await rimraf(workingDir);
  }
}
