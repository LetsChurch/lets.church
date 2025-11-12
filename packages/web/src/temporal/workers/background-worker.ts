import path from 'node:path';
import * as Sentry from '@sentry/node';
import { NativeConnection, Worker } from '@temporalio/worker';
import { z } from 'zod';
import { waitOnTemporal } from '..';
import * as backgroundctivities from '../activities/background';
import { BACKGROUND_QUEUE } from '../queues';

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
  `../workflows/index${path.extname(import.meta.url)}`,
  import.meta.url,
).pathname;

const backgroundWorker = await Worker.create({
  identity: `background-worker ${IDENTITY}`,
  connection: await NativeConnection.connect({ address: TEMPORAL_ADDRESS }),
  // TODO: prebundle
  workflowsPath,
  activities: backgroundctivities,
  taskQueue: BACKGROUND_QUEUE,
  shutdownGraceTime: TEMPORAL_SHUTDOWN_GRACE_TIME,
});

await backgroundWorker.run();
