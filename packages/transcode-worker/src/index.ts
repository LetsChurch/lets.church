import * as activities from '@letschurch/temporal/activities/transcode';
import { TRANSCODE_QUEUE } from '@letschurch/temporal/queues';
import {
  AMA_MAX_CONCURRENT,
  AMA_MAX_SESSIONS,
  AMA_PIXEL_BUDGET,
  amaBudgetEnabled,
} from '@letschurch/temporal/util/ama-budget';
import { waitOnTemporal } from '@letschurch/temporal/util/temporal';
import { msUnitSchema } from '@letschurch/temporal/util/zod';
import * as Sentry from '@sentry/node';
import { NativeConnection, Worker } from '@temporalio/worker';
import { z } from 'zod';
import { checkAudiowaveform, checkFfmpeg } from './util/env-check';

const {
  IDENTITY,
  MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS,
  SENTRY_DSN,
  TEMPORAL_ADDRESS,
  TEMPORAL_SHUTDOWN_GRACE_TIME,
} = z
  .object({
    IDENTITY: z.string(),
    // Only used (and required) on the CPU path; the AMA path drives concurrency
    // via the encode budget + slot supplier instead. Validated below.
    MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS: z.string().optional(),
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

await checkFfmpeg();
await checkAudiowaveform();

await waitOnTemporal();

// Concurrency: the AMA path caps at AMA_MAX_CONCURRENT, the CPU path at
// MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS. Both use the SDK's plain fixed-size
// activity slots (`maxConcurrentActivityTaskExecutions`) — NOT a custom
// `tuner`/SlotSupplier. A hand-rolled supplier counter leaked its `issued`
// count up to the cap and stopped the AMA workers from polling at all
// (2026-06-25), so the device-safety guarantee lives entirely in the
// activity-side weighted budget semaphore (@letschurch/temporal/util/ama-budget),
// which blocks (and heartbeats) before launching ffmpeg. The slot count here is
// just an upper bound on pulled tasks.
if (amaBudgetEnabled === false && !MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS) {
  throw new Error(
    'MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS is required on the CPU transcode path (no TRANSCODE_HW_ACCEL=ama:*)',
  );
}
const maxConcurrentActivityTaskExecutions = amaBudgetEnabled
  ? AMA_MAX_CONCURRENT
  : parseInt(MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS as string, 10);

const worker = await Worker.create({
  identity: `transcode-worker ${IDENTITY}`,
  connection: await NativeConnection.connect({ address: TEMPORAL_ADDRESS }),
  activities,
  taskQueue: TRANSCODE_QUEUE,
  shutdownGraceTime: TEMPORAL_SHUTDOWN_GRACE_TIME,
  maxConcurrentActivityTaskExecutions,
});

if (amaBudgetEnabled) {
  console.log(
    `Transcode worker using AMA device budget: ${AMA_MAX_SESSIONS} encoder sessions, ${AMA_PIXEL_BUDGET} pixel units, max ${AMA_MAX_CONCURRENT} concurrent jobs`,
  );
}

await worker.run();
