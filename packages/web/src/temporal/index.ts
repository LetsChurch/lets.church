import {
  ChannelImportSource,
  db,
  UploadRecord,
  type UploadVariant,
} from '@letschurch/db';
import type { S3ClientId } from '@letschurch/s3';
import type {
  UploadRecordCreateData,
  UploadRecordUpdateData,
} from '@letschurch/temporal/client';
import { BACKGROUND_QUEUE } from '@letschurch/temporal/queues';
import {
  makeBackupToGlacierWorkflowId,
  makeCreateUploadRecordWorkflowId,
  makeDeleteUploadWorkflowId,
  makeGeocodeOrganizationWorkflowId,
  makeImportMediaWorkflowId,
  makeInvitationEmailWorkflowId,
  makePostUserRegistrationWorkflowId,
  makeProcessMediaWorkflowId,
  makeRecordDownloadSizeWorkflowId,
  makeResetPasswordWorkflowId,
  makeScrapeAndImportWorkflowId,
  makeUpdateUploadRecordWorkflowId,
  makeVerificationEmailWorkflowId,
} from '@letschurch/temporal/workflow-ids';
import { eq } from 'drizzle-orm';

export type InvitationEmailArgs = {
  invitationId: string;
  type: 'organization' | 'channel';
};

import {
  type BackfillUploadStateSizesWorkflowParams,
  type BackfillUploadStatesWorkflowParams,
  type BulkBackupToGlacierWorkflowParams,
  backfillUploadStateSizesWorkflow,
  backfillUploadStatesWorkflow,
  bulkBackupToGlacierWorkflow,
  type CleanupStaleUploadStatesWorkflowParams,
  cleanupStaleUploadStatesWorkflow,
  createUploadRecordWorkflow,
  deleteUploadWorkflow,
  geocodeOrganizationWorkflow,
  getBackfillProgressQuery,
  getBackfillSizesProgressQuery,
  getBulkBackupProgressQuery,
  getCleanupProgressQuery,
  getReindexProgressQuery,
  handleMultipartMediaUploadWorkflow,
  importMediaWorkflow,
  postUserRegistrationWorkflow,
  type ReindexWorkflowParams,
  reindexWorkflow,
  type SendVerificationEmailArgs,
  sendEmailWorkflow,
  sendInvitationEmailWorkflow,
  sendVerificationEmailWorkflow,
  updateUploadRecordSignal,
  updateUploadRecordWorkflow,
  uploadDoneSignal,
} from '@letschurch/temporal/workflows/background';

export type { ReindexKind } from '@letschurch/temporal/activities/background/reindex';

import {
  type BackfillFilenamesWorkflowParams,
  backfillFilenamesWorkflow,
  getBackfillFilenamesProgressQuery,
} from '@letschurch/temporal/workflows/background/backfill-original-filenames';
import { recordDownloadSizeWorkflow } from '@letschurch/temporal/workflows/background/record-download-size';
import {
  completeResetPasswordSignal,
  resetPasswordWorkflow,
} from '@letschurch/temporal/workflows/background/reset-password';
import { scrapeAndImportWorkflow } from '@letschurch/temporal/workflows/background/scrape-and-import';
import { xxh32 } from '@node-rs/xxhash';
import { Client, Connection, type WorkflowOptions } from '@temporalio/client';
import PLazy from 'p-lazy';
import waitOn from 'wait-on';
import { z } from 'zod';
import logger from '../util/logger';
import type { UploadPostProcessValue } from '../util/types';

export {
  indexDocument,
  type UploadRecordCreateData,
  type UploadRecordUpdateData,
} from '@letschurch/temporal/client';

const moduleLogger = logger.child({ module: 'temporal' });

const { TEMPORAL_ADDRESS } = z
  .object({ TEMPORAL_ADDRESS: z.string() })
  .parse(process.env);

export const client = PLazy.from(async () => {
  await waitOnTemporal();

  return new Client({
    connection: await Connection.connect({
      address: TEMPORAL_ADDRESS,
    }),
  });
});

const retryOps: Pick<WorkflowOptions, 'retry'> = {
  retry: { maximumAttempts: 5 },
};

