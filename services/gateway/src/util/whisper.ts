import { readFile } from 'node:fs/promises';
import { execa } from 'execa';
import { noop } from 'lodash-es';
import fastGlob from 'fast-glob';
import * as Z from 'zod';
import { stringifySync } from 'subtitle';

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

const whisperJsonSchema = Z.object({
  text: Z.string(),
  segments: Z.array(
    Z.object({
      start: Z.number(),
      end: Z.number(),
      text: Z.string(),
    }),
  ),
});

export function joinerizeTranscript(
  transcript: Z.infer<typeof whisperJsonSchema>,
) {
  type Segment = Z.infer<typeof whisperJsonSchema>['segments'][number];
  const newSegments: Array<Segment> = [];
  let workingSegment: Segment | null = null;

  for (const segment of transcript.segments) {
    if (!workingSegment) {
      workingSegment = { ...segment };
    } else if (
      (workingSegment.end - workingSegment.start >= 5 ||
        workingSegment.text.length >= 120) &&
      (segment.end - workingSegment.start >= 5 ||
        workingSegment.text.length + segment.text.length >= 120)
    ) {
      newSegments.push(workingSegment);
      workingSegment = { ...segment };
    } else {
      workingSegment.end = segment.end;
      workingSegment.text = `${workingSegment.text.trim()} ${segment.text.trim()}`;
    }
  }

  if (workingSegment) {
    newSegments.push(workingSegment);
  }

  return { ...transcript, segments: newSegments };
}

export async function readWhisperJsonFile(path: string) {
  const json = await readFile(path);
  return whisperJsonSchema.parse(JSON.parse(json.toString()));
}

export function whisperJsonToVtt(
  transcript: Z.infer<typeof whisperJsonSchema>,
) {
  return stringifySync(
    transcript.segments.map((data) => ({
      type: 'cue',
      data: { ...data, start: data.start * 1000, end: data.end * 1000 },
    })),
    { format: 'WebVTT' },
  );
}
