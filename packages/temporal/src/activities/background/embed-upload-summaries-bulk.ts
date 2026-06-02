import { db, UploadRecord } from '@letschurch/db';
import { eq, inArray } from 'drizzle-orm';
import { invariant } from 'es-toolkit';
import {
  createEmbeddingsTracked,
  EMBED_DIMS,
  EMBED_MODEL,
  openrouterExtras,
} from '../../util/llm';
import logger from '../../util/logger';

const moduleLogger = logger.child({
  module: 'temporal/activities/background/embed-upload-summaries-bulk',
});

export type EmbedUploadSummariesBulkArgs = {
  uploadRecordIds: string[];
};

export type EmbedUploadSummariesBulkResult = {
  embedded: number;
  skipped: number;
};

/**
 * Live bulk-embed of upload summaries for the batch-reprocess group
 * workflow's phase-7. Each upload's summary + searchSummary together
 * are tiny (≤400 tokens) and the OpenRouter `embeddings.create`
 * endpoint accepts up to 2048 inputs per request, so for a group of
 * 100 uploads we send a single request with up to 200 inputs (2 per
 * upload, alternating).
 *
 * Why live instead of a 3rd OpenAI batch: the cost difference between
 * live and batch on this work is sub-dollar (~$0.001 / 100 uploads),
 * which doesn't justify another submit/poll/process/cleanup cycle +
 * a minimum ~10min wall-clock wait per group.
 */
export default async function embedUploadSummariesBulk(
  args: EmbedUploadSummariesBulkArgs,
): Promise<EmbedUploadSummariesBulkResult> {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'embedUploadSummariesBulk',
    context: { args },
  });
  if (args.uploadRecordIds.length === 0) {
    return { embedded: 0, skipped: 0 };
  }

  const rows = await db
    .select({
      id: UploadRecord.id,
      summary: UploadRecord.summary,
      searchSummary: UploadRecord.searchSummary,
    })
    .from(UploadRecord)
    .where(inArray(UploadRecord.id, args.uploadRecordIds));

  // Build the input array: alternating summary, searchSummary per
  // upload, in the same order the rows arrived. Track the upload id
  // for each pair so we can map embeddings back when the response
  // returns.
  const inputs: string[] = [];
  const eligibleUploadIds: string[] = [];
  let skipped = 0;
  for (const row of rows) {
    if (!row.summary || !row.searchSummary) {
      activityLogger.warn(
        `embedUploadSummariesBulk: skipping ${row.id} — missing summary/searchSummary`,
      );
      skipped += 1;
      continue;
    }
    eligibleUploadIds.push(row.id);
    inputs.push(row.summary, row.searchSummary);
  }
  if (inputs.length === 0) {
    return { embedded: 0, skipped };
  }

  const res = await createEmbeddingsTracked({
    tracking: { activity: 'embedUploadSummariesBulk' },
    model: EMBED_MODEL,
    input: inputs,
    ...(openrouterExtras as Record<string, unknown>),
  });
  invariant(
    res.data.length === inputs.length,
    `embedUploadSummariesBulk: expected ${inputs.length} embeddings, got ${res.data.length}`,
  );
  for (const [i, d] of res.data.entries()) {
    invariant(
      d.index === i,
      `embedUploadSummariesBulk: index/order mismatch at ${i}`,
    );
    invariant(
      d.embedding.length === EMBED_DIMS,
      `embedUploadSummariesBulk: bad embedding dim at ${i}`,
    );
  }

  // Write each pair in a transaction. 100 uploads × 1 round-trip each
  // is well within the live path's latency budget; if scale grows,
  // batch the UPDATEs into a single multi-statement query.
  await db.transaction(async (tx) => {
    await Promise.all(
      eligibleUploadIds.map((uploadId, i) => {
        const summaryEmb = res.data[i * 2]?.embedding;
        const searchEmb = res.data[i * 2 + 1]?.embedding;
        invariant(
          summaryEmb && searchEmb,
          `embedUploadSummariesBulk: missing embedding pair for ${uploadId}`,
        );
        return tx
          .update(UploadRecord)
          .set({
            summaryEmbedding: summaryEmb,
            searchSummaryEmbedding: searchEmb,
          })
          .where(eq(UploadRecord.id, uploadId));
      }),
    );
  });

  activityLogger.info(
    `Embedded ${eligibleUploadIds.length} upload summary pairs (${skipped} skipped)`,
  );
  return { embedded: eligibleUploadIds.length, skipped };
}
