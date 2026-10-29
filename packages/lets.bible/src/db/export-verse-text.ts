// Export the public-domain verse text that lets.church's transcript annotator
// matches spoken Scripture quotations against
// (packages/temporal/src/util/scripture/quotes.ts). One row per verse:
// `OSIS-ref \t KJV \t WEB \t BSB`, gzipped, written to stdout so the host can
// redirect it into the temporal package (this container doesn't mount it).
//
// Run: `just lb-export-verse-text` (regenerates the committed
// packages/temporal/src/util/scripture/data/verse-text.tsv.gz).

import { gzipSync } from 'node:zlib';

import { asc, inArray } from 'drizzle-orm';

import { bibleVerse, db } from '.';
import { osisBookId } from '../lib/osis';

// Older-English, modern-literal, and modern renderings cover how most preachers
// quote. All three are public domain.
const TRANSLATIONS = ['KJV', 'WEB', 'BSB'] as const;

async function main() {
  const rows = await db
    .select({
      translationId: bibleVerse.translationId,
      book: bibleVerse.book,
      chapter: bibleVerse.chapter,
      verse: bibleVerse.verse,
      ordinal: bibleVerse.ordinal,
      text: bibleVerse.text,
    })
    .from(bibleVerse)
    .where(inArray(bibleVerse.translationId, [...TRANSLATIONS]))
    .orderBy(asc(bibleVerse.translationId), asc(bibleVerse.ordinal));

  // Keyed by OSIS ref, in first-seen canonical order.
  const verses = new Map<string, Map<string, string>>();
  for (const row of rows) {
    const book = osisBookId(row.book);
    if (!book) continue;
    const ref = `${book}.${row.chapter}.${row.verse}`;
    let byTranslation = verses.get(ref);
    if (!byTranslation) {
      byTranslation = new Map();
      verses.set(ref, byTranslation);
    }
    // Tabs/newlines would break the TSV framing; verse text never needs them.
    byTranslation.set(row.translationId, row.text.replace(/\s+/g, ' ').trim());
  }

  const lines = [...verses].map(([ref, byTranslation]) =>
    [ref, ...TRANSLATIONS.map((id) => byTranslation.get(id) ?? '')].join('\t'),
  );
  console.error(`Exported ${lines.length} verses (${TRANSLATIONS.join(', ')})`);
  // Exit only once stdout has flushed: a piped stdout is async, and exiting
  // early truncates the gzip stream.
  process.stdout.write(gzipSync(`${lines.join('\n')}\n`, { level: 9 }), () =>
    process.exit(0),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
