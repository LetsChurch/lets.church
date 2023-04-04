import { basename, join } from 'node:path';
import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import mkdirp from 'mkdirp';
import { Context } from '@temporalio/activity';
import PQueue from 'p-queue';
import pMap from 'p-map';
import fastGlob from 'fast-glob';
import { chunk, compact, maxBy, throttle } from 'lodash-es';
import pRetry from 'p-retry';
import rimraf from 'rimraf';
import {
  retryablePutFile,
  S3_INGEST_BUCKET,
  S3_PUBLIC_BUCKET,
  streamObjectToFile,
} from '../../../util/s3';
import { runFfmpegThumbnails } from '../../../util/ffmpeg';
import { concatThumbs, imageToBlurhash } from '../../../util/images';
import prisma from '../../../util/prisma';

const WORK_DIR = '/data/thumbnails';

export default async function createThumbnails(
  uploadRecordId: string,
  s3UploadKey: string,
) {
  const cancellationSignal = Context.current().cancellationSignal;
  const dataHeartbeat = throttle(() => Context.current().heartbeat(), 5000);
  const dir = join(WORK_DIR, s3UploadKey);

  await mkdirp(dir);
  const downloadPath = join(dir, 'download');
  await streamObjectToFile(
    S3_INGEST_BUCKET,
    s3UploadKey,
    downloadPath,
    dataHeartbeat,
  );

  Context.current().heartbeat();
  try {
    const proc = runFfmpegThumbnails(dir, downloadPath, cancellationSignal);
    proc.stdout?.on('data', dataHeartbeat);
    proc.stderr?.on('data', dataHeartbeat);
    await proc;
    const uploadQueue = new PQueue({ concurrency: 1 });
    const thumbnailJpgs = (await fastGlob(join(dir, '*.jpg'))).sort();
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
      uploadQueue.add(
        async () => {
          Context.current().heartbeat();
          console.log(`Uploading thumbnail: ${largestThumbnail}`);
          const path = `${uploadRecordId}/${basename(largestThumbnail)}`;
          await retryablePutFile(
            S3_PUBLIC_BUCKET,
            path,
            'image/jpeg',
            createReadStream(largestThumbnail),
            { contentLength: (await stat(largestThumbnail)).size },
          );
          await pRetry(
            async (attempt) => {
              console.log(`Setting thumbnail path: attempt ${attempt}`);

              const blurhash = await imageToBlurhash(largestThumbnail);

              await prisma.uploadRecord.updateMany({
                where: { id: uploadRecordId, defaultThumbnailPath: null },
                data: {
                  defaultThumbnailPath: path,
                  thumbnailBlurhash: blurhash,
                },
              });
            },
            { retries: 8 },
          );
          Context.current().heartbeat();
          console.log(`Done uploading thumbnail: ${largestThumbnail}`);
        },
        {
          signal: cancellationSignal,
        },
      );
    }
    // Upload the remaining thumbnails
    uploadQueue.addAll(
      thumbnailJpgs.map((path) => async () => {
        // Skip uploading the largest thumbnail here
        if (path === largestThumbnail) {
          return;
        }

        Context.current().heartbeat();
        console.log(`Uploading thumbnail: ${path}`);
        await retryablePutFile(
          S3_PUBLIC_BUCKET,
          `${uploadRecordId}/${basename(path)}`,
          'image/jpeg',
          createReadStream(path),
          { contentLength: (await stat(path)).size },
        );
        Context.current().heartbeat();
        console.log(`Done uploading thumbnail: ${path}`);
      }),
      {
        signal: cancellationSignal,
      },
    );
    const chunkSize = Math.ceil(thumbnailsWithSizes.length / 5);
    const thumbnailsWithSizesChunks = chunk(thumbnailsWithSizes, chunkSize);
    const pickedThumbnails = compact(
      thumbnailsWithSizesChunks.map((chunks) => maxBy(chunks, 'size')?.path),
    );
    Context.current().heartbeat();
    console.log({ pickedThumbnails });
    await concatThumbs(dir, pickedThumbnails);
    uploadQueue.add(
      async () => {
        console.log('Uploading hovernail');
        await retryablePutFile(
          S3_PUBLIC_BUCKET,
          `${uploadRecordId}/hovernail.jpg`,
          'image/jpeg',
          createReadStream(join(dir, 'hovernail.jpg')),
        );
        Context.current().heartbeat();
        console.log('Done uploading hovernail');
      },
      {
        signal: cancellationSignal,
      },
    );
    await uploadQueue.onEmpty();
  } catch (e) {
    console.log('Error!');
    console.log(e);
    throw e;
  } finally {
    dataHeartbeat.flush();
    await rimraf(dir);
  }
}
