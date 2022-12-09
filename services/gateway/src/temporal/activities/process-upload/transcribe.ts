import { join } from 'node:path';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Context } from '@temporalio/activity';
import mkdirp from 'mkdirp';
import { retryablePutFile, streamObjectToFile } from '../../../util/s3';
import rimraf from '../../../util/rimraf';
import { runWhisper } from '../../../util/whisper';

const WORK_DIR = '/data/transcribe';

export default async function transcribe(id: string) {
  Context.current().heartbeat('job start');
  const dir = join(WORK_DIR, id);

  try {
    console.log('downloading media');

    await mkdirp(dir);
    const downloadPath = join(dir, id);
    await streamObjectToFile(id, downloadPath);

    console.log('media downloaded');
    Context.current().heartbeat('media downloaded');

    const vttFile = await runWhisper(dir, downloadPath, () => {
      console.log('whisper stdout data');
      Context.current().heartbeat('whisper stdout data');
    });

    console.log(`whisper done: ${vttFile}`);
    Context.current().heartbeat('whisper done');

    console.log('uploading file');
    await retryablePutFile(`${id}.vtt`, 'text/vtt', createReadStream(vttFile), {
      contentLength: (await stat(vttFile)).size,
    });

    console.log('done uploading');
    Context.current().heartbeat('done uploading');
  } finally {
    console.log('Cleaning up');
    await rimraf(dir);
  }
}
