import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EMBED_DIMS } from '../ai/embed';

// Reads the committed PER-TRANSLATION verse-embedding artifacts (seed/embeddings/
// <TID>.f16.bin + <TID>.manifest.json, produced by export-embeddings.ts) so the
// indexer can rebuild the search index without re-embedding via OpenAI. Vectors
// are stored float16, decoded to number[] on demand from per-translation buffers
// (kept in memory; ~730 MB total across translations) rather than a giant map,
// keeping memory bounded. Discovering files by directory listing means adding a
// translation is just adding its two files. Returns null when no artifact exists
// (the indexer then live-embeds, given a key).

const DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../seed/embeddings',
);
const MANIFEST_SUFFIX = '.manifest.json';

type TranslationManifest = {
  model: string;
  dims: number;
  dtype: string;
  translationId: string;
  count: number;
  refs: string[]; // aligned to the binary's row layout
};

type Loaded = {
  f16: Float16Array;
  refIndex: Map<string, number>;
};

export type CommittedEmbeddings = {
  model: string;
  count: number;
  /** Decoded vector for a `${translationId}:${ref}` id, or undefined if absent. */
  get(id: string): number[] | undefined;
};

export function loadCommittedEmbeddings(): CommittedEmbeddings | null {
  if (!existsSync(DIR)) {
    return null;
  }
  const manifests = readdirSync(DIR).filter((f) => f.endsWith(MANIFEST_SUFFIX));
  if (manifests.length === 0) {
    return null;
  }

  const byTid = new Map<string, Loaded>();
  let model = '';
  let count = 0;
  for (const file of manifests) {
    const m = JSON.parse(
      readFileSync(join(DIR, file), 'utf8'),
    ) as TranslationManifest;
    if (m.dims !== EMBED_DIMS) {
      throw new Error(
        `Committed embeddings for ${m.translationId} are ${m.dims}-d but EMBED_DIMS is ${EMBED_DIMS} — regenerate seed/embeddings (see export-embeddings.ts).`,
      );
    }
    const buf = readFileSync(join(DIR, `${m.translationId}.f16.bin`));
    const f16 = new Float16Array(
      buf.buffer,
      buf.byteOffset,
      Math.floor(buf.byteLength / 2),
    );
    byTid.set(m.translationId, {
      f16,
      refIndex: new Map(m.refs.map((ref, i) => [ref, i])),
    });
    model = m.model;
    count += m.count;
  }

  return {
    model,
    count,
    get(id: string) {
      const sep = id.indexOf(':');
      const tid = id.slice(0, sep);
      const ref = id.slice(sep + 1);
      const t = byTid.get(tid);
      if (!t) {
        return undefined;
      }
      const row = t.refIndex.get(ref);
      if (row === undefined) {
        return undefined;
      }
      const start = row * EMBED_DIMS;
      return Array.from(t.f16.subarray(start, start + EMBED_DIMS));
    },
  };
}
