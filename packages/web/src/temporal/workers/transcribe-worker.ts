import * as Sentry from '@sentry/node';
import { NativeConnection, Worker } from '@temporalio/worker';
import { z } from 'zod';
import { checkWhisper } from '../../util/env-check';
import { waitOnTemporal } from '..';
import * as activities from '../activities/transcribe';
import { TRANSCRIBE_QUEUE } from '../queues';

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

await checkWhisper();

await waitOnTemporal();

const worker = await Worker.create({
  identity: `transcribe-worker ${IDENTITY}`,
  connection: await NativeConnection.connect({ address: TEMPORAL_ADDRESS }),
  activities,
  taskQueue: TRANSCRIBE_QUEUE,
  maxConcurrentActivityTaskExecutions: parseInt(
    MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS,
    10,
  ),
});

await worker.run();
