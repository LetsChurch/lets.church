import { readFile } from 'node:fs/promises';
import { execa } from 'execa';
import { noop } from 'lodash-es';
import fastGlob from 'fast-glob';
import { z } from 'zod';
import { stringifySync } from 'subtitle';

const whisperModel = process.env['WHISPER_MODEL'] ?? 'large-v2';
const extraArgs = process.env['WHISPER_EXTRA_ARGS']?.split(' ') ?? [];

export async function runWhisper(
  cwd: string,
  inputFilename: string,
  signal: AbortSignal,
  heartbeat = noop,
) {
  console.log('Running whisper');

  const proc = execa(
    'whisper-ctranslate2',
    [
      inputFilename,
      '--model_directory',
      `/opt/whisper/models/${whisperModel}`,
      '--output_dir',
      'out',
      '--vad_filter',
      'True',
      '--word_timestamps',
      'True',
      ...extraArgs,
    ],
    { cwd, signal },
  );

  console.log(`runWhisper: ${proc.spawnargs.join(' ')}`);

  proc.stdout?.on('data', () => heartbeat('whisper stdout'));
  proc.stderr?.on('data', () => heartbeat('whisper stderr'));

  const res = await proc;

  console.log(`Whisper done: ${res.exitCode}`);

  const files = await fastGlob(`${cwd}/out/*`);

  return files;
}

const whisperJsonSchema = z.object({
  text: z.string(),
  segments: z.array(
    z.object({
      id: z.number(),
      start: z.number(),
      end: z.number(),
      text: z.string(),
      tokens: z.array(z.number()),
      temperature: z.number(),
      avg_logprob: z.number(),
      compression_ratio: z.number(),
      no_speech_prob: z.number(),
      words: z.array(
        z.object({
          start: z.number(),
          end: z.number(),
          word: z.string(),
          probability: z.number(),
        }),
      ),
    }),
  ),
  language: z.string(),
});

export type JoinerizedTranscript = {
  text: string;
  segments: Array<{
    text: string;
    start: number;
    end: number;
    words: Array<{
      start: number;
      end: number;
      word: string;
      probability: number;
    }>;
  }>;
};

const endingSentence = /[.!?]/g;

export function joinerizeTranscript(
  transcript: z.infer<typeof whisperJsonSchema>,
): JoinerizedTranscript {
  const joinerized: JoinerizedTranscript = { text: '', segments: [] };
  type Segment = JoinerizedTranscript['segments'][number];
  let workingSegment: Segment = { text: '', start: 0, end: 0, words: [] };

  for (const item of transcript.segments.flatMap((s) => s.words)) {
    workingSegment.words.push(item);

    if (endingSentence.test(item.word.trim())) {
      workingSegment.text = workingSegment.words
        .map((w) => w.word)
        .join('')
        .trim();
      workingSegment.start = workingSegment.words.at(0)?.start ?? 0;
      workingSegment.end = workingSegment.words.at(-1)?.end ?? 0;
      joinerized.segments.push(workingSegment);
      workingSegment = { text: '', start: 0, end: 0, words: [] };
    }
  }

  if (workingSegment.text) {
    joinerized.segments.push(workingSegment);
  }

  return joinerized;
}

export async function readWhisperJsonFile(path: string) {
  const json = await readFile(path);
  return whisperJsonSchema.parse(JSON.parse(json.toString()));
}

export function whisperJsonToVtt(transcript: JoinerizedTranscript) {
  return stringifySync(
    transcript.segments.map((data) => ({
      type: 'cue',
      data: { text: data.text, start: data.start * 1000, end: data.end * 1000 },
    })),
    { format: 'WebVTT' },
  );
}
