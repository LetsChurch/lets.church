import { join, extname } from 'node:path';
import { stat } from 'node:fs/promises';
import { Context } from '@temporalio/activity';
import mkdirp from 'mkdirp';
import rimraf from 'rimraf';
import { throttle } from 'lodash-es';
import mime from 'mime';
import invariant from 'tiny-invariant';
import { updateUploadRecord } from '../..';
import { retryablePutFile, streamObjectToFile } from '../../../util/s3';
import {
  joinerizeTranscript,
  readWhisperJsonFile,
  runWhisper,
  whisperJsonToVtt,
} from '../../../util/whisper';

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
        const key = `${uploadRecordId}/transcript.original.${ext}`;
        await retryablePutFile({
          to: 'PUBLIC',
          key,
          contentType: mime.getType(ext) ?? 'text/plain',
          path: file,
          contentLength: (await stat(file)).size,
        });

        console.log(`done uploading ${file}`);
        Context.current().heartbeat(`done uploading ${key}`);

        return key;
      }),
    );

    Context.current().heartbeat('fixing transcript');

    const jsonPath = outputFiles.find((f) => extname(f) === '.json');
    invariant(jsonPath, 'No JSON path found!');

    const whisperJson = await readWhisperJsonFile(jsonPath);
    const fixedJson = joinerizeTranscript(whisperJson);
    const fixedVtt = Buffer.from(whisperJsonToVtt(fixedJson));

    console.log(`uploading file: transcript.vtt`);

    const transcriptKey = `${uploadRecordId}/transcript.vtt`;

    await retryablePutFile({
      to: 'PUBLIC',
      key: transcriptKey,
      contentType: 'text/vtt',
      body: fixedVtt,
      contentLength: fixedVtt.length,
    });

    console.log(`done uploading transcript.vtt`);

    Context.current().heartbeat('done uploading fixed transcript');

    await updateUploadRecord(uploadRecordId, {
      transcribingFinishedAt: new Date(),
    });

    return { transcriptKey, additionalKeys: keys };
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
