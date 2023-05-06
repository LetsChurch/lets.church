import { join, extname } from 'node:path';
import { stat } from 'node:fs/promises';
import { Context } from '@temporalio/activity';
import mkdirp from 'mkdirp';
import rimraf from 'rimraf';
import { throttle } from 'lodash-es';
import mime from 'mime';
import { updateUploadRecord } from '../..';
import { retryablePutFile, streamObjectToFile } from '../../../util/s3';
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
    (arg = 'data') => Context.current().heartbeat(arg),
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
      'INGEST',
      s3UploadKey,
      downloadPath,
      dataHeartbeat,
    );

    console.log('media downloaded');
    Context.current().heartbeat('media downloaded');

    const outputFiles = await runWhisper(
      dir,
      downloadPath,
      cancellationSignal,
      dataHeartbeat,
    );

    console.log(`whisper done`);
    Context.current().heartbeat('whisper done');

    const keys = await Promise.all(
      outputFiles.map(async (file) => {
        console.log(`uploading file: ${file}`);

        const ext = extname(file).slice(1);
        const key = `${uploadRecordId}/transcript.${ext}`;
        await retryablePutFile({
          to: 'PUBLIC',
          key,
          contentType: mime.getType(ext) ?? 'text/plain',
          path: file,
          contentLength: (await stat(file)).size,
        });

        console.log('done uploading');
        Context.current().heartbeat('done uploading');

        return key;
      }),
    );

    await updateUploadRecord(uploadRecordId, {
      transcribingFinishedAt: new Date(),
    });

    return keys;
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
