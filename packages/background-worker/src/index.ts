import path from 'node:path';
import * as activities from '@letschurch/temporal/activities/background';
import { BACKGROUND_QUEUE, GLACIER_QUEUE } from '@letschurch/temporal/queues';
import { waitOnTemporal } from '@letschurch/temporal/util/temporal';
import * as Sentry from '@sentry/node';
import { NativeConnection, Worker } from '@temporalio/worker';
import { z } from 'zod';

const { IDENTITY, SENTRY_DSN, TEMPORAL_ADDRESS, TEMPORAL_SHUTDOWN_GRACE_TIME } =
  z
    .object({
      IDENTITY: z.string(),
      SENTRY_DSN: z.string(),
      TEMPORAL_ADDRESS: z.string(),
      TEMPORAL_SHUTDOWN_GRACE_TIME: z.string(),
    })
    .parse(process.env);

if (process.env.NODE_ENV !== 'development') {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'default',
  });
}

await waitOnTemporal();

const workflowsPath = new URL(
  `../../temporal/src/workflows/background/index${path.extname(import.meta.url)}`,
  import.meta.url,
).pathname;

const connection = await NativeConnection.connect({
  address: TEMPORAL_ADDRESS,
});

const backgroundWorker = await Worker.create({
  identity: `background-worker ${IDENTITY}`,
  connection,
  // TODO: prebundle
  workflowsPath,
  activities,
  taskQueue: BACKGROUND_QUEUE,
  shutdownGraceTime: TEMPORAL_SHUTDOWN_GRACE_TIME,
});

const glacierWorker = await Worker.create({
  identity: `glacier-worker ${IDENTITY}`,
  connection,
  activities: { backupToGlacier: activities.backupToGlacier },
  taskQueue: GLACIER_QUEUE,
  shutdownGraceTime: TEMPORAL_SHUTDOWN_GRACE_TIME,
  maxConcurrentActivityTaskExecutions: 2,
});

await Promise.all([backgroundWorker.run(), glacierWorker.run()]);
