// Extract THOUGHT UNITS — the translators' own paragraphs (reading blocks) — as
// multi-verse passages to embed for the verse-finder's passage-recall lane.
//
// Why paragraphs and not fixed N-verse windows: verse divisions (Stephanus 1551)
// are arbitrary relative to meaning and routinely split a single thought, but the
// translators already grouped verses into thought-paragraphs (a `prose`/`poetry`
// block). So the block IS the thought unit — better than a mechanical sliding
// window, which would just make a bigger arbitrary chunk. A block with a single
// verse is dropped (already covered by the verse index); multi-verse blocks
// become passages. KJV is skipped by the caller (its source has no paragraphing —
// one prose block per chapter — so a "paragraph" there would be a whole-chapter
// blob); a KJV reader's remembered thought still matches the BSB/MSB/WEB paragraph
// embedding by meaning (retrieval is cross-translation) and cites the anchor verse.

import { eq } from 'drizzle-orm';

import type { Block } from '../components/passage/types';
import { type BookContent, bibleBook, bibleVerse, db } from '../db';
import { bookBySlug } from '../lib/canon';

// Translations with real translator paragraphing. KJV omitted (prose-only source
// → chapter-sized blocks). Callers can override, but this is the sensible set.
export const PASSAGE_TRANSLATIONS = ['BSB', 'MSB', 'WEB'];

export type Passage = {
  translationId: string;
  book: string; // USFM, e.g. GAL
  slug: string; // canon slug, e.g. galatians
  name: string; // display name, e.g. Galatians
  testament: 'OT' | 'NT' | null;
  chapter: number;
  startVerse: number;
  endVerse: number;
  ref: string; // `${book}.${chapter}.${startVerse}-${endVerse}`, e.g. GAL.5.22-23
  ordinal: number; // global canonical order of the passage's first verse
  text: string; // concatenated verse text of the whole paragraph
};

// Distinct, ascending verse numbers a reading block spans. Only genre blocks
// that carry verses count; headings/crossrefs/selah/chip/acrostic carry none.
function blockVerseNumbers(block: Block): number[] {
  const nums = new Set<number>();
  if (block.kind === 'prose' || block.kind === 'descriptive') {
    for (const v of block.verses) {
      const n = v.verse ?? v.num;
      if (typeof n === 'number') nums.add(n);
    }
  } else if (block.kind === 'poetry') {
    for (const l of block.lines) {
      const n = l.verse ?? l.num;
      if (typeof n === 'number') nums.add(n);
    }
  } else if (block.kind === 'focusVerse') {
    const n = block.verse.verse ?? block.verse.num;
    if (typeof n === 'number') nums.add(n);
  }
  return [...nums].sort((a, b) => a - b);
}

// Build every multi-verse passage for the given translations, deterministically
// ordered (by translation, then the global ordinal of the first verse) so the
// committed embedding artifact's byte layout is stable across runs.
export async function extractPassages(
  translationIds: string[] = PASSAGE_TRANSLATIONS,
): Promise<Passage[]> {
  const out: Passage[] = [];
  for (const tid of translationIds) {
    // Verse text + global ordinal, keyed by USFM `${book}.${chapter}.${verse}`
    // (bible_verse.book is the USFM code; reading blocks are addressed by slug).
    const verses = await db
      .select({
        book: bibleVerse.book,
        chapter: bibleVerse.chapter,
        verse: bibleVerse.verse,
        text: bibleVerse.text,
        ordinal: bibleVerse.ordinal,
      })
      .from(bibleVerse)
      .where(eq(bibleVerse.translationId, tid));
    if (verses.length === 0) {
      continue;
    }
    const vmap = new Map<string, { text: string; ordinal: number }>();
    for (const v of verses) {
      vmap.set(`${v.book}.${v.chapter}.${v.verse}`, {
        text: v.text,
        ordinal: v.ordinal,
      });
    }

    const books = await db
      .select({ slug: bibleBook.slug, content: bibleBook.content })
      .from(bibleBook)
      .where(eq(bibleBook.translationId, tid));

    for (const bk of books) {
      const canon = bookBySlug(bk.slug);
      const usfm = canon?.code ?? bk.slug.toUpperCase();
      const name = canon?.name ?? bk.slug;
      const testament = canon?.testament ?? null;
      const chapters = (bk.content as BookContent).chapters;
      for (const [chStr, ch] of Object.entries(chapters)) {
        const chapter = Number(chStr);
        for (const block of ch.blocks) {
          const verseNums = blockVerseNumbers(block);
          if (verseNums.length < 2) {
            continue; // single-verse thought → already covered by the verse index
          }
          const parts: string[] = [];
          let ordinal = Number.POSITIVE_INFINITY;
          for (const vn of verseNums) {
            const rec = vmap.get(`${usfm}.${chapter}.${vn}`);
            if (rec) {
              const t = rec.text.trim();
              if (t) parts.push(t);
              ordinal = Math.min(ordinal, rec.ordinal);
            }
          }
          const text = parts.join(' ').trim();
          if (!text || !Number.isFinite(ordinal)) {
            continue;
          }
          const startVerse = verseNums[0]!;
          const endVerse = verseNums[verseNums.length - 1]!;
          out.push({
            translationId: tid,
            book: usfm,
            slug: bk.slug,
            name,
            testament,
            chapter,
            startVerse,
            endVerse,
            ref: `${usfm}.${chapter}.${startVerse}-${endVerse}`,
            ordinal,
            text,
          });
        }
      }
    }
  }

  out.sort((a, b) =>
    a.translationId === b.translationId
      ? a.ordinal - b.ordinal
      : a.translationId < b.translationId
        ? -1
        : 1,
  );
  return out;
}
