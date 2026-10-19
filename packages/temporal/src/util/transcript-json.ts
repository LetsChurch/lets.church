import { z } from 'zod';

import { speakerEmbeddingSchema } from './speaker-embedding';

// camelCase contract emitted by the Python transcribe worker
// (services/transcribe → {uploadRecordId}/transcript.json). Sentence-level
// segments with paragraph markers + per-word timings (seconds), plus per-speaker
// embeddings. The paragraph-storage activity is the sole consumer.
export const transcriptJsonSchema = z.object({
  language: z.string(),
  duration: z.number().nullable().optional(),
  text: z.string().optional(),
  speakerEmbeddings: z.record(z.string(), speakerEmbeddingSchema).optional(),
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
