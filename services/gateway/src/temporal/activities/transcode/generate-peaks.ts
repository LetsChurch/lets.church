import { join } from 'node:path';
import { stat } from 'node:fs/promises';
import { Context } from '@temporalio/activity';
import mkdirp from 'mkdirp';
import rimraf from 'rimraf';
import { runAudiowaveform } from '../../../util/audiowaveform';
import { createPresignedGetUrl, retryablePutFile } from '../../../util/s3';
import { streamUrlToDisk } from '../../../util/node';
import { dataHeartbeat } from '../../../util/temporal';

const WORK_DIR = process.env['PEAKS_WORKING_DIRECTORY'] ?? '/data/peaks';

export default async function generatePeaks(
  uploadRecordId: string,
  s3UploadKey: string,
) {
  Context.current().heartbeat('job start');
  const cancellationSignal = Context.current().cancellationSignal;
  const workingDir = join(WORK_DIR, uploadRecordId);

  try {
    console.log(`Making working directory: ${workingDir}`);

    await mkdirp(workingDir);
    const downloadPath = join(workingDir, 'download');

    await streamUrlToDisk(
      await createPresignedGetUrl('INGEST', s3UploadKey),
      downloadPath,
      () => dataHeartbeat('download'),
    );

    // Generate and upload peaks
    console.log('Generating peaks');
    const peakFiles = await runAudiowaveform(
      workingDir,
      downloadPath,
      cancellationSignal,
      dataHeartbeat,
    );

    console.log('Queuing upload of peaks');
    console.log('Uploading peak json');
    Context.current().heartbeat(`Uploading peak json`);
    await retryablePutFile({
      to: 'PUBLIC',
      key: `${uploadRecordId}/peaks.json`,
      contentType: 'application/json',
      path: peakFiles.json,
      contentLength: (await stat(peakFiles.json)).size,
    });
    Context.current().heartbeat('Uploaded peak json');
    console.log('Uploaded peak json');
    console.log('Uploading peak dat');
    Context.current().heartbeat(`Uploading peak dat`);
    await retryablePutFile({
      to: 'PUBLIC',
      key: `${uploadRecordId}/peaks.dat`,
      contentType: 'application/octet-stream',
      path: peakFiles.dat,
      contentLength: (await stat(peakFiles.dat)).size,
    });
    Context.current().heartbeat('Uploaded peak dat');
    console.log('Uploaded peak dat');
  } catch (e) {
    console.log('Error!');
    console.log(e);
  } finally {
    console.log('Flushing heartbeats');
    dataHeartbeat.flush();
    console.log(`Removing work directory: ${workingDir}`);
    await rimraf(workingDir);
  }
}
