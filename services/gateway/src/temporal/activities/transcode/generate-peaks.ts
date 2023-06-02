import { join } from 'node:path';
import { stat } from 'node:fs/promises';
import { Context } from '@temporalio/activity';
import mkdirp from 'mkdirp';
import { throttle } from 'lodash-es';
import rimraf from 'rimraf';
import { runAudiowaveform } from '../../../util/audiowaveform';
import { retryablePutFile, streamObjectToFile } from '../../../util/s3';

const WORK_DIR =
  process.env['TRANSCODE_WORKING_DIRECTORY'] ?? '/data/transcode';

export default async function generatePeaks(
  uploadRecordId: string,
  s3UploadKey: string,
) {
  Context.current().heartbeat('job start');
  const cancellationSignal = Context.current().cancellationSignal;
  const dir = join(WORK_DIR, uploadRecordId);
  const dataHeartbeat = throttle(() => Context.current().heartbeat(), 5000);

  try {
    console.log(`Making work directory: ${dir}`);

    await mkdirp(dir);
    const downloadPath = join(dir, 'download');

    console.log(`Downloading file to ${downloadPath}`);

    await streamObjectToFile('INGEST', s3UploadKey, downloadPath);

    console.log(`Downloaded file to ${downloadPath}`);

    Context.current().heartbeat('file downloaded');

    // Generate and upload peaks
    console.log('Generating peaks');
    const peakFiles = await runAudiowaveform(
      dir,
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
    console.log(`Removing work directory: ${dir}`);
    await rimraf(dir);
  }
}
