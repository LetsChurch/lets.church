import { stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { Context } from '@temporalio/activity';
import { invariant } from 'es-toolkit';
import mime from 'mime';
import { mkdirp } from 'mkdirp';
import { rimraf } from 'rimraf';
import { updateUploadRecord } from '../../client';
import logger from '../../util/logger';
import { ingestS3, publicS3 } from '../../util/s3';
import {
  readWhisperJsonFile,
  runWhisper,
  stitchTranscript,
  whisperJsonToVtt,
} from '../../util/whisper';

const moduleLogger = logger.child({
  module: 'temporal/activities/transcribe/transcribe',
});

const WORK_DIR = process.env.TRANSCRIBE_WORKING_DIRECTORY ?? '/data/transcribe';

export default async function transcribe(
  uploadRecordId: string,
  s3UploadKey: string,
) {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'transcribe',
    context: {
      args: {
        uploadRecordId,
        s3UploadKey,
      },
    },
  });

  activityLogger.info(
    {
      uploadId: uploadRecordId,
      s3UploadKey,
      context: {
        workingDir: WORK_DIR,
      },
    },
    'Transcription activity started',
  );

  Context.current().heartbeat('job start');
  const signal = Context.current().cancellationSignal;
  const workingDir = join(WORK_DIR, uploadRecordId);

  await updateUploadRecord(uploadRecordId, {
    transcribingStartedAt: new Date(),
  });

  try {
    await mkdirp(workingDir);
    const downloadPath = join(workingDir, 'download');

    activityLogger.info(
      {
        context: {
          bucket: 'ingest',
          key: s3UploadKey,
          destination: downloadPath,
        },
      },
      'Starting download from S3',
    );

    const downloadStart = Date.now();
    await ingestS3.streamObjectToFile(
      s3UploadKey,
      downloadPath,
      () => () => Context.current().heartbeat('download'),
    );

    const downloadedSize = (await stat(downloadPath)).size;
    const downloadDuration = Date.now() - downloadStart;

    activityLogger.info(
      {
        context: {
          sizeBytes: downloadedSize,
          sizeMB: (downloadedSize / 1024 / 1024).toFixed(2),
          durationMs: downloadDuration,
          speedMBps: (
            downloadedSize /
            1024 /
            1024 /
            (downloadDuration / 1000)
          ).toFixed(2),
        },
      },
      'Download complete',
    );

    activityLogger.info(
      {
        context: {
          audioPath: downloadPath,
          audioSizeMB: (downloadedSize / 1024 / 1024).toFixed(2),
        },
      },
      'Starting Whisper transcription',
    );

    const whisperStart = Date.now();
    const outputFiles = await runWhisper(workingDir, downloadPath, signal, () =>
      Context.current().heartbeat('whisper'),
    );
    const whisperDuration = Date.now() - whisperStart;

    activityLogger.info(
      {
        context: {
          durationMs: whisperDuration,
          durationMinutes: (whisperDuration / 1000 / 60).toFixed(2),
          outputFiles: outputFiles.map((f) => extname(f)),
          outputFileCount: outputFiles.length,
        },
      },
      'Whisper transcription complete',
    );

    Context.current().heartbeat('whisper done');

    activityLogger.info(
      {
        context: {
          fileCount: outputFiles.length,
        },
      },
      'Uploading original transcript files to S3',
    );

    const keys = await Promise.all(
      outputFiles.map(async (file) => {
        const fileSize = (await stat(file)).size;
        const ext = extname(file).slice(1);
        const key = `${uploadRecordId}/transcript.original.${ext}`;

        activityLogger.info(
          {
            context: {
              file: extname(file),
              key,
              sizeMB: (fileSize / 1024 / 1024).toFixed(2),
            },
          },
          'Uploading transcript file',
        );

        const uploadStart = Date.now();
        await publicS3.retryablePutFile({
          key,
          contentType: mime.getType(ext) ?? 'text/plain',
          path: file,
          contentLength: fileSize,
          signal,
        });

        activityLogger.info(
          {
            context: {
              key,
              durationMs: Date.now() - uploadStart,
            },
          },
          'Transcript file uploaded',
        );

        Context.current().heartbeat(`done uploading ${key}`);

        return key;
      }),
    );

    Context.current().heartbeat('fixing transcript');

    activityLogger.info('Processing and fixing transcript');

    const jsonPath = outputFiles.find((f) => extname(f) === '.json');
    invariant(jsonPath, 'No JSON path found!');

    const whisperJson = await readWhisperJsonFile(jsonPath);
    const fixedJson = stitchTranscript(whisperJson);
    const fixedVtt = Buffer.from(whisperJsonToVtt(fixedJson));

    activityLogger.info(
      {
        context: {
          segmentCount: fixedJson.segments.length,
          vttSizeKB: (fixedVtt.length / 1024).toFixed(2),
        },
      },
      'Transcript processed',
    );

    activityLogger.info(
      {
        context: {
          format: 'VTT',
          sizeMB: (fixedVtt.length / 1024 / 1024).toFixed(2),
        },
      },
      'Uploading fixed transcript',
    );

    const transcriptKey = `${uploadRecordId}/transcript.vtt`;
    const transcriptJsonKey = `${uploadRecordId}/transcript.original.json`;

    const vttUploadStart = Date.now();
    await publicS3.retryablePutFile({
      key: transcriptKey,
      contentType: 'text/vtt',
      body: fixedVtt,
      contentLength: fixedVtt.length,
      signal,
    });

    activityLogger.info(
      {
        context: {
          key: transcriptKey,
          durationMs: Date.now() - vttUploadStart,
        },
      },
      'Fixed transcript uploaded',
    );

    Context.current().heartbeat('done uploading fixed transcript');

    await updateUploadRecord(uploadRecordId, {
      transcribingFinishedAt: new Date(),
    });

    activityLogger.info(
      {
        context: {
          transcriptKey,
          transcriptJsonKey,
          additionalKeys: keys.length,
          totalDurationMs: Date.now() - whisperStart + downloadDuration,
        },
      },
      'Transcription activity completed successfully',
    );

    return { transcriptKey, transcriptJsonKey, additionalKeys: keys };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));

    activityLogger.error(
      {
        uploadId: uploadRecordId,
        s3UploadKey,
        context: {
          error: error.message,
          stack: error.stack,
        },
      },
      'Transcription activity failed',
    );

    await updateUploadRecord(uploadRecordId, {
      transcribingStartedAt: null,
      transcribingFinishedAt: null,
    });
    throw e;
  } finally {
    activityLogger.info(
      {
        context: {
          workingDir,
        },
      },
      'Cleaning up working directory',
    );
    await rimraf(workingDir);
  }
}
