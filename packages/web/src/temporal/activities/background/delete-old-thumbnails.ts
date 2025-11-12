import { Context } from '@temporalio/activity';
import { throttle } from 'es-toolkit';
import all from 'it-all';
import filter from 'it-filter';
import logger from '../../../util/logger';
import { publicS3 } from '../../../util/s3';

const moduleLogger = logger.child({
  module: 'temporal/activities/background/delete-old-thumbnails',
});

export default async function deleteOldThumbnails(id: string) {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'deleteOldThumbnails',
    args: {
      id,
    },
  });

  const keys = await all(
    filter(publicS3.listKeys(id), (key) => /\d{5}\.jpg$/.test(key)),
  );

  const heartbeat = throttle(
    (key: string) => Context.current().heartbeat(`Deleted ${key}`),
    5000,
  );

  activityLogger.info(`Deleting ${keys.length} old thumbnails`);

  for (const key of keys) {
    await publicS3.deleteFile(key);
    heartbeat(key);
  }

  activityLogger.info(`Done deleting ${keys.length} old thumbnails`);
}
