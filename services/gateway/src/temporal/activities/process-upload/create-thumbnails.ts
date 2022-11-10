import { Context } from '@temporalio/activity';
import mkdirp from 'mkdirp';
import { basename, join } from 'node:path';
import PQueue from 'p-queue';
import pMap from 'p-map';
import fastGlob from 'fast-glob';
import { chunk, compact, maxBy } from 'lodash-es';
import { retryablePutFile, streamObjectToFile } from '../../../util/s3';
import { concatThumbs, runFfmpegThumbnails } from '../../../util/ffmpeg';
import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import rimraf from '../../../util/rimraf';

const WORK_DIR = '/data/thumbnails';

export default async function createThumbnails(id: string) {
  const dir = join(WORK_DIR, id);

  await mkdirp(dir);
  const downloadPath = join(dir, id);
  await streamObjectToFile(id, downloadPath);

  Context.current().heartbeat();
  try {
    await runFfmpegThumbnails(dir, downloadPath);
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
    uploadQueue.addAll(
      thumbnailJpgs.map((path) => async () => {
        Context.current().heartbeat();
        console.log(`Uploading thumbnail: ${path}`);
        await retryablePutFile(
          `${id}/${basename(path)}`,
          'image/jpeg',
          createReadStream(path),
          { contentLength: (await stat(path)).size },
        );
        Context.current().heartbeat();
        console.log(`Done uploading thumbnail: ${path}`);
      }),
    );
    const chunkSize = Math.ceil(thumbnailsWithSizes.length / 5);
    const thumbnailsWithSizesChunks = chunk(thumbnailsWithSizes, chunkSize);
    const pickedThumbnails = compact(
      thumbnailsWithSizesChunks.map((chunks) => maxBy(chunks, 'size')?.path),
    );
    Context.current().heartbeat();
    await concatThumbs(dir, pickedThumbnails);
    uploadQueue.add(async () => {
      console.log('Uploading hovernail');
      await retryablePutFile(
        `${id}/hovernail.jpg`,
        'image/jpeg',
        createReadStream(join(dir, 'hovernail.jpg')),
      );
      Context.current().heartbeat();
      console.log('Done uploading hovernail');
    });
    await uploadQueue.onEmpty();
  } catch (e) {
    console.log('Error!');
    console.log(e);
    throw e;
  } finally {
    await rimraf(dir);
  }
}
