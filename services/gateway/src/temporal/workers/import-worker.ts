import { NativeConnection, Worker } from '@temporalio/worker';
import envariant from '@knpwrs/envariant';
import * as Sentry from '@sentry/node';
import * as importActivities from '../activities/import';
import { IMPORT_QUEUE } from '../queues';
import { checkYtDlp } from '../../util/env-check';

Sentry.init({
  dsn: envariant('SENTRY_DSN'),
  environment: process.env['NODE_ENV'] ?? 'default',
});

await checkYtDlp();

const TEMPORAL_ADDRESS = envariant('TEMPORAL_ADDRESS');

const importWorker = await Worker.create({
  identity: `import-worker ${envariant('IDENTITY')}`,
  connection: await NativeConnection.connect({ address: TEMPORAL_ADDRESS }),
  activities: importActivities,
  taskQueue: IMPORT_QUEUE,
  shutdownGraceTime: envariant('TEMPORAL_SHUTDOWN_GRACE_TIME'),
  maxConcurrentWorkflowTaskExecutions: 2,
  maxConcurrentActivityTaskExecutions: 2,
});

await importWorker.run();
