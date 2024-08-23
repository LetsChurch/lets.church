import { NativeConnection, Worker } from '@temporalio/worker';
import envariant from '@knpwrs/envariant';
import * as Sentry from '@sentry/node';
import * as importActivities from '../activities/import';
import { IMPORT_QUEUE } from '../queues';
import { checkYtDlp } from '../../util/env-check';

if (process.env['NODE_ENV'] !== 'development') {
  Sentry.init({
    dsn: envariant('SENTRY_DSN'),
    environment: process.env['NODE_ENV'] ?? 'default',
  });
}

await checkYtDlp();

const TEMPORAL_ADDRESS = envariant('TEMPORAL_ADDRESS');

const MAX_CONCURRENT_WORKFLOW_TASK_EXECUTIONS = envariant(
  'MAX_CONCURRENT_WORKFLOW_TASK_EXECUTIONS',
);
const MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS = envariant(
  'MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS',
);

const importWorker = await Worker.create({
  identity: `import-worker ${envariant('IDENTITY')}`,
  connection: await NativeConnection.connect({ address: TEMPORAL_ADDRESS }),
  activities: importActivities,
  taskQueue: IMPORT_QUEUE,
  shutdownGraceTime: envariant('TEMPORAL_SHUTDOWN_GRACE_TIME'),
  maxConcurrentWorkflowTaskExecutions: parseInt(
    MAX_CONCURRENT_WORKFLOW_TASK_EXECUTIONS,
    10,
  ),
  maxConcurrentActivityTaskExecutions: parseInt(
    MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS,
    10,
  ),
});

await importWorker.run();