// Re-export workflow ID helpers from shared package
export {
  makeBackupToGlacierWorkflowId,
  makeCreateUploadRecordWorkflowId,
  makeDeleteUploadWorkflowId,
  makeGeocodeOrganizationWorkflowId,
  makeImportMediaWorkflowId,
  makeInvitationEmailWorkflowId,
  makePostUserRegistrationWorkflowId,
  makeProcessMediaWorkflowId,
  makeRecordDownloadSizeWorkflowId,
  makeResetPasswordWorkflowId,
  makeScrapeAndImportWorkflowId,
  makeUpdateUploadRecordWorkflowId,
  makeVerificationEmailWorkflowId,
};

// Web-specific workflow ID helper
function makeMultipartMediaUploadWorkflowId(
  uploadRecordId: string,
  key: string,
) {
  return `handleMultipartMediaUpload:${xxh32(uploadRecordId)}:${key}`;
}

export async function handleMultipartMediaUpload(
  uploadRecordId: string,
  clientId: S3ClientId,
  s3UploadId: string,
  s3UploadKey: string,
  postProcess: UploadPostProcessValue,
) {
  return (await client).workflow.start(handleMultipartMediaUploadWorkflow, {
    ...retryOps,
    taskQueue: BACKGROUND_QUEUE,
    workflowId: makeMultipartMediaUploadWorkflowId(s3UploadId, s3UploadKey),
    args: [uploadRecordId, clientId, s3UploadId, s3UploadKey, postProcess],
  });
}

export async function completeMultipartMediaUpload(
  s3UploadId: string,
  s3UploadKey: string,
  partETags: Array<string>,
  userId: string,
) {
  return (await client).workflow
    .getHandle(makeMultipartMediaUploadWorkflowId(s3UploadId, s3UploadKey))
    .signal(uploadDoneSignal, partETags, userId);
}

export async function createUploadRecord(
  data: UploadRecordCreateData,
  importId?: string,
) {
  const res = await (await client).workflow.start(createUploadRecordWorkflow, {
    ...retryOps,
    taskQueue: BACKGROUND_QUEUE,
    workflowId: makeCreateUploadRecordWorkflowId(
      importId,
      data.publishedAt as Date,
      data.title as string,
    ),
    args: [data],
  });

  return res.result();
}

export async function updateUploadRecord(
  uploadRecordId: string,
  data: UploadRecordUpdateData,
) {
  return (await client).workflow.signalWithStart(updateUploadRecordWorkflow, {
    taskQueue: BACKGROUND_QUEUE,
    workflowId: makeUpdateUploadRecordWorkflowId(uploadRecordId),
    args: [uploadRecordId],
    signal: updateUploadRecordSignal,
    signalArgs: [data],
    retry: {
      maximumAttempts: 8,
    },
  });
}

export async function recordDownloadSize(
  uploadRecordId: string,
  variant: (typeof UploadVariant)['enumValues'][number],
  bytes: number,
) {
  return (await client).workflow.start(recordDownloadSizeWorkflow, {
    taskQueue: BACKGROUND_QUEUE,
    workflowId: makeRecordDownloadSizeWorkflowId(uploadRecordId),
    args: [uploadRecordId, variant, bytes],
    retry: {
      maximumAttempts: 8,
    },
  });
}

export async function sendEmail(
  id: string,
  ...args: Parameters<typeof sendEmailWorkflow>
) {
  return (await client).workflow.start(sendEmailWorkflow, {
    ...retryOps,
    taskQueue: BACKGROUND_QUEUE,
    args,
    workflowId: id,
  });
}

export async function sendInvitationEmail(args: InvitationEmailArgs) {
  return (await client).workflow.start(sendInvitationEmailWorkflow, {
    ...retryOps,
    taskQueue: BACKGROUND_QUEUE,
    args: [args],
    workflowId: makeInvitationEmailWorkflowId(args.type, args.invitationId),
  });
}

export async function sendVerificationEmail(args: SendVerificationEmailArgs) {
  return (await client).workflow.start(sendVerificationEmailWorkflow, {
    ...retryOps,
    taskQueue: BACKGROUND_QUEUE,
    args: [args],
    workflowId: makeVerificationEmailWorkflowId(args.userId),
  });
}

export async function resetPassword(
  id: string,
  ...args: Parameters<typeof resetPasswordWorkflow>
) {
  return (await client).workflow.start(resetPasswordWorkflow, {
    ...retryOps,
    taskQueue: BACKGROUND_QUEUE,
    args,
    workflowId: makeResetPasswordWorkflowId(id),
  });
}

export async function completeResetPassword(id: string, hash: string) {
  return (await client).workflow
    .getHandle(makeResetPasswordWorkflowId(id))
    .signal(completeResetPasswordSignal, hash);
}

