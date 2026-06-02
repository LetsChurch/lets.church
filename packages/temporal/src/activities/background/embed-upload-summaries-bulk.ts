import { db, UploadRecord } from '@letschurch/db';
import { eq, inArray } from 'drizzle-orm';
import { invariant } from 'es-toolkit';
import {
  createEmbeddingsTracked,
  EMBED_DIMS,
  EMBED_MAX_INPUTS,
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

// Two inputs per upload (summary + searchSummary); cap each embeddings.create
// at the model's 2048-input limit. 1024 uploads per request is the right
// shape — most reprocess groups are <100 uploads so this still ships as a
// single round-trip in practice.
const UPLOADS_PER_EMBED_REQUEST = Math.floor(EMBED_MAX_INPUTS / 2);

/**
 * Live bulk-embed of upload summaries for the batch-reprocess group
 * workflow's phase-7. Each upload's summary + searchSummary together
 * are tiny (≤400 tokens); we send them in 2 inputs/upload chunks of up
 * to `UPLOADS_PER_EMBED_REQUEST` (1024) uploads per request to respect
 * `EMBED_MAX_INPUTS`.
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

  // Filter to uploads that actually have both summaries. Anything missing
  // (a summarize that failed earlier in the batch) is logged + counted as
  // skipped — the caller treats the skip count separately from a failure.
  const eligible: Array<{
    id: string;
    summary: string;
    searchSummary: string;
  }> = [];
  let skipped = 0;
  for (const row of rows) {
    if (!row.summary || !row.searchSummary) {
      activityLogger.warn(
        `embedUploadSummariesBulk: skipping ${row.id} — missing summary/searchSummary`,
      );
      skipped += 1;
      continue;
    }
    eligible.push({
      id: row.id,
      summary: row.summary,
      searchSummary: row.searchSummary,
    });
  }
  if (eligible.length === 0) {
    return { embedded: 0, skipped };
  }

  const chunkCount = Math.ceil(eligible.length / UPLOADS_PER_EMBED_REQUEST);
  activityLogger.info(
    `Embedding ${eligible.length} upload summary pairs across ${chunkCount} chunk(s)`,
  );

  let embedded = 0;
  for (let chunkIdx = 0; chunkIdx < chunkCount; chunkIdx++) {
    const start = chunkIdx * UPLOADS_PER_EMBED_REQUEST;
    const slice = eligible.slice(start, start + UPLOADS_PER_EMBED_REQUEST);
    const inputs: string[] = [];
    for (const row of slice) inputs.push(row.summary, row.searchSummary);

    const res = await createEmbeddingsTracked({
      tracking: { activity: 'embedUploadSummariesBulk' },
      model: EMBED_MODEL,
      input: inputs,
      ...(openrouterExtras as Record<string, unknown>),
    });
    invariant(
      res.data.length === inputs.length,
      `embedUploadSummariesBulk: expected ${inputs.length} embeddings on chunk ${chunkIdx}, got ${res.data.length}`,
    );
    for (const [i, d] of res.data.entries()) {
      invariant(
        d.index === i,
        `embedUploadSummariesBulk: index/order mismatch on chunk ${chunkIdx} at ${i}`,
      );
      invariant(
        d.embedding.length === EMBED_DIMS,
        `embedUploadSummariesBulk: bad embedding dim on chunk ${chunkIdx} at ${i}`,
      );
    }

    await db.transaction(async (tx) => {
      await Promise.all(
        slice.map((row, i) => {
          const summaryEmb = res.data[i * 2]?.embedding;
          const searchEmb = res.data[i * 2 + 1]?.embedding;
          invariant(
            summaryEmb && searchEmb,
            `embedUploadSummariesBulk: missing embedding pair for ${row.id}`,
          );
          return tx
            .update(UploadRecord)
            .set({
              summaryEmbedding: summaryEmb,
              searchSummaryEmbedding: searchEmb,
            })
            .where(eq(UploadRecord.id, row.id));
        }),
      );
    });
    embedded += slice.length;
  }

  activityLogger.info(
    `Embedded ${embedded} upload summary pairs (${skipped} skipped)`,
  );
  return { embedded, skipped };
}
