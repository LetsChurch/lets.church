import envariant from '@knpwrs/envariant';
import { xxh32 } from '@node-rs/xxhash';
import { Connection, WorkflowClient } from '@temporalio/client';
import pRetry from 'p-retry';
import waitOn from 'wait-on';
import {
  handleMultipartMediaUploadWorkflow,
  indexDocumentSignal,
  indexDocumentWorkflow,
  sendEmailWorkflow,
  transcriptionDoneSignal,
  uploadDoneSignal,
} from './workflows/background';
import { BACKGROUND_QUEUE } from './queues';
import type { DocumentKind } from './activities/background/index-document';

const TEMPORAL_ADDRESS = envariant('TEMPORAL_ADDRESS');

const client = new WorkflowClient({
  connection: await Connection.connect({
    address: TEMPORAL_ADDRESS,
  }),
});

export async function handleMultipartMediaUpload(
  key: string,
  uploadId: string,
) {
  return client.start(handleMultipartMediaUploadWorkflow, {
    taskQueue: BACKGROUND_QUEUE,
    workflowId: `handleMultipartMediaUpload:${key}:${xxh32(uploadId)}`,
    args: [key, uploadId],
  });
}

export async function completeMultipartMediaUpload(
  key: string,
  uploadId: string,
  partETags: Array<string>,
) {
  return client
    .getHandle(`handleMultipartMediaUpload:${key}:${xxh32(uploadId)}`)
    .signal(uploadDoneSignal, partETags);
}

export async function processTranscript(
  uploadId: string,
  body: { transcriptId: string; status: 'completed' | 'error' },
) {
  return client
    .getHandle(`transcribe:${uploadId}`)
    .signal(transcriptionDoneSignal, body);
}

export async function indexDocument(kind: DocumentKind, id: string) {
  return pRetry(
    async () => {
      return client.signalWithStart(indexDocumentWorkflow, {
        taskQueue: BACKGROUND_QUEUE,
        workflowId: `${kind}:${id}`,
        args: [kind, id],
        signal: indexDocumentSignal,
        signalArgs: [],
      });
    },
    { retries: 5 },
  );
}

export async function sendEmail(
  id: string,
  ...args: Parameters<typeof sendEmailWorkflow>
) {
  return client.start(sendEmailWorkflow, {
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