export async function geocodeOrganization(id: string) {
  return (await client).workflow.start(geocodeOrganizationWorkflow, {
    ...retryOps,
    taskQueue: BACKGROUND_QUEUE,
    args: [id],
    workflowId: makeGeocodeOrganizationWorkflowId(id),
  });
}

export async function postUserRegistration(
  userId: string,
  ...args: Parameters<typeof postUserRegistrationWorkflow>
) {
  return (await client).workflow.start(postUserRegistrationWorkflow, {
    ...retryOps,
    taskQueue: BACKGROUND_QUEUE,
    args,
    workflowId: makePostUserRegistrationWorkflowId(userId),
  });
}

export async function cancelUploadProcessing(uploadRecordId: string) {
  // Fetch the upload record to get the finalized upload key
  const upload = await db
    .select({ finalizedUploadKey: UploadRecord.finalizedUploadKey })
    .from(UploadRecord)
    .where(eq(UploadRecord.id, uploadRecordId))
    .then((r) => r[0] ?? null);

  if (!upload?.finalizedUploadKey) {
    moduleLogger.info(
      { uploadRecordId },
      'No finalized upload key found, skipping workflow cancellation',
    );
    return;
  }

  const workflowIds = [
    makeProcessMediaWorkflowId(upload.finalizedUploadKey),
    makeBackupToGlacierWorkflowId(upload.finalizedUploadKey),
  ];

  // Try to cancel each workflow, ignoring errors if they don't exist or are already completed
  for (const workflowId of workflowIds) {
    try {
      const handle = (await client).workflow.getHandle(workflowId);
      await handle.cancel();
      moduleLogger.info({ workflowId }, 'Cancelled workflow');
    } catch (error) {
      // Workflow might not exist or already be completed, which is fine
      moduleLogger.debug(
        {
          workflowId,
          context: {
            error: error instanceof Error ? error.message : String(error),
          },
        },
        'Failed to cancel workflow (may not exist or already completed)',
      );
    }
  }
}

export async function deleteUpload(uploadRecordId: string) {
  // Cancel any active processing workflows before starting delete
  await cancelUploadProcessing(uploadRecordId);

  return (await client).workflow.start(deleteUploadWorkflow, {
    ...retryOps,
    taskQueue: BACKGROUND_QUEUE,
    args: [uploadRecordId],
    workflowId: makeDeleteUploadWorkflowId(uploadRecordId),
  });
}

export async function importMedia(
  ...args: Parameters<typeof importMediaWorkflow>
) {
  const url = args[0].url;
  return (await client).workflow.start(importMediaWorkflow, {
    ...retryOps,
    taskQueue: BACKGROUND_QUEUE,
    args,
    workflowId: makeImportMediaWorkflowId(url),
  });
}

export async function waitOnTemporal() {
  moduleLogger.info('Waiting for Temporal');

  await waitOn({
    resources: [`tcp:${TEMPORAL_ADDRESS}`],
  });

  moduleLogger.info('Temporal is available!');
}

const MIGRATE_VIEW_RANGES_WORKFLOW_ID = 'migrateViewRanges';

export async function cancelMigrateViewRanges() {
  const handle = (await client).workflow.getHandle(
    MIGRATE_VIEW_RANGES_WORKFLOW_ID,
  );
  await handle.cancel();
}

// Backfill Upload States Workflow
const BACKFILL_UPLOAD_STATES_WORKFLOW_ID = 'backfillUploadStates';

export async function startBackfillUploadStates(
  params: BackfillUploadStatesWorkflowParams,
) {
  return (await client).workflow.start(backfillUploadStatesWorkflow, {
    ...retryOps,
    taskQueue: BACKGROUND_QUEUE,
    workflowId: BACKFILL_UPLOAD_STATES_WORKFLOW_ID,
    args: [params],
  });
}

export async function getBackfillUploadStatesProgress() {
  try {
    const handle = (await client).workflow.getHandle(
      BACKFILL_UPLOAD_STATES_WORKFLOW_ID,
    );
    const description = await handle.describe();

    if (description.status.name === 'RUNNING') {
      const progress = await handle.query(getBackfillProgressQuery);
      return {
        status: 'running' as const,
        ...progress,
      };
    }

    if (description.status.name === 'COMPLETED') {
      return {
        status: 'completed' as const,
        totalCreated: 0,
        remaining: 0,
        batchesCompleted: 0,
      };
    }

    return {
      status: description.status.name.toLowerCase() as
        | 'failed'
        | 'cancelled'
        | 'terminated'
        | 'timed_out',
      totalCreated: 0,
      remaining: 0,
      batchesCompleted: 0,
    };
  } catch {
    // Workflow doesn't exist
    return null;
  }
}

