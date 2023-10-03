import all from 'it-all';
import filter from 'it-filter';
import { Context } from '@temporalio/activity';
import { throttle } from 'lodash-es';
import { deleteFile, listKeys } from '../../../util/s3';
import logger from '../../../util/logger';

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
    filter(listKeys('PUBLIC', id), (key) => /\d{5}\.jpg$/.test(key)),
  );

  const heartbeat = throttle(
    (key: string) => Context.current().heartbeat(`Deleted ${key}`),
    5000,
  );

  activityLogger.info(`Deleting ${keys.length} old thumbnails`);

  for (const key of keys) {
    await deleteFile('PUBLIC', key);
    heartbeat(key);
  }

  activityLogger.info(`Done deleting ${keys.length} old thumbnails`);
}
