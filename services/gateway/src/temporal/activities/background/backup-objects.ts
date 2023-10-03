import { throttle } from 'lodash-es';
import { Context } from '@temporalio/activity';
import { backupObjects } from '../../../util/s3';
import logger from '../../../util/logger';

const moduleLogger = logger.child({
  module: 'temporal/activities/background/backup-objects',
});

export default async function backupObjectsActivity(
  source: 'INGEST' | 'PUBLIC',
  prefix: string,
) {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'backupObjectsActivity',
    args: {
      prefix,
    },
  });

  activityLogger.info(`Backing up prefix ${prefix} from source ${source}`);
  const heartbeat = throttle(() => Context.current().heartbeat(), 5000);
  await backupObjects(source, prefix, heartbeat);
  activityLogger.info('Done!');
}
