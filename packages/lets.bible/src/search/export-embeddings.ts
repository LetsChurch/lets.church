// Export verse embeddings from the live search index into committed, PER-
// TRANSLATION artifacts (one float16 binary + one JSON manifest per translation),
// so `index-verses.ts` can rebuild the index WITHOUT re-calling OpenAI —
// deterministic, free, and key-free (incl. CI / contributor dev). Bible text is
// static, so these vectors never change. Per-translation layout means adding a
// translation just adds `<TID>.f16.bin` + `<TID>.manifest.json` rather than
// rewriting one combined file.
//
// Regeneration (rare — only when the model/dims change, or after adding a
// translation): reindex WITH an OPENAI_API_KEY so the new/changed verses get
// live-embedded, then run this to (re)export, then commit the artifacts.
//
// Run in-container: `just lb-export-embeddings`.

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
import { EMBED_DIMS, EMBED_MODEL } from '../ai/embed';
import { client, VERSE_INDEX, waitForOpenSearch } from './client';

const OUT_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../seed/embeddings',
);

await waitForOpenSearch();
mkdirSync(OUT_DIR, { recursive: true });

const total = (await client.count({ index: VERSE_INDEX })).body.count as number;
console.log(`Exporting ${total} verse embeddings from ${VERSE_INDEX}...`);

type Src = { translationId: string; ref: string; embedding?: number[] };
async function* scrollAll(source: string[]) {
  let res = await client.search({
    index: VERSE_INDEX,
    scroll: '3m',
    body: { size: 1000, _source: source, query: { match_all: {} } },
  });
  let scrollId = res.body._scroll_id as string;
  try {
    while (res.body.hits.hits.length > 0) {
      for (const hit of res.body.hits.hits as unknown as Array<{
        _source: Src;
      }>) {
        yield hit._source;
      }
      res = await client.scroll({ scroll_id: scrollId, scroll: '3m' });
      scrollId = res.body._scroll_id as string;
    }
  } finally {
    await client.clearScroll({ scroll_id: scrollId }).catch(() => {});
  }
}

// Pass 1: collect refs per translation, sorted, so each artifact is deterministic
// (stable manifest + byte layout) regardless of scroll order.
const refsByTid = new Map<string, string[]>();
for await (const s of scrollAll(['translationId', 'ref'])) {
  let refs = refsByTid.get(s.translationId);
  if (!refs) {
    refs = [];
    refsByTid.set(s.translationId, refs);
  }
  refs.push(s.ref);
}
const tids = [...refsByTid.keys()].sort();
console.log(
  `  ${tids.length} translations: ${tids.map((t) => `${t}(${refsByTid.get(t)?.length})`).join(', ')}`,
);

// Pre-size each translation's binary (count * dims * 2 bytes for float16) and
// build ref→row lookups for the random-access writes in pass 2.
const state = new Map<
  string,
  { fd: number; indexOf: Map<string, number>; refs: string[] }
>();
for (const tid of tids) {
  const refs = (refsByTid.get(tid) as string[]).sort();
  const fd = openSync(join(OUT_DIR, `${tid}.f16.bin`), 'w');
  ftruncateSync(fd, refs.length * EMBED_DIMS * 2);
  state.set(tid, { fd, indexOf: new Map(refs.map((r, i) => [r, i])), refs });
}

// Pass 2: write each vector into its translation's binary at its sorted row.
let written = 0;
for await (const s of scrollAll(['translationId', 'ref', 'embedding'])) {
  const st = state.get(s.translationId);
  if (!st || !s.embedding) {
    continue;
  }
  const pos = st.indexOf.get(s.ref);
  if (pos === undefined) {
    continue;
  }
  const f16 = new Float16Array(s.embedding);
  writeSync(
    st.fd,
    Buffer.from(f16.buffer, f16.byteOffset, f16.byteLength),
    0,
    EMBED_DIMS * 2,
    pos * EMBED_DIMS * 2,
  );
  written += 1;
  if (written % 20000 === 0) {
    console.log(`  ${written}/${total}`);
  }
}

for (const tid of tids) {
  const st = state.get(tid) as { fd: number; refs: string[] };
  closeSync(st.fd);
  writeFileSync(
    join(OUT_DIR, `${tid}.manifest.json`),
    `${JSON.stringify({
      model: EMBED_MODEL,
      dims: EMBED_DIMS,
      dtype: 'float16',
      translationId: tid,
      count: st.refs.length,
      refs: st.refs,
    })}\n`,
  );
}

console.log(
  `Wrote ${written} vectors across ${tids.length} per-translation files (${((written * EMBED_DIMS * 2) / 1e6).toFixed(0)} MB total) + manifests.`,
);
process.exit(0);
