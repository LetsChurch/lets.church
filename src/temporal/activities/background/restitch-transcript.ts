import { Context } from '@temporalio/activity';
import { invariant } from 'es-toolkit';
import logger from '../../../util/logger';
import { publicS3 } from '../../../util/s3';
import {
  stitchTranscript,
  whisperJsonSchema,
  whisperJsonToVtt,
} from '../../../util/whisper';
import { updateUploadRecord } from '../..';

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

  const { Body: json } = await publicS3.getObject(
    `${uploadRecordId}/transcript.original.json`,
  );
  invariant(json, 'transcript.original.json not found');
  const parsed = whisperJsonSchema.parse(
    JSON.parse(await json.transformToString()),
  );

  const fixedJson = stitchTranscript(parsed);
  const fixedVtt = Buffer.from(whisperJsonToVtt(fixedJson));

  const transcriptKey = `${uploadRecordId}/transcript.vtt`;

  await publicS3.retryablePutFile({
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

  return transcriptKey;
}
