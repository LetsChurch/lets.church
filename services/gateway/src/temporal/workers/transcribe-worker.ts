import { NativeConnection, Worker } from '@temporalio/worker';
import envariant from '@knpwrs/envariant';
import * as Sentry from '@sentry/node';
import * as activities from '../activities/transcribe';
import { TRANSCRIBE_QUEUE } from '../queues';
import { waitOnTemporal } from '..';
import { checkWhisper } from '../../util/env-check';

Sentry.init({
  dsn: envariant('SENTRY_DSN'),
  environment: process.env['NODE_ENV'] ?? 'default',
});

await checkWhisper();

const TEMPORAL_ADDRESS = envariant('TEMPORAL_ADDRESS');
const MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS = envariant(
  'MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS',
);

await waitOnTemporal();

const worker = await Worker.create({
  identity: `transcribe-worker ${envariant('IDENTITY')}`,
  connection: await NativeConnection.connect({ address: TEMPORAL_ADDRESS }),
  activities,
  taskQueue: TRANSCRIBE_QUEUE,
  maxConcurrentActivityTaskExecutions: parseInt(
    MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS,
    10,
  ),
});

await worker.run();
