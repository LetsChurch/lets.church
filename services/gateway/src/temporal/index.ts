import envariant from '@knpwrs/envariant';
import { xxh32 } from '@node-rs/xxhash';
import {
  Connection,
  WorkflowClient,
  WorkflowOptions,
} from '@temporalio/client';
import pRetry from 'p-retry';
import PLazy from 'p-lazy';
import waitOn from 'wait-on';
import {
  handleMultipartMediaUploadWorkflow,
  indexDocumentSignal,
  indexDocumentWorkflow,
  sendEmailWorkflow,
  uploadDoneSignal,
} from './workflows/background';
import { BACKGROUND_QUEUE } from './queues';
import type { DocumentKind } from './activities/background/index-document';

const TEMPORAL_ADDRESS = envariant('TEMPORAL_ADDRESS');

const client = PLazy.from(async () => {
  await waitOnTemporal();

  return new WorkflowClient({
    connection: await Connection.connect({
      address: TEMPORAL_ADDRESS,
    }),
  });
});

const retryOps: Pick<WorkflowOptions, 'retry'> = {
  retry: { maximumAttempts: 8 },
};

function makeMultipartMediaUploadWorkflowId(uploadId: string, key: string) {
  return `handleMultipartMediaUpload:${xxh32(uploadId)}:${key}`;
}

export async function handleMultipartMediaUpload(
  uploadRecordId: string,
  bucket: string,
  s3UploadId: string,
  s3UploadKey: string,
  postProcess: 'media' | 'thumbnail',
) {
  return (await client).start(handleMultipartMediaUploadWorkflow, {
    ...retryOps,
    taskQueue: BACKGROUND_QUEUE,
    workflowId: makeMultipartMediaUploadWorkflowId(s3UploadId, s3UploadKey),
    args: [uploadRecordId, bucket, s3UploadId, s3UploadKey, postProcess],
  });
}

export async function completeMultipartMediaUpload(
  s3UploadId: string,
  s3UploadKey: string,
  partETags: Array<string>,
  userId: string,
) {
  return (await client)
    .getHandle(makeMultipartMediaUploadWorkflowId(s3UploadId, s3UploadKey))
    .signal(uploadDoneSignal, partETags, userId);
}

export async function indexDocument(
  kind: DocumentKind,
  uploadId: string,
  uploadKey?: string,
) {
  return pRetry(
    async () => {
      return (await client).signalWithStart(indexDocumentWorkflow, {
        taskQueue: BACKGROUND_QUEUE,
        workflowId: `${kind}:${uploadId}`,
        args: [kind, uploadId, uploadKey],
        signal: indexDocumentSignal,
        signalArgs: [],
        retry: {
          maximumAttempts: 8,
        },
      });
    },
    { retries: 8 },
  );
}

export async function sendEmail(
  id: string,
  ...args: Parameters<typeof sendEmailWorkflow>
) {
  return (await client).start(sendEmailWorkflow, {
    ...retryOps,
    taskQueue: BACKGROUND_QUEUE,
    args,
    workflowId: id,
  });
}

export async function waitOnTemporal() {
  console.log('Waiting for Temporal');

  await waitOn({
    resources: [`tcp:${TEMPORAL_ADDRESS}`],
  });

  console.log('Temporal is available!');
}
