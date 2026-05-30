import { db, UploadRecord } from '@letschurch/db';
import { eq } from 'drizzle-orm';
import { invariant } from 'es-toolkit';
import {
  createEmbeddingsTracked,
  EMBED_DIMS,
  EMBED_MODEL,
  openrouterExtras,
} from '../../util/llm';
import logger from '../../util/logger';

const moduleLogger = logger.child({
  module: 'temporal/activities/background/embed-upload',
});

/**
 * Embed the upload's `summary` and `search_summary` with
 * `openai/text-embedding-3-small` (1536 dims) via OpenRouter, then persist
 * both vectors on the upload row.
 *
 * One HTTP call with two-element `input` array — both vectors come back in
 * one round-trip. Depends on `summarize-upload` having run first (will throw
 * if either summary is null).
 */
export default async function embedUpload(uploadRecordId: string) {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'embedUpload',
    context: { args: { uploadRecordId } },
  });

  const row = await db
    .select({
      summary: UploadRecord.summary,
      searchSummary: UploadRecord.searchSummary,
    })
    .from(UploadRecord)
    .where(eq(UploadRecord.id, uploadRecordId))
    .then((r) => r[0]);

  invariant(row, `Upload record ${uploadRecordId} not found`);
  invariant(
    row.summary && row.searchSummary,
    `Summaries missing for ${uploadRecordId} — run summarizeUpload first`,
  );

  const res = await createEmbeddingsTracked({
    tracking: { activity: 'embedUpload', uploadRecordId },
    model: EMBED_MODEL,
    input: [row.summary, row.searchSummary],
    ...(openrouterExtras as Record<string, unknown>),
  });

  invariant(
    res.data.length === 2,
    `Expected 2 embeddings, got ${res.data.length}`,
  );
  const [summaryEmb, searchEmb] = res.data;
  invariant(summaryEmb && searchEmb, 'Missing embedding in response');
  invariant(
    summaryEmb.embedding.length === EMBED_DIMS &&
      searchEmb.embedding.length === EMBED_DIMS,
    `Embedding dim mismatch (expected ${EMBED_DIMS})`,
  );

  await db
    .update(UploadRecord)
    .set({
      summaryEmbedding: summaryEmb.embedding,
      searchSummaryEmbedding: searchEmb.embedding,
    })
    .where(eq(UploadRecord.id, uploadRecordId));

  activityLogger.info('Stored summary + searchSummary embeddings');
  return {};
}
