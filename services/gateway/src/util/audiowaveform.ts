import { execa } from 'execa';
import { noop } from 'lodash-es';

export async function runAudiowaveform(
  cwd: string,
  inputFilename: string,
  signal: AbortSignal,
  heartbeat = noop,
) {
  const wavFile = `${inputFilename}.wav`;

  console.log('Converting file to wav');

  const ffmpegRes = execa(
    'ffmpeg',
    ['-i', inputFilename, '-ar', '16000', '-ac', '1', wavFile],
    { cwd, signal },
  );

  ffmpegRes.stdout?.on('data', () => heartbeat());
  ffmpegRes.stderr?.on('data', () => heartbeat());

  await ffmpegRes;

  console.log(`ffmpeg done: ${ffmpegRes.exitCode}`);

  console.log('Running audiowaveform json');

  const proc1 = execa(
    'audiowaveform',
    ['-i', wavFile, '-o', `${wavFile}.json`],
    { cwd, signal },
  );

  proc1.stdout?.on('data', () => heartbeat());
  proc1.stderr?.on('data', () => heartbeat());

  const res1 = await proc1;

  console.log(`audiowaveform json done: ${res1.exitCode}`);

  console.log('Running audiowaveform dat');

  const proc2 = execa(
    'audiowaveform',
    ['-i', wavFile, '-o', `${wavFile}.dat`],
    { cwd, signal },
  );

  proc2.stdout?.on('data', () => heartbeat());
  proc2.stderr?.on('data', () => heartbeat());

  const res2 = await proc1;

  console.log(`audiowaveform dat done: ${res2.exitCode}`);

  return {
    json: `${wavFile}.json`,
    dat: `${wavFile}.dat`,
  };
}
