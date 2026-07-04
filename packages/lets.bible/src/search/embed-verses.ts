// Generate the committed per-translation verse-embedding artifact
// (seed/embeddings/<TID>.f16.bin + <TID>.manifest.json) by embedding verse text
// via OpenAI. This is the ONE place the corpus is embedded — run MANUALLY and
// rarely (adding a translation, or changing the model/dims), then commit the
// artifact (git-lfs). Indexing (index-verses.ts) only READS it and never embeds.
//
// Needs OPENAI_API_KEY and a seeded DB. Embed one translation with
// TRANSLATION_ID=<tid>, or every translation present in the DB (default):
//   just lb-embed          # all
//   just lb-embed BSB      # one
import {
  closeSync,
  ftruncateSync,
  mkdirSync,
  openSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { asc, eq } from 'drizzle-orm';
import {
  EMBED_DIMS,
  EMBED_MODEL,
  embeddingsEnabled,
  embedTexts,
} from '../ai/embed';
import { bibleVerse, db } from '../db';

if (!embeddingsEnabled()) {
  throw new Error('OPENAI_API_KEY is required to generate verse embeddings.');
}

const OUT_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../seed/embeddings',
);
mkdirSync(OUT_DIR, { recursive: true });

const only = process.env.TRANSLATION_ID?.trim();
const tids = only
  ? [only]
  : (await db.selectDistinct({ t: bibleVerse.translationId }).from(bibleVerse))
      .map((r) => r.t)
      .sort();

if (tids.length === 0) {
  throw new Error('No verses in the DB — seed it first (e.g. `just lb-up`).');
}

// ≤ OpenAI's 2048 inputs/call, and embed+write in chunks so peak memory stays a
// few MB rather than holding a whole translation's 3072-float vectors at once.
const CHUNK = 2000;

for (const tid of tids) {
  // Stable ref order → deterministic byte layout + manifest, aligned to the .bin.
  const rows = await db
    .select({ ref: bibleVerse.ref, text: bibleVerse.text })
    .from(bibleVerse)
    .where(eq(bibleVerse.translationId, tid))
    .orderBy(asc(bibleVerse.ref));
  if (rows.length === 0) {
    console.log(`  ${tid}: no verses in DB — skipping`);
    continue;
  }
  console.log(`Embedding ${rows.length} ${tid} verses (${EMBED_MODEL})...`);

  const fd = openSync(join(OUT_DIR, `${tid}.f16.bin`), 'w');
  ftruncateSync(fd, rows.length * EMBED_DIMS * 2);
  for (let i = 0; i < rows.length; i += CHUNK) {
    const part = rows.slice(i, i + CHUNK);
    const vectors = await embedTexts(part.map((r) => r.text));
    for (let j = 0; j < part.length; j += 1) {
      const f16 = new Float16Array(vectors[j]);
      writeSync(
        fd,
        Buffer.from(f16.buffer, f16.byteOffset, f16.byteLength),
        0,
        EMBED_DIMS * 2,
        (i + j) * EMBED_DIMS * 2,
      );
    }
    console.log(`  ${tid}: ${Math.min(i + CHUNK, rows.length)}/${rows.length}`);
  }
  closeSync(fd);

  writeFileSync(
    join(OUT_DIR, `${tid}.manifest.json`),
    `${JSON.stringify({
      model: EMBED_MODEL,
      dims: EMBED_DIMS,
      dtype: 'float16',
      translationId: tid,
      count: rows.length,
      refs: rows.map((r) => r.ref),
    })}\n`,
  );
  console.log(
    `  wrote ${tid}.f16.bin (${((rows.length * EMBED_DIMS * 2) / 1e6).toFixed(0)} MB) + manifest`,
  );
}
process.exit(0);
