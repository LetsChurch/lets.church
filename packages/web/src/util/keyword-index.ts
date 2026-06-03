import {
  stripWordPunctuation,
  type TranscriptParagraph,
} from '@/components/transcript-paragraphs';

// One detected keyword/phrase surfaced by the index.
export type KeywordIndexEntry = {
  // Lowercased text, used both to dedupe and as a stable React key.
  key: string;
  // Display + search text, in the casing of its first occurrence.
  text: string;
};

// Aggregate all KEYWORD annotations across the transcript into a deduped,
// alphabetically-ordered list of phrases — mirrors the per-paragraph
// KEYWORD pills in transcript-paragraphs.tsx (same punctuation stripping,
// same lowercase dedup key) so the index and inline highlights agree.
// Returns [] when there are no paragraphs or no keyword annotations.
export function buildKeywordIndex(
  paragraphs: ReadonlyArray<TranscriptParagraph> | null | undefined,
): Array<KeywordIndexEntry> {
  if (!paragraphs || paragraphs.length === 0) return [];

  const byKey = new Map<string, KeywordIndexEntry>();

  for (const paragraph of paragraphs) {
    for (const annotation of paragraph.annotations) {
      if (
        annotation.kind !== 'KEYWORD' ||
        annotation.startWord == null ||
        annotation.endWord == null
      ) {
        continue;
      }
      const lo = Math.max(
        0,
        Math.min(annotation.startWord, paragraph.words.length),
      );
      const hi = Math.max(
        lo,
        Math.min(annotation.endWord, paragraph.words.length),
      );
      const text = paragraph.words
        .slice(lo, hi)
        .map((w) => stripWordPunctuation(w.word))
        .filter((w) => w.length > 0)
        .join(' ');
      if (text.length === 0) continue;

      const key = text.toLowerCase();
      if (!byKey.has(key)) byKey.set(key, { key, text });
    }
  }

  return Array.from(byKey.values()).sort((a, b) => a.key.localeCompare(b.key));
}
