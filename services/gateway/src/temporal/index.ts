import envariant from '@knpwrs/envariant';
import { Connection, WorkflowClient } from '@temporalio/client';
import pRetry from 'p-retry';
import waitOn from 'wait-on';
import {
  indexDocumentSignal,
  indexDocument as indexDocumentWorkflow,
  sendEmail as sendEmailWorkflow,
  transcriptionDoneSignal,
} from './workflows/background';
import { processUpload as processUploadWorkflow } from './workflows/process-upload';
import { PROCESS_UPLOAD_QUEUE, BACKGROUND_QUEUE } from './queues';
import type { DocumentKind } from './activities/background/index-document';

const TEMPORAL_ADDRESS = envariant('TEMPORAL_ADDRESS');

const client = new WorkflowClient({
  connection: await Connection.connect({
    address: TEMPORAL_ADDRESS,
  }),
});

export async function processUpload(id: string) {
  return client.start(processUploadWorkflow, {
    taskQueue: PROCESS_UPLOAD_QUEUE,
    workflowId: id,
    args: [id],
  });
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
