import { join } from 'node:path';
import { createReadStream } from 'node:fs';
import { Context } from '@temporalio/activity';
import mkdirp from 'mkdirp';
import mime from 'mime';
import { throttle } from 'lodash-es';
import {
  retryablePutFile,
  S3_INGEST_BUCKET,
  S3_PUBLIC_BUCKET,
  streamObjectToFile,
} from '../../../util/s3';
import rimraf from '../../../util/rimraf';
import prisma from '../../../util/prisma';
import {
  imageToBlurhash,
  imgJson,
  jpegOptim,
  oxiPng,
} from '../../../util/images';

const WORK_DIR = '/data/process-thumbnail';

export default async function processThumbnail(
  uploadRecordId: string,
  s3UploadKey: string,
) {
  Context.current().heartbeat();

  const dir = join(WORK_DIR, uploadRecordId);
  const downloadPath = join(dir, 'download');

  try {
    await mkdirp(dir);
    await streamObjectToFile(
      S3_INGEST_BUCKET,
      s3UploadKey,
      downloadPath,
      throttle(() => Context.current().heartbeat(), 5000),
    );

    Context.current().heartbeat();

    console.log(`Probing ${downloadPath}`);

    const json = await imgJson(dir, [downloadPath]);

    console.log('Uploading probe');

    await retryablePutFile(
      S3_INGEST_BUCKET,
      `${uploadRecordId}.imagemagick.json`,
      'application/json',
      Buffer.from(JSON.stringify(json, null, 2)),
    );

    if (json.format === 'JPEG') {
      console.log('Optimizing JPEG');
      await jpegOptim(dir, [downloadPath]);
    } else if (json.format === 'PNG') {
      console.log('Optimizing PNG');
      await oxiPng(dir, [downloadPath]);
    }

    console.log('Uploading compressed image');

    const path = `${uploadRecordId}.${mime.getExtension(json.mimeType)}`;

    await retryablePutFile(
      S3_PUBLIC_BUCKET,
      path,
      json.mimeType,
      createReadStream(downloadPath),
    );

    Context.current().heartbeat();

    console.log('Creating blurhash');

    const blurhash = await imageToBlurhash(downloadPath);

    Context.current().heartbeat();

    await prisma.uploadRecord.update({
      where: { id: uploadRecordId },
      data: { defaultThumbnailPath: path, thumbnailBlurhash: blurhash },
    });
  } catch (e) {
    console.log('Error!');
    console.log(e);
    throw e;
  } finally {
    console.log('Removing working directory');
    await rimraf(dir);
  }
}
