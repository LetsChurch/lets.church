import { Context } from '@temporalio/activity';
import invariant from 'tiny-invariant';
import { executeChild } from '@temporalio/workflow';
import { updateUploadRecord } from '../..';
import { getObject, retryablePutFile } from '../../../util/s3';
import {
  stitchTranscript,
  whisperJsonSchema,
  whisperJsonToVtt,
} from '../../../util/whisper';
import logger from '../../../util/logger';
import { indexDocumentWorkflow } from '../../workflows';
import { BACKGROUND_QUEUE } from '../../queues';

const moduleLogger = logger.child({
  module: 'temporal/activities/transcribe/transcribe',
});

export default async function restitchTranscript(uploadRecordId: string) {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'restitchTranscript',
    args: {
      uploadRecordId,
    },
  });

  const { Body: json } = await getObject(
    'PUBLIC',
    `${uploadRecordId}/transcript.original.json`,
  );
  invariant(json, 'transcript.original.json not found');
  const parsed = whisperJsonSchema.parse(
    JSON.parse(await json.transformToString()),
  );

  const fixedJson = stitchTranscript(parsed);
  const fixedVtt = Buffer.from(whisperJsonToVtt(fixedJson));

  const transcriptKey = `${uploadRecordId}/transcript.vtt`;

  await retryablePutFile({
    to: 'PUBLIC',
    key: transcriptKey,
    contentType: 'text/vtt',
    body: fixedVtt,
    contentLength: fixedVtt.length,
    signal: Context.current().cancellationSignal,
  });

  activityLogger.info(`done uploading transcript.vtt`);

  Context.current().heartbeat('done uploading fixed transcript');

  await updateUploadRecord(uploadRecordId, {
    transcribingFinishedAt: new Date(),
  });

  await executeChild(indexDocumentWorkflow, {
    workflowId: `transcript:restitch:${uploadRecordId}`,
    args: ['transcript', uploadRecordId, transcriptKey],
    taskQueue: BACKGROUND_QUEUE,
    retry: {
      maximumAttempts: 2,
    },
  });

  return true;
}
