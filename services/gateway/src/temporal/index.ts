import envariant from '@knpwrs/envariant';
import { Connection, WorkflowClient } from '@temporalio/client';
import * as workflows from './workflows';
import { transcriptionDoneSignal } from './workflows/transcribe';

const TEMPORAL_ADDRESS = envariant('TEMPORAL_ADDRESS');

const client = new WorkflowClient({
  connection: await Connection.connect({
    address: TEMPORAL_ADDRESS,
  }),
});

export async function processUpload(id: string) {
  return client.start(workflows.processUpload, {
    taskQueue: 'background',
    workflowId: `process-upload:${id}`,
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
