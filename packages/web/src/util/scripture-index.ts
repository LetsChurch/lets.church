import {
  type TranscriptAnnotation,
  type TranscriptParagraph,
  wordsJoinWithoutSpace,
} from '@/components/transcript-paragraphs';
import {
  type BibleMetadata,
  bibleBookOrder,
  buildBibleHubUrl,
  formatBibleRef,
  parseBibleMetadata,
} from '@/util/bible-url';

// Words of surrounding transcript to show on each side of the cited span
// in an occurrence excerpt. Wide enough to convey context, short enough to
// keep the index scannable.
const EXCERPT_CONTEXT_WORDS = 8;

// A snippet of transcript around one citation, split so the UI can
// emphasize the actual cited words. `before`/`after` already include
// leading/trailing ellipses when the excerpt is clipped from a longer
// paragraph; `span` is the cited text (empty when the annotation lacks a
// word range).
export type ScriptureExcerpt = {
  before: string;
  span: string;
  after: string;
};

// One place a reference is cited: where to seek, and the surrounding text.
export type ScriptureOccurrence = {
  seconds: number;
  excerpt: ScriptureExcerpt;
};

export type ScriptureIndexEntry = {
  // Canonical (book, chapter, verse, endChapter, endVerse) key — matches
  // the per-paragraph `bibleKey` in transcript-paragraphs.tsx so the same
  // reference cited across paragraphs collapses to one entry.
  key: string;
  ref: string;
  url: string;
  occurrences: Array<ScriptureOccurrence>;
  meta: BibleMetadata;
};

function bibleKey(meta: BibleMetadata): string {
  return `BIBLE:${meta.book}:${meta.chapter ?? ''}:${meta.verse ?? ''}:${meta.endChapter ?? ''}:${meta.endVerse ?? ''}`;
}

// Build a context excerpt around a BIBLE annotation's word span. Falls
// back to the paragraph's opening words when the annotation has no word
// range (BIBLE rows normally do, but degrade gracefully if one doesn't).
function buildExcerpt(
  paragraph: TranscriptParagraph,
  annotation: TranscriptAnnotation,
): ScriptureExcerpt {
  const words = paragraph.words;
  // Join words with spaces, except where faster-whisper split a hyphenated
  // word into two tokens — keep those glued (see wordsJoinWithoutSpace).
  const join = (lo: number, hi: number) => {
    let out = '';
    for (let i = lo; i < hi; i++) {
      const word = words[i]?.word ?? '';
      const prev = words[i - 1]?.word;
      if (i > lo && !(prev && wordsJoinWithoutSpace(prev, word))) out += ' ';
      out += word;
    }
    return out.trim();
  };

  if (annotation.startWord == null || annotation.endWord == null) {
    const hi = Math.min(words.length, EXCERPT_CONTEXT_WORDS * 2);
    const after = join(0, hi);
    return {
      before: '',
      span: '',
      after: hi < words.length ? `${after} …` : after,
    };
  }

  const start = Math.max(0, Math.min(annotation.startWord, words.length));
  const end = Math.max(start, Math.min(annotation.endWord, words.length));
  const lo = Math.max(0, start - EXCERPT_CONTEXT_WORDS);
  const hi = Math.min(words.length, end + EXCERPT_CONTEXT_WORDS);

  const lead = join(lo, start);
  const span = join(start, end);
  const trail = join(end, hi);

  return {
    before: `${lo > 0 ? '… ' : ''}${lead}${lead ? ' ' : ''}`,
    span,
    after: `${trail ? ' ' : ''}${trail}${hi < words.length ? ' …' : ''}`,
  };
}

// Aggregate all BIBLE annotations across the transcript into a deduped,
// canonically-ordered (Genesis → Revelation, then chapter/verse) list —
// a back-of-the-book scripture index. Each entry records every place the
// reference is cited (timestamp + surrounding excerpt) so the UI can offer
// seek chips with context. Returns [] when there are no paragraphs or no
// scripture annotations.
export function buildScriptureIndex(
  paragraphs: ReadonlyArray<TranscriptParagraph> | null | undefined,
): Array<ScriptureIndexEntry> {
  if (!paragraphs || paragraphs.length === 0) return [];

  const byKey = new Map<string, ScriptureIndexEntry>();

  for (const paragraph of paragraphs) {
    for (const annotation of paragraph.annotations) {
      if (annotation.kind !== 'BIBLE') continue;
      const meta = parseBibleMetadata(annotation.metadata);
      if (!meta) continue;
      const url = buildBibleHubUrl(meta);
      if (!url) continue;

      const key = bibleKey(meta);
      const occurrence: ScriptureOccurrence = {
        seconds: paragraph.start,
        excerpt: buildExcerpt(paragraph, annotation),
      };
      const existing = byKey.get(key);
      if (existing) {
        // One entry per (reference, timestamp): the same verse cited
        // twice in a single paragraph shows once.
        if (!existing.occurrences.some((o) => o.seconds === paragraph.start)) {
          existing.occurrences.push(occurrence);
        }
      } else {
        byKey.set(key, {
          key,
          ref: formatBibleRef(meta),
          url,
          occurrences: [occurrence],
          meta,
        });
      }
    }
  }

  const entries = Array.from(byKey.values());
  for (const entry of entries) {
    entry.occurrences.sort((a, b) => a.seconds - b.seconds);
  }

  entries.sort((a, b) => {
    const bookDelta = bibleBookOrder(a.meta.book) - bibleBookOrder(b.meta.book);
    if (bookDelta !== 0) return bookDelta;
    const chapterDelta = (a.meta.chapter ?? 0) - (b.meta.chapter ?? 0);
    if (chapterDelta !== 0) return chapterDelta;
    return (a.meta.verse ?? 0) - (b.meta.verse ?? 0);
  });

  return entries;
}
