// Ingests a translation's USX (one file per book, named by USFM code) into the
// lets_bible DB, populating all layers:
//   - bible_book           reading-ready blocks (per book, JSONB)
//   - bible_verse          normalized, ref-addressed verse text (+ global ordinal)
//   - bible_token          word tokens (surface + Strong's + overlay flags)
//   - bible_cross_reference citations parsed from <note style="x">
// Idempotent: re-running replaces that translation's rows.
//
// Defaults to the BSB seed. Override via env to ingest another translation:
//   TRANSLATION_ID=MSB TRANSLATION_NAME="Majority Standard Bible" \
//   TRANSLATION_IS_DEFAULT=false USX_DIR=/abs/path/to/msb/USX_1 \
//   pnpm --filter @letschurch/lets.bible run seed:bible
//
// Run in the lets-bible container: `just bible-seed`
// (or on the host with LETS_BIBLE_DATABASE_URL pointed at the published port).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { CANON } from '../lib/canon';
import { parseUsxBook } from '../server/usx/parse';
import {
  bibleBook,
  bibleCrossReference,
  bibleToken,
  bibleTranslation,
  bibleVerse,
  db,
} from '.';

const here = dirname(fileURLToPath(import.meta.url));

const id = process.env.TRANSLATION_ID ?? 'BSB';
const translation = {
  id,
  name: process.env.TRANSLATION_NAME ?? 'Berean Standard Bible',
  language: process.env.TRANSLATION_LANGUAGE ?? 'en',
  direction: process.env.TRANSLATION_DIRECTION ?? 'ltr',
  versification: process.env.TRANSLATION_VERSIFICATION ?? 'org',
  isDefault:
    (process.env.TRANSLATION_IS_DEFAULT ??
      (id === 'BSB' ? 'true' : 'false')) === 'true',
};
const usxDir =
  process.env.USX_DIR ?? join(here, '..', '..', 'seed', 'bsb', 'USX_1');

// Insert rows in chunks small enough to stay under Postgres' parameter limit.
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

async function main() {
  // When this translation is the default, clear any existing default FIRST so
  // the single-default DB constraint isn't violated mid-upsert.
  if (translation.isDefault) {
    await db.update(bibleTranslation).set({ isDefault: false });
  }
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

  let chapters = 0;
  let ordinal = 0; // global verse index within the translation
  let verseCount = 0;
  let tokenCount = 0;
  let xrefCount = 0;

  for (const book of CANON) {
    const xml = readFileSync(join(usxDir, `${book.code}.usx`), 'utf8');
    const parsed = parseUsxBook(xml);
    const chapterKeys = Object.keys(parsed.chapters)
      .map(Number)
      .sort((a, b) => a - b);
    chapters += chapterKeys.length;

    await db.insert(bibleBook).values({
      translationId: translation.id,
      usfm: book.code,
      slug: book.slug,
      name: book.name,
      ordinal: book.ordinal,
      chapterCount: chapterKeys.length,
      content: { chapters: parsed.chapters },
    });

    // Normalized verses (in canonical order, with a running global ordinal).
    const verseRows = [];
    for (const ch of chapterKeys) {
      const verses = parsed.chapters[String(ch)].verses;
      for (const v of Object.keys(verses)
        .map(Number)
        .sort((a, b) => a - b)) {
        ordinal += 1;
        verseRows.push({
          translationId: translation.id,
          book: book.code,
          chapter: ch,
          verse: v,
          ref: `${book.code}.${ch}.${v}`,
          ordinal,
          text: verses[String(v)],
        });
      }
    }
    await insertChunked(bibleVerse, verseRows, 2000);
    verseCount += verseRows.length;

    // Word tokens.
    const tokenRows = parsed.tokens.map((tk) => ({
      translationId: translation.id,
      book: book.code,
      chapter: tk.chapter,
      verse: tk.verse,
      position: tk.position,
      surface: tk.surface,
      strong: tk.strong ?? null,
      divineName: !!tk.divineName,
      otQuote: !!tk.otQuote,
      wordsOfJesus: !!tk.wordsOfJesus,
    }));
    await insertChunked(bibleToken, tokenRows, 1000);
    tokenCount += tokenRows.length;

    // Cross-references.
    const xrefRows = parsed.crossRefs.map((x) => ({
      translationId: translation.id,
      fromBook: book.code,
      fromChapter: x.fromChapter,
      fromVerse: x.fromVerse,
      toBook: x.toBook,
      toChapter: x.toChapter,
      toVerse: x.toVerse ?? null,
    }));
    await insertChunked(bibleCrossReference, xrefRows, 2000);
    xrefCount += xrefRows.length;

    console.log(
      `${book.code.padEnd(4)} ${book.name.padEnd(16)} ${String(chapterKeys.length).padStart(3)} ch  ${String(verseRows.length).padStart(4)} vv  ${String(tokenRows.length).padStart(6)} tok  ${String(xrefRows.length).padStart(4)} xref`,
    );
  }

  console.log(
    `\nSeeded ${translation.id}${translation.isDefault ? ' (default)' : ''}: ` +
      `${CANON.length} books, ${chapters} chapters, ${verseCount} verses, ` +
      `${tokenCount} tokens, ${xrefCount} cross-refs.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
