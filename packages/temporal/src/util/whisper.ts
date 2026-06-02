import { readFile } from 'node:fs/promises';
import { noop } from 'es-toolkit';
import { execa } from 'execa';
import fastGlob from 'fast-glob';
import { stringifySync } from 'subtitle';
import { z } from 'zod';
import logger from './logger';
import { isAdjective, isConjunction, isPreposition } from './words';

const moduleLogger = logger.child({ module: 'util/whisper' });

const whisperModel = process.env.WHISPER_MODEL ?? 'large-v2';
const extraArgs = process.env.WHISPER_EXTRA_ARGS?.split(' ') ?? [];

export async function runWhisper(
  cwd: string,
  inputFilename: string,
  signal: AbortSignal,
  heartbeat: (s: string) => unknown = noop,
) {
  moduleLogger.info('Running whisper');

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
    { cwd, cancelSignal: signal },
  );

  moduleLogger.info(`runWhisper: ${proc.spawnargs.join(' ')}`);

  proc.stdout?.on('data', () => heartbeat('whisper stdout'));
  proc.stderr?.on('data', () => heartbeat('whisper stderr'));

  const res = await proc;

  moduleLogger.info(`Whisper done: ${res.exitCode}`);

  const files = await fastGlob(`${cwd}/out/*`);

  return files;
}

export const whisperJsonSchema = z.object({
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

// camelCase contract emitted by the Python transcribe worker
// (services/transcribe → {uploadRecordId}/transcript.json). Sentence-level
// segments with paragraph markers + per-word timings (seconds), plus per-speaker
// embeddings. The paragraph-storage activity is the sole consumer.
export const transcriptJsonSchema = z.object({
  language: z.string(),
  duration: z.number().nullable().optional(),
  text: z.string().optional(),
  speakerEmbeddings: z.record(z.string(), z.array(z.number())).optional(),
  segments: z.array(
    z.object({
      start: z.number(),
      end: z.number(),
      text: z.string(),
      speaker: z.string().nullable().optional(),
      paragraphIdx: z.number().nullable().optional(),
      isParagraphStart: z.boolean().nullable().optional(),
      // Whisper's pre-alignment DTW timings, preserved when CTC forced
      // alignment refined start/end. Absent when alignment was skipped or
      // fell back to whisper timings (start/end are the originals in that
      // case).
      originalStart: z.number().optional(),
      originalEnd: z.number().optional(),
      words: z.array(
        z.object({
          word: z.string(),
          start: z.number(),
          end: z.number(),
          probability: z.number().optional(),
          speaker: z.string().nullable().optional(),
          originalStart: z.number().optional(),
          originalEnd: z.number().optional(),
        }),
      ),
    }),
  ),
});

export type TranscriptJson = z.infer<typeof transcriptJsonSchema>;
export type TranscriptJsonSegment = TranscriptJson['segments'][number];

export type StitchedTranscript = {
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
const startCap = /^[A-Z]/;

export function stitchTranscript(
  transcript: z.infer<typeof whisperJsonSchema>,
): StitchedTranscript {
  const stitched: StitchedTranscript = { text: '', segments: [] };
  const flatWords = transcript.segments.flatMap((s) => s.words);

  // Each segment should be at least 5 seconds long and end a sentence.
  for (let i = 0; i < flatWords.length; i += 1) {
    for (let j = i; j < flatWords.length; j += 1) {
      // Greater than 5 seconds
      if ((flatWords[j]?.end ?? 0) - (flatWords[i]?.start ?? 0) >= 5) {
        const thisWord = flatWords[j]?.word.trim() ?? '';
        const nextWord = flatWords[j + 1]?.word.trim() ?? '';
        // Current word ends a sentence or next word starts a sentence
        if (
          endingSentence.test(thisWord) ||
          (!startCap.test(thisWord) &&
            startCap.test(nextWord) &&
            !(
              isConjunction(thisWord) ||
              isPreposition(thisWord) ||
              isAdjective(thisWord)
            ))
        ) {
          stitched.segments.push({
            start: flatWords[i]?.start ?? 0,
            end: flatWords[j]?.end ?? 0,
            text: flatWords
              .slice(i, j + 1)
              .map((w) => w.word.trim())
              .join(' '),
            words: flatWords.slice(i, j + 1),
          });

          stitched.text += ` ${flatWords
            .slice(i, j + 1)
            .map((w) => w.word.trim())
            .join(' ')}`.trimEnd();

          // Continue with next word
          i = j;
          break;
        }
      }
    }
  }

  return stitched;
}

export async function readWhisperJsonFile(path: string) {
  const json = await readFile(path);
  return whisperJsonSchema.parse(JSON.parse(json.toString()));
}

export function whisperJsonToVtt(transcript: StitchedTranscript) {
  if (transcript.segments.length === 0) {
    return 'WEBVTT';
  }

  return stringifySync(
    transcript.segments.map((data) => ({
      type: 'cue',
      data: { text: data.text, start: data.start * 1000, end: data.end * 1000 },
    })),
    { format: 'WebVTT' },
  );
}
