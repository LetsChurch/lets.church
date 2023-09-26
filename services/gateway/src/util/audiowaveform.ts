import { join } from 'node:path';
import { execa } from 'execa';
import { noop } from 'lodash-es';
import { disposableExeca } from './execa';

export async function runAudiowaveform(
  cwd: string,
  inputFilename: string,
  signal: AbortSignal,
  heartbeat = noop,
) {
  const wavFile = join(cwd, 'download.wav');

  console.log('Converting file to wav');

  using ffmpegChild = disposableExeca(
    execa(
      'ffmpeg',
      [
        '-hide_banner',
        '-y',
        '-i',
        inputFilename,
        '-ar',
        '16000',
        '-ac',
        '1',
        wavFile,
      ],
      { cwd, signal },
    ),
  );

  console.log(`runAudiowaveform: ${ffmpegChild.proc.spawnargs.join(' ')}`);

  ffmpegChild.proc.stdout?.on('data', () => heartbeat());
  ffmpegChild.proc.stderr?.on('data', () => heartbeat());

  await ffmpegChild.proc;

  console.log(`ffmpeg done: ${ffmpegChild.proc.exitCode}`);

  console.log('Running audiowaveform json');

  using awChild1 = disposableExeca(
    execa(
      'audiowaveform',
      ['-i', wavFile, '-b', '8', '-o', `${wavFile}.json`],
      { cwd, signal },
    ),
  );

  console.log(`runAudiowaveform: ${awChild1.proc.spawnargs.join(' ')}`);

  awChild1.proc.stdout?.on('data', () => heartbeat());
  awChild1.proc.stderr?.on('data', () => heartbeat());

  const res1 = await awChild1.proc;

  console.log(`audiowaveform json done: ${res1.exitCode}`);

  console.log('Running audiowaveform dat');

  using awChild2 = disposableExeca(
    execa('audiowaveform', ['-i', wavFile, '-b', '8', '-o', `${wavFile}.dat`], {
      cwd,
      signal,
    }),
  );

  console.log(`runAudiowaveform: ${awChild2.proc.spawnargs.join(' ')}`);

  awChild2.proc.stdout?.on('data', () => heartbeat());
  awChild2.proc.stderr?.on('data', () => heartbeat());

  const res2 = await awChild2.proc;

  console.log(`audiowaveform dat done: ${res2.exitCode}`);

  return {
    json: `${wavFile}.json`,
    dat: `${wavFile}.dat`,
  };
}
