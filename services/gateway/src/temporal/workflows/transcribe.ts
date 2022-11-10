import {
  proxyActivities,
  condition,
  defineSignal,
  setHandler,
  executeChild,
} from '@temporalio/workflow';
import type * as activities from '../activities';
import { indexTranscript } from '../workflows';

type TranscriptionPayload = {
  transcriptId: string;
  status: 'completed' | 'error';
};

const { transcribeRequest, getTranscription } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: '60 minutes',
  heartbeatTimeout: '1 minute',
});

export const transcriptionDoneSignal =
  defineSignal<[TranscriptionPayload]>('transcriptionDone');

export default async function transcribe(uploadId: string) {
  const state: { webhookPayload: TranscriptionPayload | null } = {
    webhookPayload: null,
  };

  setHandler(transcriptionDoneSignal, (payload) => {
    state.webhookPayload = payload;
  });

  await transcribeRequest(uploadId);
  await condition(() => !!state.webhookPayload);

  if (state.webhookPayload?.status !== 'completed') {
    throw new Error('Transcription status is not completed!');
  }

  await getTranscription(uploadId, state.webhookPayload.transcriptId);

  await executeChild(indexTranscript, {
    workflowId: `indexTranscript:${uploadId}`,
    args: [uploadId],
  });
}
