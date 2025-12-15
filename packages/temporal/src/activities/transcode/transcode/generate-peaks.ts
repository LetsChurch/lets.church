import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { ingestS3 } from '@letschurch/s3/ingest';
import { publicS3 } from '@letschurch/s3/public';
import { Context } from '@temporalio/activity';
import { mkdirp } from 'mkdirp';
import { rimraf } from 'rimraf';
import { runAudiowaveform } from '../../../util/audiowaveform';
import logger from '../../../util/logger';

const moduleLogger = logger.child({
  module: 'temporal/activities/transcode/generate-peaks',
});

const WORK_DIR = process.env.PEAKS_WORKING_DIRECTORY ?? '/data/peaks';

export default async function generatePeaks(
  uploadRecordId: string,
  s3UploadKey: string,
) {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'generatePeaks',
    context: {
      args: {
        uploadRecordId,
        s3UploadKey,
      },
    },
  });

  Context.current().heartbeat('job start');
  const signal = Context.current().cancellationSignal;
  const workingDir = join(WORK_DIR, uploadRecordId);

  try {
    activityLogger.info(`Making working directory: ${workingDir}`);

    await mkdirp(workingDir);
    const downloadPath = join(workingDir, 'download');

    await ingestS3.streamObjectToFile(s3UploadKey, downloadPath, () =>
      Context.current().heartbeat('download'),
    );

    // Generate and upload peaks
    activityLogger.info('Generating peaks');
    const peakFiles = await runAudiowaveform(
      workingDir,
      downloadPath,
      signal,
      () => Context.current().heartbeat('audiowaveform'),
    );

    activityLogger.info('Queuing upload of peaks');
    activityLogger.info('Uploading peak json');
    Context.current().heartbeat(`Uploading peak json`);
    await publicS3.retryablePutFile({
      key: `${uploadRecordId}/peaks.json`,
      contentType: 'application/json',
      path: peakFiles.json,
      contentLength: (await stat(peakFiles.json)).size,
      signal,
    });
    Context.current().heartbeat('Uploaded peak json');
    activityLogger.info('Uploaded peak json');
    activityLogger.info('Uploading peak dat');
    Context.current().heartbeat(`Uploading peak dat`);
    await publicS3.retryablePutFile({
      key: `${uploadRecordId}/peaks.dat`,
      contentType: 'application/octet-stream',
      path: peakFiles.dat,
      contentLength: (await stat(peakFiles.dat)).size,
      signal,
    });
    Context.current().heartbeat('Uploaded peak dat');
    activityLogger.info('Uploaded peak dat');
  } catch (e) {
    activityLogger.error(
      { err: e instanceof Error ? e : new Error(String(e)) },
      'Failed to generate peaks',
    );
  } finally {
    activityLogger.info(`Removing work directory: ${workingDir}`);
    await rimraf(workingDir);
  }
}
