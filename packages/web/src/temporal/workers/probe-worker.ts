import * as Sentry from '@sentry/node';
import { NativeConnection, Worker } from '@temporalio/worker';
import { z } from 'zod';
import { checkFfmpeg } from '../../util/env-check';
import { waitOnTemporal } from '..';
import * as activities from '../activities/probe';
import { PROBE_QUEUE } from '../queues';

const {
  IDENTITY,
  MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS,
  SENTRY_DSN,
  TEMPORAL_ADDRESS,
} = z
  .object({
    IDENTITY: z.string(),
    MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS: z.string(),
    SENTRY_DSN: z.string(),
    TEMPORAL_ADDRESS: z.string(),
  })
  .parse(process.env);

if (process.env.NODE_ENV !== 'development') {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'default',
  });
}

await checkFfmpeg();

await waitOnTemporal();

const worker = await Worker.create({
  identity: `probe-worker ${IDENTITY}`,
  connection: await NativeConnection.connect({ address: TEMPORAL_ADDRESS }),
  activities,
  taskQueue: PROBE_QUEUE,
  maxConcurrentActivityTaskExecutions: parseInt(
    MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS,
    10,
  ),
});

await worker.run();
