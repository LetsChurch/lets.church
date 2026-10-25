import path from 'node:path';

import * as activities from '@letschurch/temporal/activities/background';
import {
  validateGeocodeConfig,
  validateSendEmailConfig,
  validateSendVerificationEmailConfig,
} from '@letschurch/temporal/activities/background';
import { client } from '@letschurch/temporal/client';
import {
  BACKGROUND_QUEUE,
  GLACIER_QUEUE,
  STORAGE_QUEUE,
} from '@letschurch/temporal/queues';
import { ensureSchedules } from '@letschurch/temporal/schedules';
import {
  ANNOTATE_MODEL,
  EMBED_MODEL,
  SUMMARY_MODEL,
} from '@letschurch/temporal/util/llm';
import { assertProductionPricingCoverage } from '@letschurch/temporal/util/llm-pricing';
import { initSentry } from '@letschurch/temporal/util/sentry';
import { waitOnTemporal } from '@letschurch/temporal/util/temporal';
import { NativeConnection, Worker } from '@temporalio/worker';
import { z } from 'zod';

const {
  IDENTITY,
  SENTRY_DSN,
  TEMPORAL_ADDRESS,
  TEMPORAL_NAMESPACE,
  TEMPORAL_SHUTDOWN_GRACE_TIME,
} = z
  .object({
    IDENTITY: z.string(),
    SENTRY_DSN: z.string(),
    TEMPORAL_ADDRESS: z.string(),
    // Unset (`default`) in production; dev worktrees each get their own.
    TEMPORAL_NAMESPACE: z.string().default('default'),
    TEMPORAL_SHUTDOWN_GRACE_TIME: z.string(),
  })
  .parse(process.env);

initSentry(SENTRY_DSN);

// Validate activity configurations on startup
validateSendEmailConfig();
validateSendVerificationEmailConfig();
validateGeocodeConfig();
assertProductionPricingCoverage({
  summary: SUMMARY_MODEL,
  annotate: ANNOTATE_MODEL,
  embed: EMBED_MODEL,
});

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
  namespace: TEMPORAL_NAMESPACE,
  // TODO: prebundle
  workflowsPath,
  activities,
  taskQueue: BACKGROUND_QUEUE,
  shutdownGraceTime: TEMPORAL_SHUTDOWN_GRACE_TIME as `${number}`, // TODO: fix this
  // The default is 100 activity slots per Worker. With three replicas, that
  // allowed hundreds of multi-megabyte vector indexing activities to compete
  // for a single OpenSearch shard. Keep the fleet-wide ceiling at 12 while the
  // indexing workload shares this queue with other background work.
  maxConcurrentActivityTaskExecutions: 4,
});

const glacierWorker = await Worker.create({
  identity: `glacier-worker ${IDENTITY}`,
  connection,
  namespace: TEMPORAL_NAMESPACE,
  activities: { backupToGlacier: activities.backupToGlacier },
  taskQueue: GLACIER_QUEUE,
  shutdownGraceTime: TEMPORAL_SHUTDOWN_GRACE_TIME as `${number}`, // TODO: fix this
  maxConcurrentActivityTaskExecutions: 2,
});

// Cross-location copies for storage moves. Each slot streams one record's
// bucket at a time, so this caps concurrent transfer load per replica.
const storageWorker = await Worker.create({
  identity: `storage-worker ${IDENTITY}`,
  connection,
  namespace: TEMPORAL_NAMESPACE,
  activities: {
    copyPrefixBetweenLocations: activities.copyPrefixBetweenLocations,
    moveOwnerImages: activities.moveOwnerImages,
  },
  taskQueue: STORAGE_QUEUE,
  shutdownGraceTime: TEMPORAL_SHUTDOWN_GRACE_TIME as `${number}`, // TODO: fix this
  maxConcurrentActivityTaskExecutions: Number(
    process.env.STORAGE_MOVE_CONCURRENCY ?? 4,
  ),
});

// Reconcile the fixed app-wide schedules (idempotent; every replica runs it).
await ensureSchedules(await client);

await Promise.all([
  backgroundWorker.run(),
  glacierWorker.run(),
  storageWorker.run(),
]);
