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
import {
  NativeConnection,
  Worker,
  type WorkerOptions,
} from '@temporalio/worker';
import { z } from 'zod';
import { createAmaActivitySlotSupplier } from './ama-slot-supplier';
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

const baseOptions: WorkerOptions = {
  identity: `transcode-worker ${IDENTITY}`,
  connection: await NativeConnection.connect({ address: TEMPORAL_ADDRESS }),
  activities,
  taskQueue: TRANSCODE_QUEUE,
  shutdownGraceTime: TEMPORAL_SHUTDOWN_GRACE_TIME,
};

// On the AMA hardware path, admit jobs by spending a per-device encoder budget
// instead of a fixed job count: a custom slot supplier caps how many jobs we
// pull, and the transcode activity weights each job by its HLS-ladder cost (see
// @letschurch/temporal/util/ama-budget). `tuner` is mutually exclusive with
// `maxConcurrentActivityTaskExecutions`, so CPU workers keep the latter and the
// existing fixed-concurrency behavior, untouched.
let worker: Worker;
if (amaBudgetEnabled) {
  worker = await Worker.create({
    ...baseOptions,
    tuner: {
      activityTaskSlotSupplier: createAmaActivitySlotSupplier(),
      // This worker only runs activities (it polls TRANSCODE_QUEUE and registers
      // no workflows/nexus services), so these slot types are never exercised;
      // a small fixed size satisfies the TunerHolder shape without effect.
      workflowTaskSlotSupplier: { type: 'fixed-size', numSlots: 10 },
      localActivityTaskSlotSupplier: { type: 'fixed-size', numSlots: 10 },
      nexusTaskSlotSupplier: { type: 'fixed-size', numSlots: 10 },
    },
  });
  console.log(
    `Transcode worker using AMA device budget: ${AMA_MAX_SESSIONS} encoder sessions, ${AMA_PIXEL_BUDGET} pixel units, max ${AMA_MAX_CONCURRENT} concurrent jobs`,
  );
} else {
  if (!MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS) {
    throw new Error(
      'MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS is required on the CPU transcode path (no TRANSCODE_HW_ACCEL=ama:*)',
    );
  }
  worker = await Worker.create({
    ...baseOptions,
    maxConcurrentActivityTaskExecutions: parseInt(
      MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS,
      10,
    ),
  });
}

await worker.run();
