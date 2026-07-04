// Bulk-index every verse (all translations) from Postgres into the search
// index. Idempotent: doc id is `${translationId}:${ref}`, so re-running upserts.
// Run after `es:push-mappings` and after the DB is seeded.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { embeddingsEnabled, embedTexts } from '../ai/embed';
import { bibleVerse, db } from '../db';
import { findBook } from '../lib/canon';
import { client, VERSE_INDEX, waitForOpenSearch } from './client';
import { loadCommittedEmbeddings } from './embeddings-file';

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

// Semantic vectors for hybrid search. Prefer the committed seed artifact
// (seed/embeddings) so a reindex is deterministic and needs no OpenAI key; fall
// back to live embedding for any verse missing from it (or all verses when
// there's no artifact but a key is set). With neither, the index is lexical-only.
const committed = loadCommittedEmbeddings();
const withEmbeddings = embeddingsEnabled();
console.log(
  committed
    ? `Indexing ${rows.length} verses into ${VERSE_INDEX} using committed embeddings (${committed.model}, ${committed.count} vectors)${withEmbeddings ? '; live-embedding any misses' : ''}...`
    : `Indexing ${rows.length} verses into ${VERSE_INDEX} ${
        withEmbeddings
          ? 'with live OpenAI embeddings (no seed artifact)'
          : 'WITHOUT embeddings — no seed artifact and OPENAI_API_KEY unset; search will be lexical-only'
      }...`,
);

// EMBED_BATCH ≤ 2048 so each slice's verse texts fit a single OpenAI embeddings
// call. BULK_BATCH is much smaller: a doc with a 3072-float embedding is ~60KB of
// JSON, so a large bulk body trips OpenSearch's coordinating indexing-pressure
// limit (~51MB). Flush the embedded slice in byte-bounded chunks (~300 × 60KB ≈
// 18MB) that stay comfortably under it.
const EMBED_BATCH = 2000;
const BULK_BATCH = 300;
let indexed = 0;
for (let i = 0; i < rows.length; i += EMBED_BATCH) {
  const slice = rows.slice(i, i + EMBED_BATCH);
  // One vector per verse (aligned to `slice`): committed artifact first, then
  // live-embed only the misses (needs a key). null = no embeddings at all.
  let vectors: Array<number[] | undefined> | null = null;
  if (committed) {
    vectors = slice.map((r) => committed.get(`${r.translationId}:${r.ref}`));
    if (withEmbeddings) {
      const missing = vectors.flatMap((v, k) => (v ? [] : [k]));
      if (missing.length > 0) {
        const filled = await embedTexts(missing.map((k) => slice[k].text));
        missing.forEach((k, n) => {
          (vectors as Array<number[] | undefined>)[k] = filled[n];
        });
      }
    }
  } else if (withEmbeddings) {
    vectors = await embedTexts(slice.map((r) => r.text));
  }

  for (let b = 0; b < slice.length; b += BULK_BATCH) {
    const chunk = slice.slice(b, b + BULK_BATCH);
    const operations = chunk.flatMap((r, k) => {
      const canon = findBook(r.book);
      const vec = vectors?.[b + k];
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
          // Only set when we have data — a rank_feature must be a positive
          // number, and omitting it simply means no popularity boost.
          ...(popularity[r.ref] ? { popularity: popularity[r.ref] } : {}),
          ...(vec ? { embedding: vec } : {}),
        },
      ];
    });

    const res = await client.bulk({ body: operations, refresh: false });
    if (res.body.errors) {
      const items = res.body.items as Array<{ index?: { error?: unknown } }>;
      const firstError = items.find((it) => it.index?.error)?.index?.error;
      throw new Error(`Bulk index error: ${JSON.stringify(firstError)}`);
    }
    indexed += chunk.length;
    console.log(`  ${indexed}/${rows.length}`);
  }
}

await client.indices.refresh({ index: VERSE_INDEX });
console.log(`Indexed ${indexed} verses into ${VERSE_INDEX}.`);
process.exit(0);
