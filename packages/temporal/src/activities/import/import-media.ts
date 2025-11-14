import { extname, join } from 'node:path';
import type { Prisma } from '@letschurch/db';
import logger from '@letschurch/util';
import { Context } from '@temporalio/activity';
import mime from 'mime';
import { mkdirp } from 'mkdirp';
import { rimraf } from 'rimraf';
import { v4 as uuid } from 'uuid';
import { createUploadRecord, updateUploadRecord } from '../../client';
import { downloadFromUrl } from '../../util/import';
import { ingestS3 } from '../../util/s3';

const moduleLogger = logger.child({
  module: 'temporal/activities/import/import-media',
});

const WORK_DIR = process.env.IMPORT_WORKING_DIRECTORY ?? '/data/import';

export default async function importMedia(
  url: string,
  {
    trimSilence = false,
    ...data
  }: Prisma.UploadRecordCreateArgs['data'] & { trimSilence?: boolean },
) {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'importMedia',
    args: {
      url,
      channelSlug: data.channel?.connect?.slug,
    },
    meta: JSON.stringify({ data }),
  });

  const heartbeat = (arg?: string) => Context.current().heartbeat(arg);

  let uploadRecordId: string;
  const dir = join(WORK_DIR, uuid());
  await mkdirp(dir);

  let mediaUploadKey: string;
  let thumbnailUploadKey: string | null = null;

  try {
    const { mediaPath, thumbnailPath } = await downloadFromUrl(url, {
      dir,
      logger: activityLogger,
      heartbeat,
    });

    uploadRecordId = await createUploadRecord(
      data,
      Context.current().info.workflowExecution.workflowId,
    );
    mediaUploadKey = `${uploadRecordId}/${uuid()}`;

    await ingestS3.putFileMultipart({
      key: mediaUploadKey,
      contentType:
        mime.getType(extname(mediaPath)) ?? 'application/octet-stream',
      path: mediaPath,
      onProgress: (progress: number) =>
        heartbeat(`uploading ${Math.round(progress * 1000) / 10}%`),
    });

    if (thumbnailPath) {
      thumbnailUploadKey = `${uploadRecordId}/${uuid()}`;

      await ingestS3.putFile({
        key: thumbnailUploadKey,
        contentType:
          mime.getType(extname(thumbnailPath)) ?? 'application/octet-stream',
        path: thumbnailPath,
      });
    }

    await updateUploadRecord(uploadRecordId, {
      finalizedUploadKey: mediaUploadKey,
      uploadFinalizedAt: new Date(),
    });
  } catch (e) {
    activityLogger.error(e instanceof Error ? e.message : e);
    throw e;
  } finally {
    await rimraf(dir);
  }

  return { uploadRecordId, mediaUploadKey, thumbnailUploadKey };
}
