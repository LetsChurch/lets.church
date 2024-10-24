import envariant from '@knpwrs/envariant';
import { xxh32 } from '@node-rs/xxhash';
import { Connection, Client, type WorkflowOptions } from '@temporalio/client';
import PLazy from 'p-lazy';
import waitOn from 'wait-on';
import type { Prisma, UploadVariant } from '@prisma/client';
import type { UploadPostProcessValue } from '../schema/types/mutation';
import type { Client as S3UtilClient } from '../util/s3';
import logger from '../util/logger';
import {
  handleMultipartMediaUploadWorkflow,
  indexDocumentWorkflow,
  sendEmailWorkflow,
  uploadDoneSignal,
  updateUploadRecordWorkflow,
  updateUploadRecordSignal,
  createUploadRecordWorkflow,
  geocodeOrganizationWorkflow,
} from './workflows';
import { BACKGROUND_QUEUE } from './queues';
import type { DocumentKind } from './activities/background/index-document';
import { recordDownloadSizeWorkflow } from './workflows/record-download-size';
import { emptySignal } from './signals';
import {
  completeResetPasswordSignal,
  resetPasswordWorkflow,
} from './workflows/reset-password';

const moduleLogger = logger.child({ module: 'temporal' });

const TEMPORAL_ADDRESS = envariant('TEMPORAL_ADDRESS');

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
  to: S3UtilClient,
  s3UploadId: string,
  s3UploadKey: string,
  postProcess: UploadPostProcessValue,
) {
  return (await client).workflow.start(handleMultipartMediaUploadWorkflow, {
    ...retryOps,
    taskQueue: BACKGROUND_QUEUE,
    workflowId: makeMultipartMediaUploadWorkflowId(s3UploadId, s3UploadKey),
    args: [uploadRecordId, to, s3UploadId, s3UploadKey, postProcess],
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
  const res = await (
    await client
  ).workflow.start(createUploadRecordWorkflow, {
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

export async function indexDocument(
  kind: DocumentKind,
  uploadId: string,
  uploadKey?: string,
) {
  return (await client).workflow.signalWithStart(indexDocumentWorkflow, {
    taskQueue: BACKGROUND_QUEUE,
    workflowId: `${kind}:${uploadId}`,
    args: [kind, uploadId, uploadKey],
    signal: emptySignal,
    signalArgs: [],
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

export async function waitOnTemporal() {
  moduleLogger.info('Waiting for Temporal');

  await waitOn({
    resources: [`tcp:${TEMPORAL_ADDRESS}`],
  });

  moduleLogger.info('Temporal is available!');
}
