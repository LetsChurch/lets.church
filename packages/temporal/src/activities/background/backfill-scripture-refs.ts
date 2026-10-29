import {
  Annotation,
  db,
  TranscriptParagraph,
  UploadRecord,
} from '@letschurch/db';
import { heartbeat } from '@temporalio/activity';
import {
  and,
  asc,
  count,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  lt,
} from 'drizzle-orm';
import pRetry from 'p-retry';

import logger from '../../util/logger';
import { augmentBibleAnnotations } from '../../util/scripture';
import {
  lockUploadAnnotations,
  type ResolvedAnnotation,
} from './annotate-transcript';
import indexDocument from './index-document';

const moduleLogger = logger.child({
  module: 'temporal/activities/background/backfill-scripture-refs',
});

export type BackfillScriptureRefsBatchParams = {
  /** Inclusive lower bound of this shard's uuid range (see util/uuid-shards). */
  lo: string;
  /** Exclusive upper bound; null on the last shard. */
  hi: string | null;
  /** Keyset cursor: the last upload this shard processed, exclusive. */
  after: string | null;
  batchSize: number;
};

export type BackfillScriptureRefsBatchResult = {
  processed: number;
  /** Uploads whose BIBLE annotations changed (and were reindexed). */
  changed: number;
  lastId: string | null;
  hasMore: boolean;
};

export async function getBackfillScriptureRefsCount(): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(UploadRecord)
    .where(isNotNull(UploadRecord.transcribingFinishedAt));
  return row?.count ?? 0;
}

// Order-independent identity of a set of BIBLE annotations, to skip writes
// (and reindexes) for uploads the layers don't change.
function signature(annotations: readonly ResolvedAnnotation[]): string {
  return annotations
    .filter((a) => a.kind === 'BIBLE')
    .map((a) => {
      const meta = Object.entries(a.metadata).sort(([x], [y]) =>
        x.localeCompare(y),
      );
      return `${a.paragraphId}:${a.startWord}:${a.endWord}:${JSON.stringify(meta)}`;
    })
    .sort()
    .join('\n');
}

/**
 * Re-derive one upload's BIBLE annotations: the stored ones stand in for the
 * LLM layer (no LLM call), merged with the deterministic layers exactly as the
 * annotate activity now does for new uploads. Returns whether anything
 * changed. Rerunning is a no-op: the stored result already contains every
 * deterministic reference, so the merge reproduces it.
 */
export async function backfillScriptureRefsForUpload(
  uploadRecordId: string,
): Promise<boolean> {
  const upload = await db.query.UploadRecord.findFirst({
    columns: { title: true, description: true },
    where: (t, { eq }) => eq(t.id, uploadRecordId),
  });
  if (!upload) return false;
  const paragraphs = await db
    .select({
      id: TranscriptParagraph.id,
      order: TranscriptParagraph.order,
      text: TranscriptParagraph.text,
    })
    .from(TranscriptParagraph)
    .where(eq(TranscriptParagraph.uploadRecordId, uploadRecordId))
    .orderBy(asc(TranscriptParagraph.order));
  if (paragraphs.length === 0) return false;

  const paragraphIds = paragraphs.map((p) => p.id);

  // Read, merge and write in one transaction under the upload's annotation
  // lock: a concurrent re-annotate waits for us and then replaces our rows,
  // or runs first and we read its fresh rows — never both sets, never stale
  // LLM output merged over fresh.
  return db.transaction(async (tx) => {
    await lockUploadAnnotations(tx, uploadRecordId);
    const rows = await tx
      .select({
        id: Annotation.id,
        paragraphId: Annotation.paragraphId,
        kind: Annotation.kind,
        startWord: Annotation.startWord,
        endWord: Annotation.endWord,
        rawSpan: Annotation.rawSpan,
        metadata: Annotation.metadata,
      })
      .from(Annotation)
      .where(inArray(Annotation.paragraphId, paragraphIds));
    // An upload the LLM hasn't annotated yet (pending, or a failed annotate)
    // must stay empty: annotateTranscript skips any upload that already has
    // annotation rows, so writing ours would cost it its outline and keywords.
    if (rows.length === 0) return false;
    const existing = rows.filter((a) => a.kind === 'BIBLE');

    const { annotations, invalid } = augmentBibleAnnotations(
      paragraphs.map((p) => ({ ...p, words: [] })),
      upload,
      existing,
    );
    if (signature(annotations) === signature(existing)) return false;
    if (invalid.length > 0) {
      moduleLogger.info(
        {
          uploadRecordId,
          context: { dropped: invalid.map((a) => a.metadata) },
        },
        'Dropping BIBLE annotations that name a chapter/verse that does not exist',
      );
    }

    await tx
      .delete(Annotation)
      .where(
        and(
          inArray(Annotation.paragraphId, paragraphIds),
          eq(Annotation.kind, 'BIBLE'),
        ),
      );
    if (annotations.length > 0) {
      const now = new Date();
      await tx
        .insert(Annotation)
        .values(annotations.map((a) => ({ ...a, updatedAt: now })));
    }
    return true;
  });
}

export async function backfillScriptureRefsBatch({
  lo,
  hi,
  after,
  batchSize,
}: BackfillScriptureRefsBatchParams): Promise<BackfillScriptureRefsBatchResult> {
  const rows = await db
    .select({ id: UploadRecord.id })
    .from(UploadRecord)
    .where(
      and(
        after ? gt(UploadRecord.id, after) : gte(UploadRecord.id, lo),
        hi ? lt(UploadRecord.id, hi) : undefined,
        isNotNull(UploadRecord.transcribingFinishedAt),
      ),
    )
    .orderBy(asc(UploadRecord.id))
    .limit(batchSize);

  let changed = 0;
  for (const [done, { id }] of rows.entries()) {
    try {
      if (await backfillScriptureRefsForUpload(id)) {
        changed += 1;
        // The verse/book facets are derived from BIBLE annotations at index
        // time. Window embeddings are cached, so this is a warm reindex.
        // Retried here because a rerun won't revisit it: the rows already
        // match, so a failure leaves stale facets until the next reindex.
        await pRetry(() => indexDocument('media', id, { refresh: false }), {
          retries: 3,
        });
      }
    } catch (err) {
      // If the rows were rewritten but the reindex failed, a media reindex (or
      // any edit to the upload) refreshes its facets.
      moduleLogger.error(
        `Failed to backfill scripture refs for ${id}, skipping: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    heartbeat({ done: done + 1, total: rows.length });
  }

  moduleLogger.info(
    `Scripture refs batch complete: after=${after ?? lo} processed=${rows.length} changed=${changed}`,
  );
  return {
    processed: rows.length,
    changed,
    lastId: rows.at(-1)?.id ?? null,
    hasMore: rows.length === batchSize,
  };
}
