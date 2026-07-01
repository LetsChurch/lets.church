// Bulk-index every verse (all translations) from Postgres into the search
// index. Idempotent: doc id is `${translationId}:${ref}`, so re-running upserts.
// Run after `es:push-mappings` and after the DB is seeded.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bibleVerse, db } from '../db';
import { findBook } from '../lib/canon';
import { client, VERSE_INDEX, waitForOpenSearch } from './client';

// Common Crawl appearance count per USFM ref (seed/popularity.json, distilled
// from pop.txt — non-existent verses already dropped). Translation-independent,
// so the same value applies to every translation's copy of the verse.
const popularity: Record<string, number> = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../../seed/popularity.json'),
    'utf8',
  ),
);

await waitForOpenSearch();

const rows = await db
  .select({
    translationId: bibleVerse.translationId,
    book: bibleVerse.book,
    chapter: bibleVerse.chapter,
    verse: bibleVerse.verse,
    ref: bibleVerse.ref,
    ordinal: bibleVerse.ordinal,
    text: bibleVerse.text,
  })
  .from(bibleVerse);

console.log(`Indexing ${rows.length} verses into ${VERSE_INDEX}...`);

const BATCH = 2000;
let indexed = 0;
for (let i = 0; i < rows.length; i += BATCH) {
  const slice = rows.slice(i, i + BATCH);
  const operations = slice.flatMap((r) => {
    const canon = findBook(r.book);
    return [
      { index: { _index: VERSE_INDEX, _id: `${r.translationId}:${r.ref}` } },
      {
        translationId: r.translationId,
        book: r.book,
        slug: canon?.slug ?? r.book.toLowerCase(),
        name: canon?.name ?? r.book,
        testament: canon?.testament ?? null,
        chapter: r.chapter,
        verse: r.verse,
        ref: r.ref,
        ordinal: r.ordinal,
        text: r.text,
        // Only set when we have data — a rank_feature must be a positive number,
        // and omitting it simply means no popularity boost for that verse.
        ...(popularity[r.ref] ? { popularity: popularity[r.ref] } : {}),
      },
    ];
  });

  const res = await client.bulk({ body: operations, refresh: false });
  if (res.body.errors) {
    const items = res.body.items as Array<{ index?: { error?: unknown } }>;
    const firstError = items.find((it) => it.index?.error)?.index?.error;
    throw new Error(`Bulk index error: ${JSON.stringify(firstError)}`);
  }
  indexed += slice.length;
  console.log(`  ${indexed}/${rows.length}`);
}

await client.indices.refresh({ index: VERSE_INDEX });
console.log(`Indexed ${indexed} verses into ${VERSE_INDEX}.`);
process.exit(0);
