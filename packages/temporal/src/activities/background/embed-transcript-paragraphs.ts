import { db, TranscriptParagraph } from '@letschurch/db';
import { asc, eq } from 'drizzle-orm';
import { invariant } from 'es-toolkit';
import {
  createEmbeddingsTracked,
  EMBED_DIMS,
  EMBED_MODEL,
  openrouterExtras,
} from '../../util/llm';
import logger from '../../util/logger';

const moduleLogger = logger.child({
  module: 'temporal/activities/background/embed-transcript-paragraphs',
});

/**
 * Embed every `transcript_paragraph` row for an upload with
 * `openai/text-embedding-3-small` (1536 dims) via OpenRouter, then persist
 * the vectors back to the same rows.
 *
 * One HTTP request: OpenAI's embeddings endpoint accepts up to 2048 `input`
 * strings per call (and OpenRouter routes the same request format), and the
 * largest sermon we'd see has well under 100 paragraphs. The SDK's built-in
 * exponential backoff handles 429/5xx (`maxRetries: 5` in `util/llm.ts`); the
 * Temporal activity retry sits on top of that.
 *
 * The write is N updates inside a single transaction (different embedding per
 * row, no stable upsert key). Idempotent: re-running overwrites.
 */
export default async function embedTranscriptParagraphs(
  uploadRecordId: string,
) {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'embedTranscriptParagraphs',
    context: { args: { uploadRecordId } },
  });

  const rows = await db
    .select({ id: TranscriptParagraph.id, text: TranscriptParagraph.text })
    .from(TranscriptParagraph)
    .where(eq(TranscriptParagraph.uploadRecordId, uploadRecordId))
    .orderBy(asc(TranscriptParagraph.order));

  if (rows.length === 0) {
    activityLogger.info('No paragraphs to embed');
    return { paragraphs: 0 };
  }

  activityLogger.info(`Embedding ${rows.length} paragraphs`);
  const res = await createEmbeddingsTracked({
    tracking: { activity: 'embedTranscriptParagraphs', uploadRecordId },
    model: EMBED_MODEL,
    input: rows.map((r) => r.text),
    ...(openrouterExtras as Record<string, unknown>),
  });

  invariant(
    res.data.length === rows.length,
    `Embedding count mismatch: expected ${rows.length}, got ${res.data.length}`,
  );

  // OpenAI returns embeddings in the same order as input; double-check the
  // index field matches so a future provider change can't silently misalign.
  for (const [i, d] of res.data.entries()) {
    invariant(
      d.index === i,
      `Embedding index mismatch at position ${i}: got ${d.index}`,
    );
    invariant(
      d.embedding.length === EMBED_DIMS,
      `Embedding dim mismatch at position ${i}: got ${d.embedding.length}`,
    );
  }

  await db.transaction(async (tx) => {
    await Promise.all(
      rows.map((r, i) =>
        tx
          .update(TranscriptParagraph)
          .set({ embedding: res.data[i]?.embedding })
          .where(eq(TranscriptParagraph.id, r.id)),
      ),
    );
  });

  activityLogger.info(`Embedded ${rows.length} paragraphs`);
  return { paragraphs: rows.length };
}
