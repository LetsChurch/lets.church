import * as activities from '@letschurch/temporal/activities/transcribe';
import { TRANSCRIBE_QUEUE } from '@letschurch/temporal/queues';
import { waitOnTemporal } from '@letschurch/temporal/util/temporal';
import { msUnitSchema } from '@letschurch/temporal/util/zod';
import * as Sentry from '@sentry/node';
import { NativeConnection, Worker } from '@temporalio/worker';
import { z } from 'zod';
import { checkWhisper } from './util/env-check';

const {
  IDENTITY,
  MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS,
  SENTRY_DSN,
  TEMPORAL_ADDRESS,
  TEMPORAL_SHUTDOWN_GRACE_TIME,
} = z
  .object({
    IDENTITY: z.string(),
    MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS: z.string(),
    SENTRY_DSN: z.string(),
    TEMPORAL_ADDRESS: z.string(),
    TEMPORAL_SHUTDOWN_GRACE_TIME: msUnitSchema,
  })
  .parse(process.env);

if (process.env.NODE_ENV !== 'development') {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'default',
  });
}

await checkWhisper();

await waitOnTemporal();

const worker = await Worker.create({
  identity: `transcribe-worker ${IDENTITY}`,
  connection: await NativeConnection.connect({ address: TEMPORAL_ADDRESS }),
  activities,
  taskQueue: TRANSCRIBE_QUEUE,
  shutdownGraceTime: TEMPORAL_SHUTDOWN_GRACE_TIME,
  maxConcurrentActivityTaskExecutions: parseInt(
    MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS,
    10,
  ),
});

await worker.run();
