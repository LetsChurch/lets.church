import { join } from 'node:path';
import { Context } from '@temporalio/activity';
import mkdirp from 'mkdirp';
import mime from 'mime';
import { throttle } from 'lodash-es';
import rimraf from 'rimraf';
import type { RequireAllOrNone } from 'type-fest';
import { nanoid } from 'nanoid';
import { retryablePutFile, streamObjectToFile } from '../../../util/s3';
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
      'INGEST',
      s3UploadKey,
      downloadPath,
      throttle(() => Context.current().heartbeat(), 5000),
    );

    Context.current().heartbeat();

    console.log(`Probing ${downloadPath}`);

    const json = await imgJson(dir, [downloadPath]);

    console.log('Uploading probe');

    await retryablePutFile({
      to: 'INGEST',
      key: `${targetId}.imagemagick.json`,
      contentType: 'application/json',
      body: Buffer.from(JSON.stringify(json, null, 2)),
    });

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

    const path = `${targetId}/${postProcess}-${nanoid()}.${mime.getExtension(
      json.mimeType,
    )}`;

    await retryablePutFile({
      to: 'PUBLIC',
      key: path,
      contentType: json.mimeType,
      path: downloadPath,
    });

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
