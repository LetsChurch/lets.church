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
  formatBibleRefShort,
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

// One place a reference is cited: where to seek, the surrounding text,
// and which specific reference within the group was cited (a group may
// span e.g. Proverbs 3:5-7, but a given occurrence might only cite 3:6).
export type ScriptureOccurrence = {
  seconds: number;
  excerpt: ScriptureExcerpt;
  // Short form (no book name) of the specific reference for this occurrence.
  // Equals the group ref's short form when the group has one underlying entry.
  ref: string;
  url: string;
};

// A canonically-ordered scripture-index row. When `entryCount` > 1, the
// `ref` is a synthesized union range covering all merged citations (e.g.
// "Proverbs 3:5-7" absorbing 3:5, 3:6, 3:7) and each occurrence carries
// its own narrower `ref` for display next to the timestamp. When
// `entryCount` === 1 the group is a passthrough — the heading and the
// single underlying citation are the same.
export type ScriptureIndexGroup = {
  key: string;
  ref: string;
  url: string;
  meta: BibleMetadata;
  occurrences: Array<ScriptureOccurrence>;
  entryCount: number;
};

type ScriptureEntry = {
  key: string;
  ref: string;
  url: string;
  meta: BibleMetadata;
  occurrences: Array<ScriptureOccurrence>;
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
// a back-of-the-book scripture index. Entries that overlap or are
// verse-adjacent within the same single chapter (e.g. 3:5-7 with 3:5,
// 3:6, 3:7) collapse into one group with a synthesized union heading;
// each occurrence keeps its specific reference for display. Returns []
// when there are no paragraphs or no scripture annotations.
export function buildScriptureIndex(
  paragraphs: ReadonlyArray<TranscriptParagraph> | null | undefined,
): Array<ScriptureIndexGroup> {
  if (!paragraphs || paragraphs.length === 0) return [];

  const byKey = new Map<string, ScriptureEntry>();

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
        ref: formatBibleRefShort(meta),
        url,
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
  entries.sort((a, b) => {
    const bookDelta = bibleBookOrder(a.meta.book) - bibleBookOrder(b.meta.book);
    if (bookDelta !== 0) return bookDelta;
    const chapterDelta = (a.meta.chapter ?? 0) - (b.meta.chapter ?? 0);
    if (chapterDelta !== 0) return chapterDelta;
    const verseDelta = (a.meta.verse ?? 0) - (b.meta.verse ?? 0);
    if (verseDelta !== 0) return verseDelta;
    // Longer ranges first so they anchor the group's heading. Encode
    // (endChapter, endVerse) into one comparable number so cross-chapter
    // ranges still sort wider-first against same-start singletons.
    const aEnd =
      (a.meta.endChapter ?? a.meta.chapter ?? 0) * 10000 +
      (a.meta.endVerse ?? a.meta.verse ?? 0);
    const bEnd =
      (b.meta.endChapter ?? b.meta.chapter ?? 0) * 10000 +
      (b.meta.endVerse ?? b.meta.verse ?? 0);
    return bEnd - aEnd;
  });

  return groupEntries(entries);
}

// A meta is "single-chapter, verse-anchored" iff it cites at least one
// specific verse and the range stays within one chapter. Only these can
// participate in verse-overlap/adjacency grouping; book- or chapter-only
// citations and cross-chapter ranges stay on their own.
function isSingleChapterVerse(meta: BibleMetadata): boolean {
  return (
    meta.chapter != null &&
    meta.verse != null &&
    (meta.endChapter == null || meta.endChapter === meta.chapter)
  );
}

function unionMeta(a: BibleMetadata, b: BibleMetadata): BibleMetadata {
  // Caller guarantees both are single-chapter, same book + chapter.
  const aStart = a.verse ?? 0;
  const bStart = b.verse ?? 0;
  const aEnd = a.endVerse ?? aStart;
  const bEnd = b.endVerse ?? bStart;
  const start = Math.min(aStart, bStart);
  const end = Math.max(aEnd, bEnd);
  return {
    ...a,
    verse: start,
    endVerse: end > start ? end : null,
    endChapter: null,
  };
}

function groupEntries(
  entries: Array<ScriptureEntry>,
): Array<ScriptureIndexGroup> {
  const groups: Array<ScriptureIndexGroup> = [];
  let current: {
    meta: BibleMetadata;
    occurrences: Array<ScriptureOccurrence>;
    entryCount: number;
  } | null = null;

  const flush = () => {
    if (!current) return;
    current.occurrences.sort((a, b) => a.seconds - b.seconds);
    const url = buildBibleHubUrl(current.meta);
    if (url) {
      groups.push({
        key: bibleKey(current.meta),
        ref: formatBibleRef(current.meta),
        url,
        meta: current.meta,
        occurrences: current.occurrences,
        entryCount: current.entryCount,
      });
    }
    current = null;
  };

  for (const entry of entries) {
    if (
      current &&
      isSingleChapterVerse(current.meta) &&
      isSingleChapterVerse(entry.meta) &&
      current.meta.book === entry.meta.book &&
      current.meta.chapter === entry.meta.chapter &&
      // Overlap or adjacent (gap of zero): start ≤ current end + 1.
      (entry.meta.verse ?? 0) <=
        (current.meta.endVerse ?? current.meta.verse ?? 0) + 1
    ) {
      current.meta = unionMeta(current.meta, entry.meta);
      current.occurrences.push(...entry.occurrences);
      current.entryCount += 1;
      continue;
    }
    flush();
    current = {
      meta: entry.meta,
      occurrences: [...entry.occurrences],
      entryCount: 1,
    };
  }
  flush();
  return groups;
}
