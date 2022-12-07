import { join } from 'node:path';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { Context } from '@temporalio/activity';
import mkdirp from 'mkdirp';
import { type NodeCue, parseSync as parseVtt } from 'subtitle';
import { retryablePutFile, streamObjectToFile } from '../../../util/s3';
import rimraf from '../../../util/rimraf';
import { runWhisper } from '../../../util/whisper';
import prisma from '../../../util/prisma';

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

    console.log('parsing vtt');
    const parsed = parseVtt(await readFile(vttFile, 'utf-8'))
      .filter((n): n is NodeCue => n.type === 'cue')
      .map(({ data: { start, end, text } }) => ({ start, end, text }));

    console.log('done parsing vtt');
    Context.current().heartbeat('done parsing vtt');

    console.log('Saving parsed transcript');
    await prisma.uploadRecord.update({
      where: { id },
      data: { transcriptSegments: parsed },
    });
  } finally {
    console.log('Cleaning up');
    await rimraf(dir);
  }
}
