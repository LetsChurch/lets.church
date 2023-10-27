import { join, extname } from 'node:path';
import { stat } from 'node:fs/promises';
import { Context } from '@temporalio/activity';
import mkdirp from 'mkdirp';
import rimraf from 'rimraf';
import mime from 'mime';
import invariant from 'tiny-invariant';
import { updateUploadRecord } from '../..';
import { retryablePutFile, streamObjectToFile } from '../../../util/s3';
import {
  stitchTranscript,
  readWhisperJsonFile,
  runWhisper,
  whisperJsonToVtt,
} from '../../../util/whisper';
import logger from '../../../util/logger';

const moduleLogger = logger.child({
  module: 'temporal/activities/transcribe/transcribe',
});

const WORK_DIR =
  process.env['TRANSCRIBE_WORKING_DIRECTORY'] ?? '/data/transcribe';

export default async function transcribe(
  uploadRecordId: string,
  s3UploadKey: string,
) {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'transcribe',
    args: {
      uploadRecordId,
      s3UploadKey,
    },
  });

  Context.current().heartbeat('job start');
  const cancellationSignal = Context.current().cancellationSignal;
  const workingDir = join(WORK_DIR, uploadRecordId);

  await updateUploadRecord(uploadRecordId, {
    transcribingStartedAt: new Date(),
  });

  try {
    await mkdirp(workingDir);
    const downloadPath = join(workingDir, 'download');

    await streamObjectToFile(
      'INGEST',
      s3UploadKey,
      downloadPath,
      () => () => Context.current().heartbeat('download'),
    );

    const outputFiles = await runWhisper(
      workingDir,
      downloadPath,
      cancellationSignal,
      () => Context.current().heartbeat('whisper'),
    );

    activityLogger.info(`whisper done`);
    Context.current().heartbeat('whisper done');

    const keys = await Promise.all(
      outputFiles.map(async (file) => {
        activityLogger.info(`uploading file: ${file}`);

        const ext = extname(file).slice(1);
        const key = `${uploadRecordId}/transcript.original.${ext}`;
        await retryablePutFile({
          to: 'PUBLIC',
          key,
          contentType: mime.getType(ext) ?? 'text/plain',
          path: file,
          contentLength: (await stat(file)).size,
          signal: cancellationSignal,
        });

        activityLogger.info(`done uploading ${file}`);
        Context.current().heartbeat(`done uploading ${key}`);

        return key;
      }),
    );

    Context.current().heartbeat('fixing transcript');

    const jsonPath = outputFiles.find((f) => extname(f) === '.json');
    invariant(jsonPath, 'No JSON path found!');

    const whisperJson = await readWhisperJsonFile(jsonPath);
    const fixedJson = stitchTranscript(whisperJson);
    const fixedVtt = Buffer.from(whisperJsonToVtt(fixedJson));

    activityLogger.info(`uploading file: transcript.vtt`);

    const transcriptKey = `${uploadRecordId}/transcript.vtt`;

    await retryablePutFile({
      to: 'PUBLIC',
      key: transcriptKey,
      contentType: 'text/vtt',
      body: fixedVtt,
      contentLength: fixedVtt.length,
      signal: cancellationSignal,
    });

    activityLogger.info(`done uploading transcript.vtt`);

    Context.current().heartbeat('done uploading fixed transcript');

    await updateUploadRecord(uploadRecordId, {
      transcribingFinishedAt: new Date(),
    });

    return { transcriptKey, additionalKeys: keys };
  } catch (e) {
    activityLogger.error(e instanceof Error ? e.message : e);
    await updateUploadRecord(uploadRecordId, {
      transcribingStartedAt: null,
      transcribingFinishedAt: null,
    });
    throw e;
  } finally {
    activityLogger.info('Cleaning up');
    await rimraf(workingDir);
  }
}
