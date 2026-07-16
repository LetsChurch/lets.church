// Generate the committed per-translation PASSAGE (thought-unit) embedding
// artifact (seed/passage-embeddings/<TID>.f16.bin + <TID>.manifest.json) by
// embedding each translator paragraph's text via OpenAI. Mirrors embed-verses.ts:
// run MANUALLY and rarely, then commit the artifact (git-lfs). index-passages.ts
// only READS it and never embeds.
//
// Needs OPENAI_API_KEY and a seeded DB:
//   just lb-embed-passages
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

import {
  EMBED_DIMS,
  EMBED_MODEL,
  embeddingsEnabled,
  embedTexts,
} from '../ai/embed';
import { extractPassages, PASSAGE_TRANSLATIONS } from './passages';

if (!embeddingsEnabled()) {
  throw new Error('OPENAI_API_KEY is required to generate passage embeddings.');
}

const OUT_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../seed/passage-embeddings',
);
mkdirSync(OUT_DIR, { recursive: true });

const only = process.env.TRANSLATION_ID?.trim();
const tids = only ? [only] : PASSAGE_TRANSLATIONS;

const passages = await extractPassages(tids);
if (passages.length === 0) {
  throw new Error('No passages extracted — is the DB seeded?');
}

// Passages are multi-verse, so batches must be bounded by TOKENS, not just item
// count: OpenAI caps a single embeddings request at 300k tokens. Stay well under,
// and under the 2048-input cap. (Verses are short enough that a flat 2000-count
// batch fits; paragraphs are ~2-4× longer, so a flat 2000 overflows.)
const TOKEN_BUDGET = 200_000;
const MAX_ITEMS = 2000;
const estTokens = (s: string) => Math.ceil(s.length / 4);

for (const tid of tids) {
  // Already globally-ordered by extractPassages, so the byte layout + manifest
  // refs are deterministic and aligned to the .bin.
  const rows = passages.filter((p) => p.translationId === tid);
  if (rows.length === 0) {
    console.log(`  ${tid}: no passages — skipping`);
    continue;
  }
  console.log(`Embedding ${rows.length} ${tid} passages (${EMBED_MODEL})...`);

  const fd = openSync(join(OUT_DIR, `${tid}.f16.bin`), 'w');
  ftruncateSync(fd, rows.length * EMBED_DIMS * 2);
  let i = 0;
  while (i < rows.length) {
    // Grow a batch under both the token budget and the item cap (always ≥ 1).
    let end = i;
    let tokens = 0;
    while (end < rows.length && end - i < MAX_ITEMS) {
      const t = estTokens(rows[end]!.text);
      if (end > i && tokens + t > TOKEN_BUDGET) {
        break;
      }
      tokens += t;
      end += 1;
    }
    const part = rows.slice(i, end);
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
    i = end;
    console.log(`  ${tid}: ${i}/${rows.length}`);
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
