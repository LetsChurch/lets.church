import { join } from 'node:path';
import { Context } from '@temporalio/activity';
import mime from 'mime';
import { mkdirp } from 'mkdirp';
import { nanoid } from 'nanoid';
import { rimraf } from 'rimraf';
import { imageToBlurhash, imgJson, jpegOptim, oxiPng } from '../../util/images';
import logger from '../../util/logger';
import { ingestS3, publicS3 } from '../../util/s3';
import type { UploadPostProcessValue } from '../../util/types';

const moduleLogger = logger.child({
  module: 'temporal/activities/background/process-image',
});

const WORK_DIR =
  process.env.PROCESS_IMAGE_WORKING_DIRECTORY ?? '/data/process-image';

export default async function processImage(
  postProcess: UploadPostProcessValue,
  targetId: string,
  s3UploadKey: string,
) {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'processImage',
    args: {
      targetId,
      s3UploadKey,
    },
    meta: JSON.stringify({ postProcess }),
  });

  Context.current().heartbeat();

  const dir = join(WORK_DIR, targetId);
  const downloadPath = join(dir, 'download');

  try {
    await mkdirp(dir);
    await ingestS3.streamObjectToFile(s3UploadKey, downloadPath);

    Context.current().heartbeat();

    activityLogger.info(`Probing ${downloadPath}`);

    const json = await imgJson(dir, [downloadPath]);

    activityLogger.info('Uploading probe');

    await ingestS3.retryablePutFile({
      key: `${s3UploadKey}.imagemagick.json`,
      contentType: 'application/json',
      body: Buffer.from(JSON.stringify(json, null, 2)),
      signal: Context.current().cancellationSignal,
    });

    if (json.format === 'JPEG') {
      activityLogger.info('Optimizing JPEG');
      await jpegOptim(dir, [downloadPath]);
    } else if (json.format === 'PNG') {
      activityLogger.info('Optimizing PNG');
      await oxiPng(dir, [downloadPath]);
    }

    activityLogger.info('Uploading compressed image');

    const path = `${targetId}/${postProcess}-${nanoid()}.${mime.getExtension(
      json.mimeType,
    )}`;

    await publicS3.retryablePutFile({
      key: path,
      contentType: json.mimeType,
      path: downloadPath,
      signal: Context.current().cancellationSignal,
    });

    Context.current().heartbeat();

    activityLogger.info('Creating blurhash');

    const blurhash = await imageToBlurhash(downloadPath);

    Context.current().heartbeat();

    return { path, blurhash };
  } catch (e) {
    activityLogger.error(e instanceof Error ? e.message : e);
    throw e;
  } finally {
    activityLogger.info('Removing working directory');
    await rimraf(dir);
  }
}
