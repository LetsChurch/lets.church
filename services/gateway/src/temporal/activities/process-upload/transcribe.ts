import { join } from 'node:path';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Context } from '@temporalio/activity';
import mkdirp from 'mkdirp';
import rimraf from 'rimraf';
import { throttle } from 'lodash-es';
import { updateUploadRecord } from '../..';
import {
  retryablePutFile,
  S3_INGEST_BUCKET,
  S3_PUBLIC_BUCKET,
  streamObjectToFile,
} from '../../../util/s3';
import { runWhisper } from '../../../util/whisper';

const WORK_DIR = '/data/transcribe';

export default async function transcribe(
  uploadRecordId: string,
  s3UploadKey: string,
) {
  Context.current().heartbeat('job start');
  const cancellationSignal = Context.current().cancellationSignal;
  const dir = join(WORK_DIR, uploadRecordId);
  const dataHeartbeat = throttle(
    () => Context.current().heartbeat('data'),
    5000,
  );

  await updateUploadRecord(uploadRecordId, {
    transcribingStartedAt: new Date(),
  });

  try {
    console.log('downloading media');

    await mkdirp(dir);
    const downloadPath = join(dir, 'download');
    await streamObjectToFile(
      S3_INGEST_BUCKET,
      s3UploadKey,
      downloadPath,
      dataHeartbeat,
    );

    console.log('media downloaded');
    Context.current().heartbeat('media downloaded');

    const vttFile = await runWhisper(
      dir,
      downloadPath,
      cancellationSignal,
      dataHeartbeat,
    );

    console.log(`whisper done: ${vttFile}`);
    Context.current().heartbeat('whisper done');

    console.log('uploading file');
    const key = `${uploadRecordId}.vtt`;
    await retryablePutFile(
      S3_PUBLIC_BUCKET,
      key,
      'text/vtt',
      createReadStream(vttFile),
      {
        contentLength: (await stat(vttFile)).size,
      },
    );

    console.log('done uploading');
    Context.current().heartbeat('done uploading');

    await updateUploadRecord(uploadRecordId, {
      transcribingFinishedAt: new Date(),
    });

    return key;
  } catch (e) {
    console.error(e);
    await updateUploadRecord(uploadRecordId, {
      transcribingStartedAt: null,
      transcribingFinishedAt: null,
    });
    dataHeartbeat.flush();
    throw e;
  } finally {
    console.log('Cleaning up');
    await rimraf(dir);
  }
}
