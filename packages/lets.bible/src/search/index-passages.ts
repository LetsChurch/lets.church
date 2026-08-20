// Bulk-index every thought-unit passage (translator paragraphs, all paragraphed
// translations) into the search index. Idempotent: doc id is
// `${translationId}:${ref}` (ref = `${book}.${chapter}.${startVerse}-${endVerse}`),
// so re-running upserts. Run after `es:push-mappings` and after the DB is seeded.
//
// Like index-verses.ts, semantic vectors come ONLY from the committed seed
// artifact (seed/passage-embeddings, git-lfs) — indexing never calls OpenAI.
// Generate/refresh it with `just lb-embed-passages`. Absent → a lexical-only
// passage index (the passage-recall lane then contributes no semantic hits).

import { client, PASSAGE_INDEX, waitForOpenSearch } from './client';
import { loadCommittedPassageEmbeddings } from './embeddings-file';
import { extractPassages } from './passages';

await waitForOpenSearch();

const passages = await extractPassages();

const committed = loadCommittedPassageEmbeddings();
console.log(
  committed
    ? `Indexing ${passages.length} passages into ${PASSAGE_INDEX} with committed embeddings (${committed.model}, ${committed.count} vectors)...`
    : `Indexing ${passages.length} passages into ${PASSAGE_INDEX} WITHOUT embeddings — no seed/passage-embeddings artifact (run \`just lb-embed-passages\`, or \`git lfs pull\`); passage recall will be lexical-only...`,
);

// Base64 float32 encoding keeps each 3072-d vector at 16KiB. Retain conservative
// 300-document bulks until production measurements justify a larger batch.
const BULK_BATCH = 300;
let indexed = 0;
for (let b = 0; b < passages.length; b += BULK_BATCH) {
  const chunk = passages.slice(b, b + BULK_BATCH);
  const operations = chunk.flatMap((p) => {
    const vec = committed?.getBase64(`${p.translationId}:${p.ref}`);
    return [
      { index: { _index: PASSAGE_INDEX, _id: `${p.translationId}:${p.ref}` } },
      {
        translationId: p.translationId,
        book: p.book,
        slug: p.slug,
        name: p.name,
        testament: p.testament,
        chapter: p.chapter,
        startVerse: p.startVerse,
        endVerse: p.endVerse,
        ref: p.ref,
        ordinal: p.ordinal,
        text: p.text,
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
  console.log(`  ${indexed}/${passages.length}`);
}

await client.indices.refresh({ index: PASSAGE_INDEX });
console.log(`Indexed ${indexed} passages into ${PASSAGE_INDEX}.`);
process.exit(0);
