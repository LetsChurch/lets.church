import type { Prisma, UploadVariant } from '@letschurch/db';
import { BACKGROUND_QUEUE } from '@letschurch/temporal/queues';
import {
  type BackfillUploadStateSizesWorkflowParams,
  type BackfillUploadStatesWorkflowParams,
  type BulkBackupToGlacierWorkflowParams,
  backfillUploadStateSizesWorkflow,
  backfillUploadStatesWorkflow,
  bulkBackupToGlacierWorkflow,
  createUploadRecordWorkflow,
  deleteUploadWorkflow,
  geocodeOrganizationWorkflow,
  getBackfillProgressQuery,
  getBackfillSizesProgressQuery,
  getBulkBackupProgressQuery,
  getMigrationProgressQuery,
  handleMultipartMediaUploadWorkflow,
  importMediaWorkflow,
  type MigrateViewRangesWorkflowParams,
  migrateViewRangesWorkflow,
  postUserRegistrationWorkflow,
  sendEmailWorkflow,
  updateUploadRecordSignal,
  updateUploadRecordWorkflow,
  uploadDoneSignal,
} from '@letschurch/temporal/workflows/background';
import { recordDownloadSizeWorkflow } from '@letschurch/temporal/workflows/background/record-download-size';
import {
  completeResetPasswordSignal,
  resetPasswordWorkflow,
} from '@letschurch/temporal/workflows/background/reset-password';
import { xxh32 } from '@node-rs/xxhash';
import { Client, Connection, type WorkflowOptions } from '@temporalio/client';
import PLazy from 'p-lazy';
import waitOn from 'wait-on';
import { z } from 'zod';
import logger from '../util/logger';
import type { S3ClientId } from '../util/s3';
import type { UploadPostProcessValue } from '../util/types';

export { indexDocument } from '@letschurch/temporal/client';

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
  data: Prisma.UploadRecordCreateArgs['data'],
  importId?: string,
) {
  const res = await (await client).workflow.start(createUploadRecordWorkflow, {
    ...retryOps,
    taskQueue: BACKGROUND_QUEUE,
    workflowId: `createUploadRecord:${
      importId ? `${importId}` : `${data.publishedAt}:${data.title}`
    }`,
    args: [data],
  });

  return res.result();
}

export async function updateUploadRecord(
  uploadRecordId: string,
  data: Prisma.UploadRecordUpdateArgs['data'],
) {
  return (await client).workflow.signalWithStart(updateUploadRecordWorkflow, {
    taskQueue: BACKGROUND_QUEUE,
    workflowId: `updateUploadRecord:${uploadRecordId}`,
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
  variant: UploadVariant,
  bytes: number,
) {
  return (await client).workflow.start(recordDownloadSizeWorkflow, {
    taskQueue: BACKGROUND_QUEUE,
    workflowId: `recordDownloadSize:${uploadRecordId}`,
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

export async function resetPassword(
  id: string,
  ...args: Parameters<typeof resetPasswordWorkflow>
) {
  return (await client).workflow.start(resetPasswordWorkflow, {
    ...retryOps,
    taskQueue: BACKGROUND_QUEUE,
    args,
    workflowId: `resetPassword:${id}`,
  });
}

export async function completeResetPassword(id: string, hash: string) {
  return (await client).workflow
    .getHandle(`resetPassword:${id}`)
    .signal(completeResetPasswordSignal, hash);
}

export async function geocodeOrganization(id: string) {
  return (await client).workflow.start(geocodeOrganizationWorkflow, {
    ...retryOps,
    taskQueue: BACKGROUND_QUEUE,
    args: [id],
    workflowId: `geocodeOrganization:${id}:${Date.now()}`,
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
    workflowId: `postUserRegistration:${userId}`,
  });
}

export async function deleteUpload(uploadRecordId: string) {
  return (await client).workflow.start(deleteUploadWorkflow, {
    ...retryOps,
    taskQueue: BACKGROUND_QUEUE,
    args: [uploadRecordId],
    workflowId: `deleteUpload:${uploadRecordId}:${Date.now()}`,
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
    workflowId: `importMedia:${xxh32(url)}:${Date.now()}`,
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

export async function startMigrateViewRanges(
  params: MigrateViewRangesWorkflowParams,
) {
  return (await client).workflow.start(migrateViewRangesWorkflow, {
    ...retryOps,
    taskQueue: BACKGROUND_QUEUE,
    workflowId: MIGRATE_VIEW_RANGES_WORKFLOW_ID,
    args: [params],
  });
}

export async function getMigrateViewRangesProgress() {
  try {
    const handle = (await client).workflow.getHandle(
      MIGRATE_VIEW_RANGES_WORKFLOW_ID,
    );
    const description = await handle.describe();

    if (description.status.name === 'RUNNING') {
      const progress = await handle.query(getMigrationProgressQuery);
      return {
        status: 'running' as const,
        ...progress,
      };
    }

    if (description.status.name === 'COMPLETED') {
      return {
        status: 'completed' as const,
        totalProcessed: 0,
        totalSecondsCreated: 0,
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
      totalProcessed: 0,
      totalSecondsCreated: 0,
      remaining: 0,
      batchesCompleted: 0,
    };
  } catch {
    // Workflow doesn't exist
    return null;
  }
}

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
