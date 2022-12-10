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

function makeMultipartMediaUploadWorkflowId(key: string, uploadId: string) {
  return `handleMultipartMediaUpload:${key}:${xxh32(uploadId)}`;
}

export async function handleMultipartMediaUpload(
  bucket: string,
  key: string,
  uploadId: string,
) {
  return (await client).start(handleMultipartMediaUploadWorkflow, {
    ...retryOps,
    taskQueue: BACKGROUND_QUEUE,
    workflowId: makeMultipartMediaUploadWorkflowId(key, uploadId),
    args: [bucket, key, uploadId],
  });
}

export async function completeMultipartMediaUpload(
  key: string,
  uploadId: string,
  partETags: Array<string>,
) {
  return (await client)
    .getHandle(makeMultipartMediaUploadWorkflowId(key, uploadId))
    .signal(uploadDoneSignal, partETags);
}

export async function indexDocument(kind: DocumentKind, id: string) {
  return pRetry(
    async () => {
      return (await client).signalWithStart(indexDocumentWorkflow, {
        taskQueue: BACKGROUND_QUEUE,
        workflowId: `${kind}:${id}`,
        args: [kind, id],
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
