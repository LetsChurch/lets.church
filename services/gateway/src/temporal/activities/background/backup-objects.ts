import { throttle } from 'lodash-es';
import { Context } from '@temporalio/activity';
import { backupObjects } from '../../../util/s3';

export default async function backupObjectsAction(
  source: 'INGEST' | 'PUBLIC',
  prefix: string,
) {
  console.log(`Backing up prefix ${prefix} from source ${source}`);
  const heartbeat = throttle(() => Context.current().heartbeat(), 5000);
  await backupObjects(source, prefix, heartbeat);
  console.log('Done!');
}
