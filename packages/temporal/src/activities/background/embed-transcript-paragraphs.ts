import { db, TranscriptParagraph } from '@letschurch/db';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { invariant } from 'es-toolkit';

import {
  createEmbeddingsTracked,
  EMBED_DIMS,
  EMBED_MAX_INPUTS,
  EMBED_MODEL,
} from '../../util/llm';
import logger from '../../util/logger';

const moduleLogger = logger.child({
  module: 'temporal/activities/background/embed-transcript-paragraphs',
});

/**
 * Embed `transcript_paragraph` rows with `openai/text-embedding-3-small`
 * (1536 dims) through OpenAI's standard Embeddings API, then persist vectors.
 *
 * Idempotency: by default (`force: false`) only rows where `embedding IS
 * NULL` are sent — parent-workflow retries that re-enter this activity
 * after a flake don't re-bill tokens or write duplicate `llm_call` rows
 * for paragraphs whose previous attempt already landed. Production
 * callers leave `force=false`: paragraph text is stable across summary-
 * prompt changes, so re-running the seed scripts or admin "Regenerate
 * Summary" doesn't need to re-embed. The `force` knob exists for the
 * (currently unused) case of a paragraph-segmentation rerun where the
 * underlying text actually changed.
 *
 * Chunking: OpenAI's embeddings endpoint caps `input` at 2048 strings per
 * request (`EMBED_MAX_INPUTS`); long uploads exceed that. We slice the
 * pending rows into chunks and write each chunk's vectors in its own
 * transaction so a flake mid-job leaves the durable rows intact for the
 * next retry to skip past.
 */
export default async function embedTranscriptParagraphs(
  uploadRecordId: string,
  options: { force?: boolean } = {},
) {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'embedTranscriptParagraphs',
    context: { args: { uploadRecordId } },
  });
  const force = options.force ?? false;

  const rows = await db
    .select({ id: TranscriptParagraph.id, text: TranscriptParagraph.text })
    .from(TranscriptParagraph)
    .where(
      force
        ? eq(TranscriptParagraph.uploadRecordId, uploadRecordId)
        : and(
            eq(TranscriptParagraph.uploadRecordId, uploadRecordId),
            isNull(TranscriptParagraph.embedding),
          ),
    )
    .orderBy(asc(TranscriptParagraph.order));

  if (rows.length === 0) {
    activityLogger.info(
      force ? 'No paragraphs to embed' : 'All paragraphs already embedded',
    );
    return { paragraphs: 0 };
  }

  const chunkCount = Math.ceil(rows.length / EMBED_MAX_INPUTS);
  activityLogger.info(
    `Embedding ${rows.length} paragraphs across ${chunkCount} chunk(s)` +
      (force ? ' (force)' : ''),
  );

  let embedded = 0;
  for (let chunkIdx = 0; chunkIdx < chunkCount; chunkIdx++) {
    const start = chunkIdx * EMBED_MAX_INPUTS;
    const slice = rows.slice(start, start + EMBED_MAX_INPUTS);
    const res = await createEmbeddingsTracked({
      tracking: { activity: 'embedTranscriptParagraphs', uploadRecordId },
      model: EMBED_MODEL,
      input: slice.map((r) => r.text),
    });

    invariant(
      res.data.length === slice.length,
      `Embedding count mismatch on chunk ${chunkIdx}: expected ${slice.length}, got ${res.data.length}`,
    );
    for (const [i, d] of res.data.entries()) {
      invariant(
        d.index === i,
        `Embedding index mismatch on chunk ${chunkIdx} pos ${i}: got ${d.index}`,
      );
      invariant(
        d.embedding.length === EMBED_DIMS,
        `Embedding dim mismatch on chunk ${chunkIdx} pos ${i}: got ${d.embedding.length}`,
      );
    }

    await db.transaction(async (tx) => {
      await Promise.all(
        slice.map((r, i) =>
          tx
            .update(TranscriptParagraph)
            .set({ embedding: res.data[i]?.embedding })
            .where(eq(TranscriptParagraph.id, r.id)),
        ),
      );
    });
    embedded += slice.length;
  }

  activityLogger.info(`Embedded ${embedded} paragraphs`);
  return { paragraphs: embedded };
}
