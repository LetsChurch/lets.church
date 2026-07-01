/// <reference lib="webworker" />
// Builds the FlexSearch verse index off the main thread from the raw verse texts,
// so the ~0.5–2s build (31k `add`s) doesn't jank the UI. It replaces the
// pre-built `<id>.index.json` we used to ship (~2.1 MB brotli / translation): the
// index is derived from `verses.json`, which the client fetches anyway, so we
// ship the text and build the index here, then cache the result in IndexedDB
// (see index-cache.ts). Returns the serialized export shards (the same shape the
// build step used to emit); the main thread imports them and persists them.
//
// The index config MUST stay identical to flex-client.ts `newIndex()` — a
// mismatch produces a broken import on the main thread.
import { Charset, Index } from 'flexsearch';

type BuildRequest = { id: string; texts: string[] };
type BuildResponse = { id: string; parts: Record<string, string> };

self.onmessage = (e: MessageEvent<BuildRequest>) => {
  const { id, texts } = e.data;
  const index = new Index({
    tokenize: 'forward',
    encoder: Charset.LatinAdvanced,
    fastupdate: false,
  });
  for (let i = 0; i < texts.length; i++) {
    index.add(i, texts[i]);
  }
  // FlexSearch 0.8 export is synchronous and emits string parts (reg, cfg, map…).
  const parts: Record<string, string> = {};
  index.export((key: string, data: unknown) => {
    if (data != null) {
      parts[key] = typeof data === 'string' ? data : JSON.stringify(data);
    }
  });
  (self as unknown as Worker).postMessage({
    id,
    parts,
  } satisfies BuildResponse);
};
