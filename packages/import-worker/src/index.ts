import * as importActivities from '@letschurch/temporal/activities/import';
import { IMPORT_QUEUE } from '@letschurch/temporal/queues';
import * as Sentry from '@sentry/node';
import { NativeConnection, Worker } from '@temporalio/worker';
import { z } from 'zod';
import { checkYtDlp } from './util/env-check';

const {
  IDENTITY,
  MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS,
  MAX_CONCURRENT_WORKFLOW_TASK_EXECUTIONS,
  SENTRY_DSN,
  TEMPORAL_ADDRESS,
  TEMPORAL_SHUTDOWN_GRACE_TIME,
} = z
  .object({
    IDENTITY: z.string(),
    MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS: z.string(),
    MAX_CONCURRENT_WORKFLOW_TASK_EXECUTIONS: z.string(),
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

await checkYtDlp();

const importWorker = await Worker.create({
  identity: `import-worker ${IDENTITY}`,
  connection: await NativeConnection.connect({ address: TEMPORAL_ADDRESS }),
  activities: importActivities,
  taskQueue: IMPORT_QUEUE,
  shutdownGraceTime: TEMPORAL_SHUTDOWN_GRACE_TIME,
  maxConcurrentWorkflowTaskExecutions: Math.max(
    2,
    parseInt(MAX_CONCURRENT_WORKFLOW_TASK_EXECUTIONS, 10),
  ),
  maxConcurrentActivityTaskExecutions: parseInt(
    MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS,
    10,
  ),
});

await importWorker.run();
