import {
  AppUser,
  Channel,
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
import {
  BACKGROUND_QUEUE,
  PRIORITY_IMPORT,
  PRIORITY_REPROCESS,
  PRIORITY_USER,
} from '@letschurch/temporal/queues';
import {
  makeAnnotateTranscriptWorkflowId,
  makeBackupToGlacierWorkflowId,
  makeCreateUploadRecordWorkflowId,
  makeDeleteUploadWorkflowId,
  makeGeocodeOrganizationWorkflowId,
  makeImportMediaWorkflowId,
  makeInvitationEmailWorkflowId,
  makePostUserRegistrationWorkflowId,
  makeProcessMediaWorkflowId,
  makeRecordDownloadSizeWorkflowId,
  makeRemuxAllWorkflowId,
  makeReprocessAllWorkflowId,
  makeResetPasswordWorkflowId,
  makeScrapeAndImportWorkflowId,
  makeSummarizeUploadWorkflowId,
  makeUpdateUploadRecordWorkflowId,
  makeVerificationEmailWorkflowId,
  type RemuxScope,
  type ReprocessScope,
} from '@letschurch/temporal/workflow-ids';

export type { RemuxScope, ReprocessScope };

import { eq } from 'drizzle-orm';

export type InvitationEmailArgs = {
  invitationId: string;
  type: 'organization' | 'channel';
};

// Type-only namespace import of every workflow export, erased at runtime so the
// SSR bundle never pulls @temporalio/workflow into web. `startBackground` /
// `signalWithStartBackground` below constrain the runtime string name to a key
// of this namespace, so renaming or removing a workflow breaks every call site
// at compile time. See https://github.com/temporalio/sdk-typescript/issues/2098.
import type * as bg from '@letschurch/temporal/workflows/background';
import type {
  BackfillFilenamesWorkflowParams,
  BackfillUploadStateSizesWorkflowParams,
  BackfillUploadStatesWorkflowParams,
  BulkBackupToGlacierWorkflowParams,
  CleanupStaleUploadStatesWorkflowParams,
  ReindexWorkflowParams,
  SendVerificationEmailArgs,
} from '@letschurch/temporal/workflows/background';

export type { ReindexKind } from '@letschurch/temporal/activities/background/reindex';

import { createRequire } from 'node:module';
// Runtime signal/query refs (plain { type, name } objects — no @temporalio/workflow dep).
import {
  completeResetPasswordSignal,
  getBackfillFilenamesProgressQuery,
  getBackfillProgressQuery,
  getBackfillSizesProgressQuery,
  getBulkBackupProgressQuery,
  getCleanupProgressQuery,
  getReindexProgressQuery,
  updateUploadRecordSignal,
  uploadDoneSignal,
} from '@letschurch/temporal/refs';
import {
  CHANNEL_ID_KEY,
  CHANNEL_SLUG_KEY,
  IMPORT_SOURCE_ID_KEY,
  UPLOAD_ID_KEY,
  USER_ID_KEY,
  USERNAME_KEY,
} from '@letschurch/temporal/search-attributes';
import { xxh32 } from '@node-rs/xxhash';
import type {
  WithWorkflowArgs,
  Workflow,
  WorkflowOptions,
  WorkflowSignalWithStartOptions,
  WorkflowStartOptions,
} from '@temporalio/client';
import PLazy from 'p-lazy';
import waitOn from 'wait-on';
import { z } from 'zod';
import logger from '../util/logger';
import type { UploadPostProcessValue } from '../util/types';

export type {
  UploadRecordCreateData,
  UploadRecordUpdateData,
} from '@letschurch/temporal/client';

const moduleLogger = logger.child({ module: 'temporal' });

const { TEMPORAL_ADDRESS } = z
  .object({ TEMPORAL_ADDRESS: z.string() })
  .parse(process.env);

// createRequire here is load-bearing: any static or even dynamic ESM import of
// '@temporalio/client' makes Vite/Rollup "see through" its CJS barrel and emit
// broken deep/absolute-path imports into the SSR bundle. A runtime require keeps
// the package fully opaque. See https://github.com/temporalio/sdk-typescript/issues/2098.
const requireFromHere = createRequire(import.meta.url);

export const client = PLazy.from(async () => {
  await waitOnTemporal();
  const { Client, Connection } = requireFromHere(
    '@temporalio/client',
  ) as typeof import('@temporalio/client');
  return new Client({
    connection: await Connection.connect({
      address: TEMPORAL_ADDRESS,
    }),
  });
});

const retryOps: Pick<WorkflowOptions, 'retry'> = {
  retry: { maximumAttempts: 5 },
};

// Names of every workflow function exported from @letschurch/temporal/workflows/background.
// `K extends BackgroundWorkflowName` binds the string name to the workflow's
// type — rename a workflow and every call site fails to compile.
export type BackgroundWorkflowName = {
  [K in keyof typeof bg]: (typeof bg)[K] extends Workflow ? K : never;
}[keyof typeof bg];

export async function startBackground<K extends BackgroundWorkflowName>(
  name: K,
  options: WorkflowStartOptions<(typeof bg)[K]>,
) {
  return (await client).workflow.start<(typeof bg)[K]>(name, options);
}

export async function signalWithStartBackground<
  K extends BackgroundWorkflowName,
  SignalArgs extends unknown[] = [],
>(
  name: K,
  options: WithWorkflowArgs<
    (typeof bg)[K],
    WorkflowSignalWithStartOptions<SignalArgs>
  >,
) {
  return (await client).workflow.signalWithStart<(typeof bg)[K], SignalArgs>(
    name,
    options,
  );
}

// Re-export workflow ID helpers from shared package
export {
  makeBackupToGlacierWorkflowId,
  makeCreateUploadRecordWorkflowId,
  makeDeleteUploadWorkflowId,
  makeGeocodeOrganizationWorkflowId,
  makeImportMediaWorkflowId,
  makeInvitationEmailWorkflowId,
  makePostUserRegistrationWorkflowId,
  makeAnnotateTranscriptWorkflowId,
  makeProcessMediaWorkflowId,
  makeRecordDownloadSizeWorkflowId,
  makeResetPasswordWorkflowId,
  makeScrapeAndImportWorkflowId,
  makeSummarizeUploadWorkflowId,
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
  const meta =
    postProcess === 'media' || postProcess === 'thumbnail'
      ? await db
          .select({
            channelId: UploadRecord.channelId,
            channelSlug: Channel.slug,
            userId: UploadRecord.appUserId,
            username: AppUser.username,
          })
          .from(UploadRecord)
          .innerJoin(Channel, eq(Channel.id, UploadRecord.channelId))
          .innerJoin(AppUser, eq(AppUser.id, UploadRecord.appUserId))
          .where(eq(UploadRecord.id, uploadRecordId))
          .then((r) => r[0] ?? null)
      : null;

  return startBackground('handleMultipartMediaUploadWorkflow', {
    ...retryOps,
    taskQueue: BACKGROUND_QUEUE,
    workflowId: makeMultipartMediaUploadWorkflowId(s3UploadId, s3UploadKey),
    args: [
      uploadRecordId,
      clientId,
      s3UploadId,
      s3UploadKey,
      postProcess,
      meta,
    ],
    typedSearchAttributes: [
      { key: UPLOAD_ID_KEY, value: uploadRecordId },
      ...(meta
        ? [
            { key: CHANNEL_ID_KEY, value: meta.channelId },
            { key: CHANNEL_SLUG_KEY, value: meta.channelSlug },
            { key: USER_ID_KEY, value: meta.userId },
            { key: USERNAME_KEY, value: meta.username },
          ]
        : []),
    ],
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
  const res = await startBackground('createUploadRecordWorkflow', {
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
  return signalWithStartBackground<
    'updateUploadRecordWorkflow',
    [UploadRecordUpdateData, boolean?]
  >('updateUploadRecordWorkflow', {
    taskQueue: BACKGROUND_QUEUE,
    workflowId: makeUpdateUploadRecordWorkflowId(uploadRecordId),
    args: [uploadRecordId],
    signal: updateUploadRecordSignal,
    signalArgs: [data],
    typedSearchAttributes: [{ key: UPLOAD_ID_KEY, value: uploadRecordId }],
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
  return startBackground('recordDownloadSizeWorkflow', {
    taskQueue: BACKGROUND_QUEUE,
    workflowId: makeRecordDownloadSizeWorkflowId(uploadRecordId, variant),
    args: [uploadRecordId, variant, bytes],
    typedSearchAttributes: [{ key: UPLOAD_ID_KEY, value: uploadRecordId }],
    retry: {
      maximumAttempts: 8,
    },
  });
}

export async function sendEmail(
  id: string,
  ...args: Parameters<typeof bg.sendEmailWorkflow>
) {
  return startBackground('sendEmailWorkflow', {
    ...retryOps,
    taskQueue: BACKGROUND_QUEUE,
    priority: { priorityKey: PRIORITY_USER },
    args,
    workflowId: id,
  });
}

export async function sendInvitationEmail(args: InvitationEmailArgs) {
  return startBackground('sendInvitationEmailWorkflow', {
    ...retryOps,
    taskQueue: BACKGROUND_QUEUE,
    priority: { priorityKey: PRIORITY_USER },
    args: [args],
    workflowId: makeInvitationEmailWorkflowId(args.type, args.invitationId),
  });
}

export async function sendVerificationEmail(args: SendVerificationEmailArgs) {
  return startBackground('sendVerificationEmailWorkflow', {
    ...retryOps,
    taskQueue: BACKGROUND_QUEUE,
    priority: { priorityKey: PRIORITY_USER },
    args: [args],
    workflowId: makeVerificationEmailWorkflowId(args.userId),
  });
}

export async function resetPassword(
  id: string,
  ...args: Parameters<typeof bg.resetPasswordWorkflow>
) {
  const [userId] = args;
  return startBackground('resetPasswordWorkflow', {
    ...retryOps,
    taskQueue: BACKGROUND_QUEUE,
    priority: { priorityKey: PRIORITY_USER },
    args,
    workflowId: makeResetPasswordWorkflowId(id),
    typedSearchAttributes: [{ key: USER_ID_KEY, value: userId }],
  });
}

export async function completeResetPassword(id: string, hash: string) {
  return (await client).workflow
    .getHandle(makeResetPasswordWorkflowId(id))
    .signal(completeResetPasswordSignal, hash);
}

export async function geocodeOrganization(id: string) {
  return startBackground('geocodeOrganizationWorkflow', {
    ...retryOps,
    taskQueue: BACKGROUND_QUEUE,
    args: [id],
    workflowId: makeGeocodeOrganizationWorkflowId(id),
  });
}

export async function postUserRegistration(
  userId: string,
  ...args: Parameters<typeof bg.postUserRegistrationWorkflow>
) {
  const { username } = args[0];
  return startBackground('postUserRegistrationWorkflow', {
    ...retryOps,
    taskQueue: BACKGROUND_QUEUE,
    args,
    workflowId: makePostUserRegistrationWorkflowId(userId),
    typedSearchAttributes: [
      { key: USER_ID_KEY, value: userId },
      { key: USERNAME_KEY, value: username },
    ],
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

  const meta = await db
    .select({
      channelId: UploadRecord.channelId,
      channelSlug: Channel.slug,
      userId: UploadRecord.appUserId,
    })
    .from(UploadRecord)
    .innerJoin(Channel, eq(Channel.id, UploadRecord.channelId))
    .where(eq(UploadRecord.id, uploadRecordId))
    .then((r) => r[0] ?? null);

  return startBackground('deleteUploadWorkflow', {
    ...retryOps,
    taskQueue: BACKGROUND_QUEUE,
    args: [uploadRecordId],
    workflowId: makeDeleteUploadWorkflowId(uploadRecordId),
    typedSearchAttributes: [
      { key: UPLOAD_ID_KEY, value: uploadRecordId },
      ...(meta
        ? [
            { key: CHANNEL_ID_KEY, value: meta.channelId },
            { key: CHANNEL_SLUG_KEY, value: meta.channelSlug },
            { key: USER_ID_KEY, value: meta.userId },
          ]
        : []),
    ],
  });
}

export async function importMedia(
  ...args: Parameters<typeof bg.importMediaWorkflow>
) {
  const { url, username, channelSlug, importSourceId } = args[0];
  return startBackground('importMediaWorkflow', {
    ...retryOps,
    taskQueue: BACKGROUND_QUEUE,
    priority: { priorityKey: PRIORITY_IMPORT },
    args,
    workflowId: makeImportMediaWorkflowId(url),
    typedSearchAttributes: [
      { key: USERNAME_KEY, value: username },
      { key: CHANNEL_SLUG_KEY, value: channelSlug },
      ...(importSourceId
        ? [{ key: IMPORT_SOURCE_ID_KEY, value: importSourceId }]
        : []),
    ],
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
  return startBackground('backfillUploadStatesWorkflow', {
    ...retryOps,
    taskQueue: BACKGROUND_QUEUE,
    priority: { priorityKey: PRIORITY_REPROCESS },
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
  return startBackground('cleanupStaleUploadStatesWorkflow', {
    ...retryOps,
    taskQueue: BACKGROUND_QUEUE,
    priority: { priorityKey: PRIORITY_REPROCESS },
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
  return startBackground('bulkBackupToGlacierWorkflow', {
    ...retryOps,
    taskQueue: BACKGROUND_QUEUE,
    priority: { priorityKey: PRIORITY_REPROCESS },
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
  return startBackground('backfillUploadStateSizesWorkflow', {
    ...retryOps,
    taskQueue: BACKGROUND_QUEUE,
    priority: { priorityKey: PRIORITY_REPROCESS },
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
  return startBackground('backfillFilenamesWorkflow', {
    ...retryOps,
    taskQueue: BACKGROUND_QUEUE,
    priority: { priorityKey: PRIORITY_REPROCESS },
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
      channel: { columns: { id: true, slug: true, name: true } },
      createdBy: { columns: { id: true, username: true } },
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
      workflowType: 'scrapeAndImportWorkflow' satisfies BackgroundWorkflowName,
      args: [importSourceId],
      taskQueue: BACKGROUND_QUEUE,
      workflowId: makeScrapeAndImportWorkflowId(
        importSource.channel.slug,
        importSourceId,
        'scheduled',
      ),
      typedSearchAttributes: [
        { key: IMPORT_SOURCE_ID_KEY, value: importSourceId },
        { key: CHANNEL_ID_KEY, value: importSource.channel.id },
        { key: CHANNEL_SLUG_KEY, value: importSource.channel.slug },
        ...(importSource.createdBy
          ? [
              { key: USER_ID_KEY, value: importSource.createdBy.id },
              { key: USERNAME_KEY, value: importSource.createdBy.username },
            ]
          : []),
      ],
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
  // Fetch channel info for friendly workflow ID and search attributes
  const importSource = await db.query.ChannelImportSource.findFirst({
    where: (t, { eq }) => eq(t.id, importSourceId),
    columns: {},
    with: {
      channel: { columns: { id: true, slug: true } },
      createdBy: { columns: { id: true, username: true } },
    },
  });

  if (!importSource) {
    throw new Error(`Import source ${importSourceId} not found`);
  }

  return startBackground('scrapeAndImportWorkflow', {
    ...retryOps,
    taskQueue: BACKGROUND_QUEUE,
    priority: { priorityKey: PRIORITY_IMPORT },
    workflowId: makeScrapeAndImportWorkflowId(
      importSource.channel.slug,
      importSourceId,
      'manual',
    ),
    args: [importSourceId],
    typedSearchAttributes: [
      { key: IMPORT_SOURCE_ID_KEY, value: importSourceId },
      { key: CHANNEL_ID_KEY, value: importSource.channel.id },
      { key: CHANNEL_SLUG_KEY, value: importSource.channel.slug },
      ...(importSource.createdBy
        ? [
            { key: USER_ID_KEY, value: importSource.createdBy.id },
            { key: USERNAME_KEY, value: importSource.createdBy.username },
          ]
        : []),
    ],
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
  // Fetch channel info for friendly workflow ID and search attributes
  const importSource = await db.query.ChannelImportSource.findFirst({
    where: (t, { eq }) => eq(t.id, importSourceId),
    columns: {},
    with: {
      channel: { columns: { id: true, slug: true } },
      createdBy: { columns: { id: true, username: true } },
    },
  });

  if (!importSource) {
    throw new Error(`Import source ${importSourceId} not found`);
  }

  return startBackground('scrapeAndImportWorkflow', {
    ...retryOps,
    taskQueue: BACKGROUND_QUEUE,
    priority: { priorityKey: PRIORITY_IMPORT },
    workflowId: makeScrapeAndImportWorkflowId(
      importSource.channel.slug,
      importSourceId,
      'historical',
    ),
    args: [importSourceId, importHistory],
    typedSearchAttributes: [
      { key: IMPORT_SOURCE_ID_KEY, value: importSourceId },
      { key: CHANNEL_ID_KEY, value: importSource.channel.id },
      { key: CHANNEL_SLUG_KEY, value: importSource.channel.slug },
      ...(importSource.createdBy
        ? [
            { key: USER_ID_KEY, value: importSource.createdBy.id },
            { key: USERNAME_KEY, value: importSource.createdBy.username },
          ]
        : []),
    ],
  });
}

// Reindex Workflow

function makeReindexWorkflowId(kind: ReindexWorkflowParams['kind']) {
  return `reindex:${kind}`;
}

export async function startReindex(params: ReindexWorkflowParams) {
  return startBackground('reindexWorkflow', {
    ...retryOps,
    taskQueue: BACKGROUND_QUEUE,
    priority: { priorityKey: PRIORITY_REPROCESS },
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

// Reprocess Workflows

export async function startReprocess(
  scope: ReprocessScope,
  processingScope: 'transcode' | 'transcribe' | 'everything' = 'transcode',
  options: { viaBatch?: boolean } = {},
) {
  return startBackground('reprocessAllWorkflow', {
    ...retryOps,
    taskQueue: BACKGROUND_QUEUE,
    priority: { priorityKey: PRIORITY_REPROCESS },
    workflowId: makeReprocessAllWorkflowId(scope),
    args: [
      scope,
      processingScope,
      null,
      { viaBatch: options.viaBatch ?? false },
    ],
  });
}

export async function getReprocessWorkflowStatus(scope: ReprocessScope) {
  try {
    const handle = (await client).workflow.getHandle(
      makeReprocessAllWorkflowId(scope),
    );
    const description = await handle.describe();
    return description.status.name.toLowerCase() as
      | 'running'
      | 'completed'
      | 'failed'
      | 'canceled'
      | 'terminated'
      | 'timed_out';
  } catch {
    return null;
  }
}

export async function cancelReprocess(scope: ReprocessScope) {
  const handle = (await client).workflow.getHandle(
    makeReprocessAllWorkflowId(scope),
  );
  await handle.cancel();
}

// Remux Workflows

export async function startRemuxAll(scope: RemuxScope = { kind: 'legacy' }) {
  return startBackground('remuxAllWorkflow', {
    ...retryOps,
    taskQueue: BACKGROUND_QUEUE,
    priority: { priorityKey: PRIORITY_REPROCESS },
    workflowId: makeRemuxAllWorkflowId(scope),
    args: [scope],
  });
}

export async function getRemuxWorkflowStatus(
  scope: RemuxScope = { kind: 'legacy' },
) {
  try {
    const handle = (await client).workflow.getHandle(
      makeRemuxAllWorkflowId(scope),
    );
    const description = await handle.describe();
    return description.status.name.toLowerCase() as
      | 'running'
      | 'completed'
      | 'failed'
      | 'canceled'
      | 'terminated'
      | 'timed_out';
  } catch {
    return null;
  }
}

export async function cancelRemuxAll(scope: RemuxScope = { kind: 'legacy' }) {
  const handle = (await client).workflow.getHandle(
    makeRemuxAllWorkflowId(scope),
  );
  await handle.cancel();
}
