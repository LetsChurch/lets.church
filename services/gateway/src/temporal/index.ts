import envariant from '@knpwrs/envariant';
import { Connection, WorkflowClient } from '@temporalio/client';
import { transcriptionDoneSignal } from './workflows/background/transcribe';
import { processUpload as processUploadWorkflow } from './workflows/process-upload';
import { PROCESS_UPLOAD_QUEUE } from './queues';

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
