import { join } from 'node:path';
import { execa } from 'execa';
import { noop } from 'lodash-es';

export async function runAudiowaveform(
  cwd: string,
  inputFilename: string,
  signal: AbortSignal,
  heartbeat = noop,
) {
  const wavFile = join(cwd, 'download.wav');

  console.log('Converting file to wav');

  const ffmpegProc = execa(
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
  );

  console.log(`runAudiowaveform: ffmpeg ${ffmpegProc.spawnargs.join(' ')}`);

  ffmpegProc.stdout?.on('data', () => heartbeat());
  ffmpegProc.stderr?.on('data', () => heartbeat());

  await ffmpegProc;

  console.log(`ffmpeg done: ${ffmpegProc.exitCode}`);

  console.log('Running audiowaveform json');

  const proc1 = execa(
    'audiowaveform',
    ['-i', wavFile, '-b', '8', '-o', `${wavFile}.json`],
    { cwd, signal },
  );

  console.log(`runAudiowaveform: audiowaveform ${proc1.spawnargs.join(' ')}`);

  proc1.stdout?.on('data', () => heartbeat());
  proc1.stderr?.on('data', () => heartbeat());

  const res1 = await proc1;

  console.log(`audiowaveform json done: ${res1.exitCode}`);

  console.log('Running audiowaveform dat');

  const proc2 = execa(
    'audiowaveform',
    ['-i', wavFile, '-b', '8', '-o', `${wavFile}.dat`],
    { cwd, signal },
  );

  console.log(`runAudiowaveform: audiowaveform ${proc2.spawnargs.join(' ')}`);

  proc2.stdout?.on('data', () => heartbeat());
  proc2.stderr?.on('data', () => heartbeat());

  const res2 = await proc2;

  console.log(`audiowaveform dat done: ${res2.exitCode}`);

  return {
    json: `${wavFile}.json`,
    dat: `${wavFile}.dat`,
  };
}
