import { Annotation, db, TranscriptParagraph } from '@letschurch/db';
import type { MediaSegment } from '@letschurch/opensearch';
import { and, eq, inArray } from 'drizzle-orm';

import {
  annotationCoversVerse,
  type BibleAnnotationMeta,
} from '@/util/bible-annotations';
import { parseVerseRef } from '@/util/bible-url';

// Resolving a Bible verse to the transcript paragraphs that teach it — the
// join OpenSearch can't do (its `bibleRefs` facet is a doc-level rollup with no
// per-paragraph position). BIBLE annotations live in Postgres, keyed to a
// paragraph + word range; the paragraph carries the timestamp. Shared by the
// internal media-for-verse endpoint (for deep-link timestamps) and the search
// procedure (to surface the matching paragraphs on a facet-only browse).

/**
 * For a set of uploads, the transcript paragraphs whose BIBLE annotation covers
 * any of the given OSIS verse tokens ("John.3.16"), grouped by upload id
 * (chronological, deduped). Times are milliseconds — the `MediaSegment` /
 * search-UI contract. Returns an empty map when there's nothing to resolve.
 */
export async function getVerseParagraphsByUpload(
  uploadIds: string[],
  verseTokens: string[],
): Promise<Map<string, MediaSegment[]>> {
  const out = new Map<string, MediaSegment[]>();
  if (uploadIds.length === 0 || verseTokens.length === 0) return out;

  // Parse the facet tokens to {book, chapter, verse}; skip malformed ones.
  const verses = verseTokens
    .map((t) => parseVerseRef(t))
    .filter((v): v is NonNullable<typeof v> => v != null);
  if (verses.length === 0) return out;

  const rows = await db
    .select({
      uploadRecordId: TranscriptParagraph.uploadRecordId,
      start: TranscriptParagraph.start,
      end: TranscriptParagraph.end,
      text: TranscriptParagraph.text,
      metadata: Annotation.metadata,
    })
    .from(TranscriptParagraph)
    .innerJoin(Annotation, eq(Annotation.paragraphId, TranscriptParagraph.id))
    .where(
      and(
        inArray(TranscriptParagraph.uploadRecordId, uploadIds),
        eq(Annotation.kind, 'BIBLE'),
      ),
    );

  // Dedup per upload by paragraph start (a paragraph can carry several BIBLE
  // annotations, and two facet verses can hit the same paragraph).
  const seen = new Map<string, Set<number>>();
  for (const row of rows) {
    const matches = verses.some((v) =>
      annotationCoversVerse(
        row.metadata as BibleAnnotationMeta,
        v.book,
        v.chapter as number,
        v.verse as number,
      ),
    );
    if (!matches) continue;
    const seenStarts = seen.get(row.uploadRecordId) ?? new Set<number>();
    if (seenStarts.has(row.start)) continue;
    seenStarts.add(row.start);
    seen.set(row.uploadRecordId, seenStarts);
    const list = out.get(row.uploadRecordId) ?? [];
    list.push({
      start: row.start * 1000,
      end: row.end * 1000,
      text: row.text,
    });
    out.set(row.uploadRecordId, list);
  }

  for (const list of out.values()) list.sort((a, b) => a.start - b.start);
  return out;
}
