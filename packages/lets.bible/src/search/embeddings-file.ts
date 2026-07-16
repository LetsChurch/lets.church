import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EMBED_DIMS } from '../ai/embed';

// Reads the committed PER-TRANSLATION verse-embedding artifacts (seed/embeddings/
// <TID>.f16.bin + <TID>.manifest.json, produced by embed-verses.ts) so the
// indexer can rebuild the search index without re-embedding via OpenAI. Vectors
// are stored float16, decoded to number[] on demand from per-translation buffers
// (kept in memory; ~730 MB total across translations) rather than a giant map,
// keeping memory bounded. Discovering files by directory listing means adding a
// translation is just adding its two files. Returns null when no artifact exists
// (the indexer then live-embeds, given a key).

const SEED_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../seed');
// Verse vectors live under seed/embeddings; the parallel thought-unit (passage)
// vectors under seed/passage-embeddings. Both share the byte layout + manifest
// shape, so one loader serves both (keyed by `${translationId}:${ref}`).
const VERSE_DIR = join(SEED_ROOT, 'embeddings');
const PASSAGE_DIR = join(SEED_ROOT, 'passage-embeddings');
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

function loadFrom(dir: string, regenHint: string): CommittedEmbeddings | null {
  if (!existsSync(dir)) {
    return null;
  }
  const manifests = readdirSync(dir).filter((f) => f.endsWith(MANIFEST_SUFFIX));
  if (manifests.length === 0) {
    return null;
  }

  const byTid = new Map<string, Loaded>();
  let model = '';
  let count = 0;
  for (const file of manifests) {
    const m = JSON.parse(
      readFileSync(join(dir, file), 'utf8'),
    ) as TranslationManifest;
    if (m.dims !== EMBED_DIMS) {
      throw new Error(
        `Committed embeddings for ${m.translationId} are ${m.dims}-d but EMBED_DIMS is ${EMBED_DIMS} — regenerate (\`${regenHint}\`).`,
      );
    }
    const buf = readFileSync(join(dir, `${m.translationId}.f16.bin`));
    // Guard against a git-LFS pointer / truncated file masquerading as data — a
    // ~130-byte pointer would otherwise yield empty vectors and a cryptic
    // downstream "knn_vector dimension mismatch" at index time.
    const expectedBytes = m.count * m.dims * 2;
    if (buf.byteLength !== expectedBytes) {
      throw new Error(
        `${m.translationId}.f16.bin is ${buf.byteLength} bytes but the manifest expects ${expectedBytes} (${m.count}×${m.dims}×2) — likely an unresolved git-LFS pointer; run \`git lfs pull\`.`,
      );
    }
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

// Committed VERSE embeddings (seed/embeddings), keyed `${translationId}:${ref}`.
export function loadCommittedEmbeddings(): CommittedEmbeddings | null {
  return loadFrom(VERSE_DIR, 'just lb-embed');
}

// Committed PASSAGE (thought-unit) embeddings (seed/passage-embeddings), keyed
// `${translationId}:${passageRef}` (e.g. `BSB:GAL.5.22-23`).
export function loadCommittedPassageEmbeddings(): CommittedEmbeddings | null {
  return loadFrom(PASSAGE_DIR, 'just lb-embed-passages');
}
