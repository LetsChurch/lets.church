// Ingests the King James Version (1769, with Strong's numbers + morphology) into
// the lets_bible DB as the `KJV` translation, populating:
//   - bible_book   reading-ready blocks (per book, JSONB) — prose, verse-addressed
//   - bible_verse  normalized, ref-addressed verse text (+ global ordinal)
//   - bible_token  word tokens (surface + Strong's + morphology)
//   - bible_cross_reference  projected from the reference translation (the KJV+
//     source has none) so OT-quotation source links + cross-refs work
// Idempotent: re-running replaces KJV's rows.
//
// Source-text overlays (divine name / OT quotation / divine-name notes) are NOT
// baked here — they're applied at render time from the committed translation-
// independent index seed/overlays/index.json (see lib/apply-overlays.ts), so the
// KJV's tokens/reading blocks stay overlay-pure. Red-letter (words of Jesus) IS baked,
// projected from MSB's native `wj` via Strong's-sequence alignment (MSB's
// Byzantine text is textually closest to the TR-based KJV; override its USX dir
// with OVERLAY_USX_DIR).
//
// Source: the e-Sword "KJV+" module as a single JSON file (public-domain text +
// public-domain Strong's), committed under seed/kjv/ so this DB seed and the
// static reading/search asset build (build-flex-index.ts) read the identical
// source. Override the path with the KJV_SOURCE env var.
//
// KJV uses its own 1769 versification ('kjv'), which differs from the 'org' scheme
// BSB/MSB use in a handful of places (Psalm titles counted in verse 1, 3 John
// length, Malachi/Joel chapter splits, etc.). Ref-anchored cross-translation
// features (Compare, highlights, notes) align by ref and so may diverge from
// BSB/MSB at exactly those verses — an accepted limitation of adding the KJV.
//
// Run in the lets-bible container: `just lets-bible-seed-kjv`

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import {
  type KjvParsedBook,
  loadKjvSource,
  parseKjvStrongs,
} from '../server/kjv-strongs/parse';
import {
  buildOverlayReference,
  loadCrossRefs,
  referenceUsxDir,
} from '../server/overlays';
import {
  bibleBook,
  bibleCrossReference,
  bibleToken,
  bibleTranslation,
  bibleVerse,
  db,
} from '.';

const here = dirname(fileURLToPath(import.meta.url));
const SEED_DIR = join(here, '..', '..', 'seed');
const REFERENCE_USX_DIR =
  process.env.OVERLAY_USX_DIR ?? referenceUsxDir(SEED_DIR);

const translation = {
  id: 'KJV',
  name: 'King James Version',
  language: 'en',
  direction: 'ltr',
  versification: 'kjv',
  isDefault: false,
};

async function insertChunked<T>(
  // biome-ignore lint/suspicious/noExplicitAny: drizzle table types vary per call
  table: any,
  rows: T[],
  chunkSize: number,
): Promise<void> {
  for (let i = 0; i < rows.length; i += chunkSize) {
    await db.insert(table).values(rows.slice(i, i + chunkSize));
  }
}

async function seedBook(book: KjvParsedBook, startOrdinal: number) {
  const { book: canon, chapters, tokens } = book;
  const chapterKeys = Object.keys(chapters)
    .map(Number)
    .sort((a, b) => a - b);

  await db.insert(bibleBook).values({
    translationId: translation.id,
    usfm: canon.code,
    slug: canon.slug,
    name: canon.name,
    ordinal: canon.ordinal,
    chapterCount: chapterKeys.length,
    content: { chapters },
  });

  // Normalized verses, in canonical order with a running global ordinal.
  let ordinal = startOrdinal;
  const verseRows = [];
  for (const ch of chapterKeys) {
    const verses = chapters[String(ch)].verses;
    for (const v of Object.keys(verses)
      .map(Number)
      .sort((a, b) => a - b)) {
      ordinal += 1;
      verseRows.push({
        translationId: translation.id,
        book: canon.code,
        chapter: ch,
        verse: v,
        ref: `${canon.code}.${ch}.${v}`,
        ordinal,
        text: verses[String(v)],
      });
    }
  }
  await insertChunked(bibleVerse, verseRows, 2000);

  const tokenRows = tokens.map((tk) => ({
    translationId: translation.id,
    book: canon.code,
    chapter: tk.chapter,
    verse: tk.verse,
    position: tk.position,
    surface: tk.surface,
    strong: tk.strong ?? null,
    morph: tk.morph ?? null,
    wordsOfJesus: !!tk.wordsOfJesus,
    otQuote: !!tk.otQuote,
    divineName: !!tk.divineName,
  }));
  await insertChunked(bibleToken, tokenRows, 1000);

  const overlay = {
    red: tokenRows.filter((t) => t.wordsOfJesus).length,
    otQuote: tokenRows.filter((t) => t.otQuote).length,
    divineName: tokenRows.filter((t) => t.divineName).length,
  };
  console.log(
    `${canon.code.padEnd(4)} ${canon.name.padEnd(16)} ${String(chapterKeys.length).padStart(3)} ch  ${String(verseRows.length).padStart(4)} vv  ${String(tokenRows.length).padStart(6)} tok  ${String(overlay.red).padStart(5)} red ${String(overlay.otQuote).padStart(5)} qt ${String(overlay.divineName).padStart(5)} nd`,
  );
  return {
    ordinal,
    verses: verseRows.length,
    tokens: tokenRows.length,
    ...overlay,
  };
}

async function main() {
  // `overlays` carries only red-letter (the source-text overlays are applied at
  // render time from the index, not baked here).
  const overlays = buildOverlayReference(REFERENCE_USX_DIR);
  const books = parseKjvStrongs(
    loadKjvSource(process.env.KJV_SOURCE),
    overlays,
  );

  await db
    .insert(bibleTranslation)
    .values(translation)
    .onConflictDoUpdate({ target: bibleTranslation.id, set: translation });

  // Replace this translation's data so re-seeding is clean.
  for (const table of [
    bibleCrossReference,
    bibleToken,
    bibleVerse,
    bibleBook,
  ]) {
    await db.delete(table).where(eq(table.translationId, translation.id));
  }

  let ordinal = 0;
  let verseCount = 0;
  let tokenCount = 0;
  let redCount = 0;
  for (const book of books) {
    const r = await seedBook(book, ordinal);
    ordinal = r.ordinal;
    verseCount += r.verses;
    tokenCount += r.tokens;
    redCount += r.red;
  }

  // Cross-references projected from the reference translation MSB (KJV has none of
  // its own) so OT-quotation source links + the cross-reference feature work — from
  // the committed artifact, since the reference USX is now overlay-pure.
  const xrefRows = loadCrossRefs('MSB').map((x) => ({
    translationId: translation.id,
    fromBook: x.fromBook,
    fromChapter: x.fromChapter,
    fromVerse: x.fromVerse,
    toBook: x.toBook,
    toChapter: x.toChapter,
    toVerse: x.toVerse ?? null,
  }));
  await insertChunked(bibleCrossReference, xrefRows, 2000);

  console.log(
    `\nSeeded ${translation.id}: ${books.length} books, ${verseCount} verses, ${tokenCount} tokens, ${xrefRows.length} cross-refs, ${redCount} red-letter (from ${REFERENCE_USX_DIR}).\n` +
      `Source-text overlays applied at render time from the index (not baked).`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