export async function cancelBackfillUploadStates() {
  const handle = (await client).workflow.getHandle(
    BACKFILL_UPLOAD_STATES_WORKFLOW_ID,
  );
  await handle.cancel();
}

// Cleanup Stale Upload States Workflow
const CLEANUP_STALE_UPLOAD_STATES_WORKFLOW_ID = 'cleanupStaleUploadStates';

export async function startCleanupStaleUploadStates(
  params: CleanupStaleUploadStatesWorkflowParams,
) {
  return (await client).workflow.start(cleanupStaleUploadStatesWorkflow, {
    ...retryOps,
    taskQueue: BACKGROUND_QUEUE,
    workflowId: CLEANUP_STALE_UPLOAD_STATES_WORKFLOW_ID,
    args: [params],
  });
}

export async function getCleanupStaleUploadStatesProgress() {
  try {
    const handle = (await client).workflow.getHandle(
      CLEANUP_STALE_UPLOAD_STATES_WORKFLOW_ID,
    );
    const description = await handle.describe();

    if (description.status.name === 'RUNNING') {
      const progress = await handle.query(getCleanupProgressQuery);
      return {
        status: 'running' as const,
        ...progress,
      };
    }

    if (description.status.name === 'COMPLETED') {
      return {
        status: 'completed' as const,
        totalDeleted: 0,
        remaining: 0,
        batchesCompleted: 0,
      };
    }

    return {
      status: description.status.name.toLowerCase() as
        | 'failed'
        | 'cancelled'
        | 'terminated',
      totalDeleted: 0,
      remaining: 0,
      batchesCompleted: 0,
    };
  } catch (_error) {
    return null;
  }
}

export async function cancelCleanupStaleUploadStates() {
  const handle = (await client).workflow.getHandle(
    CLEANUP_STALE_UPLOAD_STATES_WORKFLOW_ID,
  );
  await handle.cancel();
}

// Bulk Backup to Glacier Workflow
const BULK_BACKUP_WORKFLOW_ID = 'bulkBackupToGlacier';

export async function startBulkBackupToGlacier(
  params: BulkBackupToGlacierWorkflowParams,
) {
  return (await client).workflow.start(bulkBackupToGlacierWorkflow, {
    ...retryOps,
    taskQueue: BACKGROUND_QUEUE,
    workflowId: BULK_BACKUP_WORKFLOW_ID,
    args: [params],
  });
}

export async function getBulkBackupToGlacierProgress() {
  try {
    const handle = (await client).workflow.getHandle(BULK_BACKUP_WORKFLOW_ID);
    const description = await handle.describe();

    if (description.status.name === 'RUNNING') {
      const progress = await handle.query(getBulkBackupProgressQuery);
      return {
        status: 'running' as const,
        ...progress,
      };
    }

    if (description.status.name === 'COMPLETED') {
      return {
        status: 'completed' as const,
        totalStarted: 0,
        batchesCompleted: 0,
        remaining: 0,
      };
    }

    return {
      status: description.status.name.toLowerCase() as
        | 'failed'
        | 'cancelled'
        | 'terminated'
        | 'timed_out',
      totalStarted: 0,
      batchesCompleted: 0,
      remaining: 0,
    };
  } catch {
    // Workflow doesn't exist
    return null;
  }
}

export async function cancelBulkBackupToGlacier() {
  const handle = (await client).workflow.getHandle(BULK_BACKUP_WORKFLOW_ID);
  await handle.cancel();
}

// Backfill Upload State Sizes Workflow
const BACKFILL_SIZES_WORKFLOW_ID = 'backfillUploadStateSizes';

export async function startBackfillUploadStateSizes(
  params: BackfillUploadStateSizesWorkflowParams,
) {
  return (await client).workflow.start(backfillUploadStateSizesWorkflow, {
    ...retryOps,
    taskQueue: BACKGROUND_QUEUE,
    workflowId: BACKFILL_SIZES_WORKFLOW_ID,
    args: [params],
  });
}

