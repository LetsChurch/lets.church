import path from 'node:path';

import * as activities from '@letschurch/temporal/activities/background';
import {
  validateGeocodeConfig,
  validateSendEmailConfig,
  validateSendVerificationEmailConfig,
  validateAnthropicAnnotationBatchConfig,
} from '@letschurch/temporal/activities/background';
import { BACKGROUND_QUEUE, GLACIER_QUEUE } from '@letschurch/temporal/queues';
import {
  ANNOTATE_MODEL,
  EMBED_MODEL,
  SUMMARY_MODEL,
} from '@letschurch/temporal/util/llm';
import { assertProductionPricingCoverage } from '@letschurch/temporal/util/llm-pricing';
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

// Validate activity configurations on startup
validateAnthropicAnnotationBatchConfig();
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
  activities: { backupToGlacier: activities.backupToGlacier },
  taskQueue: GLACIER_QUEUE,
  shutdownGraceTime: TEMPORAL_SHUTDOWN_GRACE_TIME as `${number}`, // TODO: fix this
  maxConcurrentActivityTaskExecutions: 2,
});

await Promise.all([backgroundWorker.run(), glacierWorker.run()]);
