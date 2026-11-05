// Transaction helpers shared by every writer of an upload's annotations
// (annotation, the Scripture backfill, transcript replacement) and the study
// guide generator. Kept apart from annotate-transcript so importing them
// doesn't load the LLM client and its environment.

import { type db, StudyGuide } from '@letschurch/db';
import { eq, sql } from 'drizzle-orm';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Serialize writers of one upload's annotations (annotation and the
 * Scripture backfill) for the rest of the transaction. Row locks aren't
 * enough: rows a writer inserts are invisible to a concurrent DELETE that
 * already took its snapshot, so both writers' rows would survive.
 */
export async function lockUploadAnnotations(
  tx: Transaction,
  uploadRecordId: string,
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`annotations:${uploadRecordId}`}, 0))`,
  );
}

/**
 * Drop the upload's study guide inside an annotation rewrite: its passages
 * and outline come from these rows, so the next request regenerates it.
 */
export async function invalidateStudyGuide(
  tx: Transaction,
  uploadRecordId: string,
): Promise<void> {
  await tx
    .delete(StudyGuide)
    .where(eq(StudyGuide.uploadRecordId, uploadRecordId));
}
