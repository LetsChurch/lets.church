import { execa } from 'execa';
import { noop } from 'lodash-es';

export async function runWhisper(
  cwd: string,
  inputFilename: string,
  heartbeat = noop,
) {
  const wavFile = `${inputFilename}.wav`;

  console.log('Converting file to wav');

  const ffmpegRes = await execa('ffmpeg', [
    '-i',
    inputFilename,
    '-ar',
    '16000',
    '-ac',
    '1',
    wavFile,
  ]);

  console.log(`ffmpeg done: ${ffmpegRes.exitCode}`);

  console.log('Running whisper');

  const proc = execa(
    'whisper',
    ['-m', '/opt/whisper/ggml-base.bin', '--output-vtt', '-f', wavFile],
    { cwd },
  );

  proc.stdout?.on('data', () => heartbeat());

  const res = await proc;

  console.log(`Whisper done: ${res.exitCode}`);

  return `${wavFile}.vtt`;
}
