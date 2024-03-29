import path from 'node:path';
import { NativeConnection, Worker } from '@temporalio/worker';
import envariant from '@knpwrs/envariant';
import * as Sentry from '@sentry/node';
import * as backgroundctivities from '../activities/background';
import { BACKGROUND_QUEUE, BACKGROUND_LOW_PRIORITY_QUEUE } from '../queues';
import { waitOnTemporal } from '..';

if (process.env['NODE_ENV'] !== 'development') {
  Sentry.init({
    dsn: envariant('SENTRY_DSN'),
    environment: process.env['NODE_ENV'] ?? 'default',
  });
}

const TEMPORAL_ADDRESS = envariant('TEMPORAL_ADDRESS');
const taskQueue =
  process.env['LC_QUEUE'] === BACKGROUND_LOW_PRIORITY_QUEUE
    ? BACKGROUND_LOW_PRIORITY_QUEUE
    : BACKGROUND_QUEUE;

await waitOnTemporal();

const workflowsPath = new URL(
  `../workflows/index${path.extname(import.meta.url)}`,
  import.meta.url,
).pathname;

const backgroundWorker = await Worker.create({
  identity: `background-worker ${envariant('IDENTITY')}`,
  connection: await NativeConnection.connect({ address: TEMPORAL_ADDRESS }),
  // TODO: prebundle
  workflowsPath,
  activities: backgroundctivities,
  taskQueue,
  shutdownGraceTime: envariant('TEMPORAL_SHUTDOWN_GRACE_TIME'),
});

await backgroundWorker.run();
