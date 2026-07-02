// Pure BIBLE-annotation matching (no DB / server-only imports), so it's safe to
// import from a shared route module without pulling pg into the client bundle.

export type BibleAnnotationMeta = {
  book?: unknown;
  chapter?: unknown;
  verse?: unknown;
  endChapter?: unknown;
  endVerse?: unknown;
};

/**
 * Does a BIBLE annotation's metadata cover (book, chapter, verse)? Mirrors the
 * token-expansion semantics in @letschurch/temporal `util/bible-refs`
 * (`bibleRefsFromMetadata`) so a matched paragraph lines up with the same
 * occurrences the `bibleRefs` facet indexed. Book ids are OSIS on both sides.
 */
export function annotationCoversVerse(
  meta: BibleAnnotationMeta,
  book: string,
  chapter: number,
  verse: number,
): boolean {
  if (meta.book !== book) return false;
  const c =
    typeof meta.chapter === 'number' ? meta.chapter : Number(meta.chapter);
  const v = typeof meta.verse === 'number' ? meta.verse : Number(meta.verse);
  if (!Number.isInteger(c) || !Number.isInteger(v)) return false;
  const ec = meta.endChapter == null ? null : Number(meta.endChapter);
  const ev = meta.endVerse == null ? null : Number(meta.endVerse);
  // Single-chapter range (no end chapter, or it equals the start): enumerate.
  if (ev != null && (ec == null || ec === c)) {
    return chapter === c && verse >= v && verse <= ev;
  }
  // Cross-chapter range: only the two boundary verses were indexed.
  if (ec != null && ec !== c) {
    return (
      (chapter === c && verse === v) ||
      (ev != null && chapter === ec && verse === ev)
    );
  }
  // Single verse.
  return chapter === c && verse === v;
}
