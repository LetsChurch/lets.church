import { join } from 'node:path';
import { createReadStream } from 'node:fs';
import { Context } from '@temporalio/activity';
import mkdirp from 'mkdirp';
import mime from 'mime';
import { throttle } from 'lodash-es';
import rimraf from 'rimraf';
import type { RequireAllOrNone } from 'type-fest';
import { nanoid } from 'nanoid';
import {
  retryablePutFile,
  S3_INGEST_BUCKET,
  S3_PUBLIC_BUCKET,
  streamObjectToFile,
} from '../../../util/s3';
import {
  croppingResize,
  imageToBlurhash,
  imgJson,
  jpegOptim,
  oxiPng,
} from '../../../util/images';
import type { UploadPostProcessValue } from '../../../schema/types/mutation';

const WORK_DIR = '/data/process-thumbnail';

export default async function processImage(
  postProcess: UploadPostProcessValue,
  targetId: string,
  s3UploadKey: string,
  params: RequireAllOrNone<
    { width?: number; height?: number },
    'width' | 'height'
  > = {},
) {
  Context.current().heartbeat();

  const dir = join(WORK_DIR, targetId);
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
      `${targetId}.imagemagick.json`,
      'application/json',
      Buffer.from(JSON.stringify(json, null, 2)),
    );

    if (params.width && params.height) {
      await croppingResize(dir, downloadPath, params.width, params.height);
    }

    if (json.format === 'JPEG') {
      console.log('Optimizing JPEG');
      await jpegOptim(dir, [downloadPath]);
    } else if (json.format === 'PNG') {
      console.log('Optimizing PNG');
      await oxiPng(dir, [downloadPath]);
    }

    console.log('Uploading compressed image');

    const path = `${postProcess}/${targetId}-${nanoid()}.${mime.getExtension(
      json.mimeType,
    )}`;

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

    return { path, blurhash };
  } catch (e) {
    console.log('Error!');
    console.log(e);
    throw e;
  } finally {
    console.log('Removing working directory');
    await rimraf(dir);
  }
}
