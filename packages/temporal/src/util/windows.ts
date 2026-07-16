import { createHash } from 'node:crypto';

import { db, TranscriptWindow } from '@letschurch/db';
import { and, eq, notInArray, sql } from 'drizzle-orm';
import { invariant } from 'es-toolkit';

import {
  createEmbeddingsTracked,
  EMBED_DIMS,
  EMBED_MAX_INPUTS,
  EMBED_MODEL,
} from './llm';
import logger from './logger';

const moduleLogger = logger.child({ module: 'temporal/util/windows' });

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

/** sha256 of a window's concatenated text — the `transcript_window` reuse key. */
export function windowTextHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Embed windows, reusing any vector already persisted in `transcript_window`
 * whose `textHash` still matches. Only the misses hit OpenAI; the hits come back
 * from Postgres. On a re-index of an upload whose transcript hasn't changed this
 * is a pure DB read — no embed call, no `llm_call` row — which is what makes a
 * full reindex cheap rather than a corpus-wide re-embed.
 *
 * Freshly embedded windows are upserted, and rows whose `startOrder` is no longer
 * produced by `buildWindows` (transcript got shorter) are pruned, so the table
 * tracks the current transcript exactly.
 *
 * Failures to persist are swallowed: the vectors are already in hand, so a write
 * hiccup should cost the next reindex a re-embed, not fail this index.
 */
export async function embedWindowsCached(
  windows: BuiltWindow[],
  uploadRecordId: string,
): Promise<EmbeddedWindow[]> {
  if (windows.length === 0) {
    // No windows: drop any rows left from a previous, longer transcript.
    await db
      .delete(TranscriptWindow)
      .where(eq(TranscriptWindow.uploadRecordId, uploadRecordId));
    return [];
  }

  const hashByStartOrder = new Map(
    windows.map((w) => [w.startOrder, windowTextHash(w.text)]),
  );

  const cachedRows = await db
    .select({
      startOrder: TranscriptWindow.startOrder,
      textHash: TranscriptWindow.textHash,
      embedding: TranscriptWindow.embedding,
    })
    .from(TranscriptWindow)
    .where(eq(TranscriptWindow.uploadRecordId, uploadRecordId));

  const cached = new Map(
    cachedRows
      .filter(
        (r) =>
          r.textHash === hashByStartOrder.get(r.startOrder) &&
          r.embedding.length === EMBED_DIMS,
      )
      .map((r) => [r.startOrder, r.embedding]),
  );

  const misses = windows.filter((w) => !cached.has(w.startOrder));

  // Any vector we hold for this upload, hash-match or not. Used only to survive
  // an embed failure (see below), never in place of a fresh embed.
  const salvageable = new Map(
    cachedRows
      .filter((r) => r.embedding.length === EMBED_DIMS)
      .map((r) => [r.startOrder, r.embedding]),
  );

  let embedded: EmbeddedWindow[] = [];
  let embedFailed = false;
  if (misses.length > 0) {
    try {
      embedded = await embedWindows(misses, uploadRecordId);
    } catch (err) {
      // Typically a sustained 429: the embeddings TPM budget is org-wide, and a
      // wide reindex can exhaust it for longer than the client's retries cover.
      embedFailed = true;
      moduleLogger.warn(
        {
          uploadRecordId,
          context: {
            missing: misses.length,
            error: err instanceof Error ? err.message : String(err),
          },
        },
        'Window embedding failed; falling back to previously stored vectors',
      );
    }
  }

  const freshByStartOrder = new Map(
    embedded.map((w) => [w.startOrder, w.embedding]),
  );

  // Resolution order: exact cache hit, then a fresh embed, then — only if the
  // embed failed — whatever we stored last time.
  //
  // That last fallback is what stops a reindex from *destroying* data. The
  // caller treats an empty window list as "index the doc without windows", which
  // is right for a doc's first index but catastrophic on a re-index: it would
  // overwrite a doc's existing windows with nothing, silently degrading
  // story-run recall for as long as it takes someone to notice. A stale vector
  // is a far smaller error than a missing one, and the next successful reindex
  // corrects it.
  const out: EmbeddedWindow[] = [];
  for (const w of windows) {
    const embedding =
      cached.get(w.startOrder) ??
      freshByStartOrder.get(w.startOrder) ??
      (embedFailed ? salvageable.get(w.startOrder) : undefined);
    if (embedding) {
      out.push({ ...w, embedding });
    }
  }
  invariant(
    embedFailed || out.length === windows.length,
    `resolved ${out.length}/${windows.length} window embeddings without an embed failure`,
  );

  try {
    await db.transaction(async (tx) => {
      if (embedded.length > 0) {
        await tx
          .insert(TranscriptWindow)
          .values(
            embedded.map((w) => ({
              uploadRecordId,
              startOrder: w.startOrder,
              endOrder: w.endOrder,
              start: w.start,
              end: w.end,
              textHash: windowTextHash(w.text),
              embedding: w.embedding,
            })),
          )
          .onConflictDoUpdate({
            target: [
              TranscriptWindow.uploadRecordId,
              TranscriptWindow.startOrder,
            ],
            set: {
              endOrder: sql`excluded.end_order`,
              start: sql`excluded.start`,
              end: sql`excluded.end`,
              textHash: sql`excluded.text_hash`,
              embedding: sql`excluded.embedding`,
            },
          });
      }
      // Prune windows the current transcript no longer produces.
      await tx
        .delete(TranscriptWindow)
        .where(
          and(
            eq(TranscriptWindow.uploadRecordId, uploadRecordId),
            notInArray(TranscriptWindow.startOrder, [
              ...hashByStartOrder.keys(),
            ]),
          ),
        );
    });
  } catch (err) {
    // Non-fatal — `out` is complete either way, so don't fail the index over a
    // cache write. Log loudly all the same: if this keeps failing the cache
    // never populates and every reindex silently re-embeds the whole corpus,
    // which looks like nothing more than "reindex is slow again".
    moduleLogger.warn(
      {
        uploadRecordId,
        context: {
          error: err instanceof Error ? err.message : String(err),
        },
      },
      'Failed to persist window embeddings; next reindex will re-embed',
    );
  }

  return out;
}

/**
 * Embed each window's concatenated text with `text-embedding-3-small` (1536-d),
 * batched at OpenAI's per-request input cap, and attach the vector. A window's
 * text has no persisted vector of its own, so this is the cold path; prefer
 * `embedWindowsCached`, which only calls this for windows whose text changed.
 * One `llm_call` row is recorded per chunk.
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
