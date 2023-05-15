import { execa } from 'execa';
import { noop } from 'lodash-es';
import fastGlob from 'fast-glob';

const whisperModel = process.env['WHISPER_MODEL'] ?? 'large-v2';
const extraArgs = process.env['WHISPER_EXTRA_ARGS']?.split(' ') ?? [];

export async function runWhisper(
  cwd: string,
  inputFilename: string,
  signal: AbortSignal,
  heartbeat = noop,
) {
  const wavFile = `${inputFilename}.wav`;

  console.log('Converting file to wav');

  const ffmpegRes = execa(
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

  ffmpegRes.stdout?.on('data', () => heartbeat());
  ffmpegRes.stderr?.on('data', () => heartbeat());

  await ffmpegRes;

  console.log(`ffmpeg done: ${ffmpegRes.exitCode}`);

  console.log('Running whisper');

  const proc = execa(
    'whisper-ctranslate2',
    [
      wavFile,
      '--model_directory',
      `/opt/whisper/models/${whisperModel}`,
      '--output_dir',
      'out',
      '--vad_filter',
      'True',
      ...extraArgs,
    ],
    { cwd, signal },
  );

  proc.stdout?.on('data', () => heartbeat('whisper stdout'));
  proc.stderr?.on('data', () => heartbeat('whisper stderr'));

  const res = await proc;

  console.log(`Whisper done: ${res.exitCode}`);

  const files = await fastGlob(`${cwd}/out/*`);

  return files;
}