export async function getBackfillUploadStateSizesProgress() {
  try {
    const handle = (await client).workflow.getHandle(
      BACKFILL_SIZES_WORKFLOW_ID,
    );
    const description = await handle.describe();

    if (description.status.name === 'RUNNING') {
      const progress = await handle.query(getBackfillSizesProgressQuery);
      return {
        status: 'running' as const,
        ...progress,
      };
    }

    if (description.status.name === 'COMPLETED') {
      return {
        status: 'completed' as const,
        totalUpdated: 0,
        totalSkipped: 0,
        remaining: 0,
        batchesCompleted: 0,
      };
    }

    return {
      status: description.status.name.toLowerCase() as
        | 'failed'
        | 'cancelled'
        | 'terminated'
        | 'timed_out',
      totalUpdated: 0,
      totalSkipped: 0,
      remaining: 0,
      batchesCompleted: 0,
    };
  } catch {
    // Workflow doesn't exist
    return null;
  }
}

export async function cancelBackfillUploadStateSizes() {
  const handle = (await client).workflow.getHandle(BACKFILL_SIZES_WORKFLOW_ID);
  await handle.cancel();
}

const BACKFILL_FILENAMES_WORKFLOW_ID = 'backfillOriginalFilenames';

export async function startBackfillFilenames(
  params: BackfillFilenamesWorkflowParams,
) {
  return (await client).workflow.start(backfillFilenamesWorkflow, {
    ...retryOps,
    taskQueue: BACKGROUND_QUEUE,
    workflowId: BACKFILL_FILENAMES_WORKFLOW_ID,
    args: [params],
  });
}

export async function getBackfillFilenamesProgress() {
  try {
    const handle = (await client).workflow.getHandle(
      BACKFILL_FILENAMES_WORKFLOW_ID,
    );
    const description = await handle.describe();

    if (description.status.name === 'RUNNING') {
      const progress = await handle.query(getBackfillFilenamesProgressQuery);
      return { status: 'running' as const, ...progress };
    }

    if (description.status.name === 'COMPLETED') {
      return { status: 'completed' as const };
    }

    if (description.status.name === 'CANCELLED') {
      return { status: 'cancelled' as const };
    }

    return { status: 'failed' as const };
  } catch {
    // Workflow doesn't exist
    return null;
  }
}

export async function cancelBackfillFilenames() {
  const handle = (await client).workflow.getHandle(
    BACKFILL_FILENAMES_WORKFLOW_ID,
  );
  await handle.cancel();
}

// Import Source Scheduler Workflows

/**
 * Start a Temporal Schedule for an import source.
 * One schedule per import source.
 */
export async function startImportSourceScheduler(importSourceId: string) {
  // Fetch import source details
  const importSource = await db.query.ChannelImportSource.findFirst({
    where: (t, { eq }) => eq(t.id, importSourceId),
    columns: {
      url: true,
      cronSchedule: true,
      timezone: true,
    },
    with: {
      channel: {
        columns: { slug: true, name: true },
      },
    },
  });

  if (!importSource) {
    throw new Error(`Import source ${importSourceId} not found`);
  }

  const scheduleId = `import:${importSource.channel.slug}:${importSourceId}`;

  // Create a Temporal Schedule
  const schedule = await (await client).schedule.create({
    scheduleId,
    spec: {
      cronExpressions: [
        `CRON_TZ=${importSource.timezone} ${importSource.cronSchedule}`,
      ],
    },
    action: {
      type: 'startWorkflow',
      workflowType: scrapeAndImportWorkflow,
      args: [importSourceId],
      taskQueue: BACKGROUND_QUEUE,
      workflowId: makeScrapeAndImportWorkflowId(
        importSource.channel.slug,
        importSourceId,
        'scheduled',
      ),
    },
    memo: {
      channelName: importSource.channel.name,
      channelSlug: importSource.channel.slug,
      sourceUrl: importSource.url,
      description: `Import schedule for ${importSource.channel.name} from ${new URL(importSource.url).hostname}`,
    },
  });

  // Update database status to RUNNING
  await db
    .update(ChannelImportSource)
    .set({
      workflowStatus: 'RUNNING',
      workflowId: scheduleId,
      updatedAt: new Date(),
    })
    .where(eq(ChannelImportSource.id, importSourceId));

  return schedule;
}

/**
 * Pause an import source schedule and update database status.
 */
