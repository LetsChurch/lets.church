// Shared list + types + filesystem location for the LLM seed snapshots.
//
// The snapshot JSONs live under `seed-data/llm/${id}.json` (git-LFS-tracked,
// not S3-synced — they're consumed directly off disk by `dev.ts`, available
// inside the web container via the `./seed-data:/seed-data` bind mount). Used
// by:
//   - `dev.ts` (reads the JSONs and direct-inserts during `just seed-db`)
//   - `dump-llm-seed-data.ts` (writes them by dumping the current dev DB)
//
// Each id in this list must have a matching `${id}.json` file in
// `LLM_SEED_DATA_DIR`. Refresh after prompt/transcript changes with
// `just dump-llm-seed-data` against a fresh live-pipeline seed.

// Path to the snapshot directory inside the web container (via the
// docker-compose `./seed-data:/seed-data` bind mount). Both the seed and
// the dumper read/write here.
export const LLM_SEED_DATA_DIR = '/seed-data/llm';

export const LLM_SEEDED_UPLOAD_IDS = [
  // The Dorean Principle audiobook (chapters + frontmatter + appendices)
  '00000000-0000-4000-8000-000000000000', // Foreword (large-v3)
  '00000000-0000-4000-8000-000000000001', // Introduction
  '00000000-0000-4000-8000-000000000002', // Chapter 1
  '00000000-0000-4000-8000-000000000003', // Chapter 2
  '00000000-0000-4000-8000-000000000004', // Chapter 3
  '00000000-0000-4000-8000-000000000005', // Chapter 4
  '00000000-0000-4000-8000-000000000006', // Chapter 5
  '00000000-0000-4000-8000-000000000007', // Chapter 6
  '00000000-0000-4000-8000-000000000008', // Chapter 7
  '00000000-0000-4000-8000-000000000009', // Chapter 8
  '00000000-0000-4000-8000-00000000000a', // Chapter 9
  '00000000-0000-4000-8000-00000000000b', // Chapter 10
  '00000000-0000-4000-8000-00000000000c', // Chapter 11
  '00000000-0000-4000-8000-00000000000d', // Chapter 12
  '00000000-0000-4000-8000-00000000000e', // Chapter 13
  '00000000-0000-4000-8000-00000000000f', // Chapter 14
  '00000000-0000-4000-8000-000000000010', // Conclusion
  '00000000-0000-4000-8000-000000000011', // Appendix A
  '00000000-0000-4000-8000-000000000012', // Appendix B
  '00000000-0000-4000-8000-000000000013', // Appendix C
  // The Dorean Principle ancillary videos + Selling Jesus pitch series
  '00000000-0000-4000-8000-100000000000', // The Dorean Principle in Five Minutes
  '00000000-0000-4000-8000-100000000001', // Prayer Pitch Meeting - 1
  '00000000-0000-4000-8000-100000000002', // Christian Books Pitch Meeting - 2
  '00000000-0000-4000-8000-100000000003', // Foreign Missions Pitch Meeting - 3
  '00000000-0000-4000-8000-100000000004', // Copyright Pitch Meeting - 4
  '00000000-0000-4000-8000-100000000005', // Biblical Counseling Pitch Meeting - 5
  '00000000-0000-4000-8000-100000000006', // The Lord's Supper Pitch Meeting - 6
] as const;

// JSON shape that lives in `${uploadRecordId}.json`. Mirrors the columns the
// seed needs to populate on upload_record + transcript_paragraph so the
// snapshot path is a 1:1 reverse of a single live-pipeline seed run.
export type LlmSeedSnapshot = {
  uploadRecordId: string;
  summary: string;
  searchSummary: string;
  summaryEmbedding: number[];
  searchSummaryEmbedding: number[];
  summarizedAt: string; // ISO timestamp
  paragraphs: Array<{
    order: number;
    start: number;
    end: number;
    speaker: string | null;
    speakerEmbedding: number[] | null;
    text: string;
    words: Array<{ word: string; start: number; end: number }>;
    embedding: number[] | null;
    // Automatic annotations produced by the annotate-transcript activity:
    // OUTLINE (block-level headings, no offsets — title in metadata),
    // BIBLE + KEYWORD (inline, half-open [startWord, endWord) ranges into
    // the `words` array above, debug-only `rawSpan` carries the LLM's
    // verbatim text). Empty array for paragraphs the model didn't annotate.
    annotations: Array<{
      kind: 'OUTLINE' | 'BIBLE' | 'KEYWORD';
      startWord: number | null;
      endWord: number | null;
      rawSpan: string | null;
      metadata: Record<string, unknown>;
    }>;
  }>;
};
