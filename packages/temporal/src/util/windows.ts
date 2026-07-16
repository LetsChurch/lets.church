import { invariant } from 'es-toolkit';

import {
  createEmbeddingsTracked,
  EMBED_DIMS,
  EMBED_MAX_INPUTS,
  EMBED_MODEL,
} from './llm';

// Rolling "story window" construction — a direct port of the Go reference
// (services/search/windows.go on the qdrant-backend branch). A window
// concatenates `WINDOW_SIZE` consecutive paragraphs and advances by
// `WINDOW_STRIDE`, giving overlapping passages that carry more context than a
// single paragraph. A story that spans several paragraphs then becomes
// retrievable as one coherent unit (the story-run recall case). See
// docs/agentic-search-overview.md.
export const WINDOW_SIZE = 4;
export const WINDOW_STRIDE = 2;

export type InParagraph = {
  order: number;
  start: number;
  end: number;
  text: string;
};

export type BuiltWindow = {
  startOrder: number;
  endOrder: number;
  start: number;
  end: number;
  text: string;
  // The ordered constituent paragraphs this window concatenates, kept so the
  // window can store them inline for snippet reconstruction (no separate lookup
  // needed to render a contiguous span).
  paras: InParagraph[];
};

export type EmbeddedWindow = BuiltWindow & {
  embedding: number[];
};

/**
 * Roll the ordered paragraphs into overlapping windows. Paragraphs are assumed
 * already ordered by `order` (callers select `ORDER BY order`); no defensive
 * re-sort. Window text is the constituent paragraphs' text trimmed and joined
 * with a single space. Empty-text windows are skipped, and once a window reaches
 * the end of the transcript we stop so we don't emit a shrinking tail of
 * duplicate-suffix windows. For N paragraphs this yields ~N/2 windows.
 */
export function buildWindows(
  paras: InParagraph[],
  size = WINDOW_SIZE,
  stride = WINDOW_STRIDE,
): BuiltWindow[] {
  if (paras.length === 0) {
    return [];
  }
  const windows: BuiltWindow[] = [];
  for (let i = 0; i < paras.length; i += stride) {
    const end = Math.min(i + size, paras.length);
    const group = paras.slice(i, end);
    const text = group
      .map((p) => p.text.trim())
      .join(' ')
      .trim();
    if (text === '') {
      // A window that reaches the end with no text still terminates the loop
      // below, matching the Go port's `continue`-then-`break` ordering.
      if (end === paras.length) break;
      continue;
    }
    const first = group[0];
    const last = group[group.length - 1];
    invariant(first && last, 'window group is non-empty');
    windows.push({
      startOrder: first.order,
      endOrder: last.order,
      start: first.start,
      end: last.end,
      text,
      paras: group.map((p) => ({
        order: p.order,
        start: p.start,
        end: p.end,
        text: p.text,
      })),
    });
    // The last window already reaches the end; stop before emitting a shrinking
    // tail of duplicate-suffix windows.
    if (end === paras.length) break;
  }
  return windows;
}

/**
 * Embed each window's concatenated text with `text-embedding-3-small` (1536-d),
 * batched at OpenAI's per-request input cap, and attach the vector. Unlike
 * paragraph embeddings (precomputed and stored on `transcript_paragraph`),
 * window embeddings are computed fresh at index time — a story window's text has
 * no persisted vector. One `llm_call` row is recorded per chunk.
 */
export async function embedWindows(
  windows: BuiltWindow[],
  uploadRecordId: string,
): Promise<EmbeddedWindow[]> {
  if (windows.length === 0) {
    return [];
  }
  const out: EmbeddedWindow[] = [];
  const chunkCount = Math.ceil(windows.length / EMBED_MAX_INPUTS);
  for (let chunkIdx = 0; chunkIdx < chunkCount; chunkIdx++) {
    const start = chunkIdx * EMBED_MAX_INPUTS;
    const slice = windows.slice(start, start + EMBED_MAX_INPUTS);
    const res = await createEmbeddingsTracked({
      tracking: { activity: 'indexWindowsEmbed', uploadRecordId },
      model: EMBED_MODEL,
      input: slice.map((w) => w.text),
    });
    invariant(
      res.data.length === slice.length,
      `Window embedding count mismatch on chunk ${chunkIdx}: expected ${slice.length}, got ${res.data.length}`,
    );
    for (const [i, d] of res.data.entries()) {
      invariant(
        d.index === i,
        `Window embedding index mismatch on chunk ${chunkIdx} pos ${i}: got ${d.index}`,
      );
      invariant(
        d.embedding.length === EMBED_DIMS,
        `Window embedding dim mismatch on chunk ${chunkIdx} pos ${i}: got ${d.embedding.length}`,
      );
      const w = slice[i];
      invariant(w, `missing window at chunk ${chunkIdx} pos ${i}`);
      out.push({ ...w, embedding: d.embedding });
    }
  }
  return out;
}