export async function cancelImportSourceScheduler(importSourceId: string) {
  // Fetch channel slug to construct schedule ID
  const importSource = await db.query.ChannelImportSource.findFirst({
    where: (t, { eq }) => eq(t.id, importSourceId),
    columns: {},
    with: {
      channel: {
        columns: { slug: true },
      },
    },
  });

  if (!importSource) {
    throw new Error(`Import source ${importSourceId} not found`);
  }

  const scheduleId = `import:${importSource.channel.slug}:${importSourceId}`;

  // Pause the schedule
  const handle = (await client).schedule.getHandle(scheduleId);
  await handle.pause();

  await db
    .update(ChannelImportSource)
    .set({ workflowStatus: 'PAUSED', workflowId: null, updatedAt: new Date() })
    .where(eq(ChannelImportSource.id, importSourceId));
}

/**
 * Delete an import source schedule completely.
 */
export async function deleteImportSourceScheduler(importSourceId: string) {
  // Fetch channel slug to construct schedule ID
  const importSource = await db.query.ChannelImportSource.findFirst({
    where: (t, { eq }) => eq(t.id, importSourceId),
    columns: {},
    with: {
      channel: {
        columns: { slug: true },
      },
    },
  });

  if (!importSource) {
    throw new Error(`Import source ${importSourceId} not found`);
  }

  const scheduleId = `import:${importSource.channel.slug}:${importSourceId}`;

  // Delete the schedule
  const handle = (await client).schedule.getHandle(scheduleId);
  await handle.delete();
}

/**
 * Trigger a manual scrape and import for an import source.
 * This is a one-time operation, separate from the scheduled workflow.
 */
export async function triggerManualImport(importSourceId: string) {
  // Fetch channel slug for friendly workflow ID
  const importSource = await db.query.ChannelImportSource.findFirst({
    where: (t, { eq }) => eq(t.id, importSourceId),
    columns: {},
    with: {
      channel: {
        columns: { slug: true },
      },
    },
  });

  if (!importSource) {
    throw new Error(`Import source ${importSourceId} not found`);
  }

  return (await client).workflow.start(scrapeAndImportWorkflow, {
    ...retryOps,
    taskQueue: BACKGROUND_QUEUE,
    workflowId: makeScrapeAndImportWorkflowId(
      importSource.channel.slug,
      importSourceId,
      'manual',
    ),
    args: [importSourceId],
  });
}

/**
 * Trigger a historical import for an import source using provided data.
 * This imports historical media items without scraping.
 */
export async function triggerHistoricalImport(
  importSourceId: string,
  importHistory: Array<{
    publishedAt: string;
    source?: string;
    title: string;
    description?: string;
    url?: string | null;
  }>,
) {
  // Fetch channel slug for friendly workflow ID
  const importSource = await db.query.ChannelImportSource.findFirst({
    where: (t, { eq }) => eq(t.id, importSourceId),
    columns: {},
    with: {
      channel: {
        columns: { slug: true },
      },
    },
  });

  if (!importSource) {
    throw new Error(`Import source ${importSourceId} not found`);
  }

  return (await client).workflow.start(scrapeAndImportWorkflow, {
    ...retryOps,
    taskQueue: BACKGROUND_QUEUE,
    workflowId: makeScrapeAndImportWorkflowId(
      importSource.channel.slug,
      importSourceId,
      'historical',
    ),
    args: [importSourceId, importHistory],
  });
}

// Reindex Workflow

function makeReindexWorkflowId(kind: ReindexWorkflowParams['kind']) {
  return `reindex:${kind}`;
}

export async function startReindex(params: ReindexWorkflowParams) {
  return (await client).workflow.start(reindexWorkflow, {
    ...retryOps,
    taskQueue: BACKGROUND_QUEUE,
    workflowId: makeReindexWorkflowId(params.kind),
    args: [params],
  });
}

export async function getReindexProgress(kind: ReindexWorkflowParams['kind']) {
  try {
    const handle = (await client).workflow.getHandle(
      makeReindexWorkflowId(kind),
    );
    const description = await handle.describe();

    if (description.status.name === 'RUNNING') {
      const progress = await handle.query(getReindexProgressQuery);
      return { status: 'running' as const, ...progress };
    }

    if (description.status.name === 'COMPLETED') {
      return {
        status: 'completed' as const,
        totalIndexed: 0,
        offset: 0,
        total: 0,
      };
    }

    return {
      status: description.status.name.toLowerCase() as
        | 'failed'
        | 'cancelled'
        | 'terminated'
        | 'timed_out',
      totalIndexed: 0,
      offset: 0,
      total: 0,
    };
  } catch {
    return null;
  }
}

export async function cancelReindex(kind: ReindexWorkflowParams['kind']) {
  const handle = (await client).workflow.getHandle(makeReindexWorkflowId(kind));
  await handle.cancel();
}
