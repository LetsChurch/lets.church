import { z } from 'zod';

// Doc-level Bible-verse facet tokens for lc_media_v1. A BIBLE annotation's
// metadata ({ book (OSIS), chapter?, verse?, endChapter?, endVerse? }) is
// expanded into one keyword token per cited verse, formatted
// `Book.Chapter.Verse` (e.g. `John.3.16`). OSIS book ids contain no dots and
// chapter/verse are positive integers, so the token round-trips by splitting on
// '.'. The web search UI reconstructs the human label ("John 3:16") via
// util/bible-url's `parseVerseRef`/`formatVerseRef`.
//
// Only verse-anchored citations produce tokens — book-only ("the gospel of
// John") and chapter-only ("Romans 8") references carry no specific verse, so
// they can't populate a verse-level facet and are skipped.

// Mirrors the BIBLE half of annotate-transcript's `bibleMetadataSchema`, parsed
// defensively here so a malformed annotation row degrades to "no tokens"
// instead of throwing during indexing.
const metaSchema = z.object({
  book: z.string().min(1),
  chapter: z.coerce.number().int().positive().optional().nullable(),
  verse: z.coerce.number().int().positive().optional().nullable(),
  endChapter: z.coerce.number().int().positive().optional().nullable(),
  endVerse: z.coerce.number().int().positive().optional().nullable(),
});

// Guard against a pathological single-chapter range (e.g. a bad `endVerse`)
// fanning out into thousands of tokens — the longest chapter (Psalm 119) has
// 176 verses, so anything well beyond that is malformed.
const MAX_RANGE_VERSES = 200;

export function bibleRefsFromMetadata(
  metadata: Record<string, unknown>,
): string[] {
  const parsed = metaSchema.safeParse(metadata);
  if (!parsed.success) return [];
  const { book, chapter, verse, endChapter, endVerse } = parsed.data;
  // Need a specific verse to place it on the verse-level facet.
  if (chapter == null || verse == null) return [];

  const token = (c: number, v: number) => `${book}.${c}.${v}`;

  // Single-chapter range (no end chapter, or it equals the start chapter):
  // enumerate each verse so a citation of John 3:14-18 matches a facet pick of
  // any verse within it.
  if (endVerse != null && (endChapter == null || endChapter === chapter)) {
    const end = Math.min(endVerse, verse + MAX_RANGE_VERSES - 1);
    const refs: string[] = [];
    for (let v = verse; v <= end; v++) refs.push(token(chapter, v));
    return refs;
  }

  // Cross-chapter range: with no versification table we can't enumerate the
  // intermediate verses, so index just the two boundary verses.
  if (endChapter != null && endChapter !== chapter) {
    const refs = [token(chapter, verse)];
    if (endVerse != null) refs.push(token(endChapter, endVerse));
    return refs;
  }

  // Single verse.
  return [token(chapter, verse)];
}

// Doc-level OSIS book id for a BIBLE annotation ("Rom", "John", "1Cor"). Unlike
// the verse tokens this also covers book-only and chapter-only citations (no
// specific verse), since the book is always known. Powers the book facet +
// filter. Returns null when the metadata doesn't parse.
export function bibleBookFromMetadata(
  metadata: Record<string, unknown>,
): string | null {
  const parsed = metaSchema.safeParse(metadata);
  if (!parsed.success) return null;
  const book = parsed.data.book.trim();
  return book.length > 0 ? book : null;
}
