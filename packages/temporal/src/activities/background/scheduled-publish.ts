import { db, UploadRecord } from '@letschurch/db';
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';

/**
 * The upload's pending scheduled publish time as an ISO string, or null when
 * nothing is scheduled (or the upload was deleted). The workflow re-reads this
 * after every signal so the DB stays the source of truth.
 */
export async function getScheduledPublish(
  uploadRecordId: string,
): Promise<string | null> {
  const row = await db.query.UploadRecord.findFirst({
    columns: { scheduledPublishAt: true },
    where: (t, { and, eq, isNull }) =>
      and(eq(t.id, uploadRecordId), isNull(t.deletedAt)),
  });
  return row?.scheduledPublishAt?.toISOString() ?? null;
}

/**
 * Flip the upload to its scheduled visibility and clear the schedule — but
 * only if the schedule still matches `expectedAt`. A schedule edited or
 * cleared (or the upload deleted) since the workflow armed its timer makes
 * this a no-op. Returns whether the upload was published.
 */
export async function publishScheduledUpload(
  uploadRecordId: string,
  expectedAt: string,
): Promise<boolean> {
  const rows = await db
    .update(UploadRecord)
    .set({
      visibility: sql`${UploadRecord.scheduledVisibility}`,
      scheduledPublishAt: null,
      scheduledVisibility: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(UploadRecord.id, uploadRecordId),
        eq(UploadRecord.scheduledPublishAt, new Date(expectedAt)),
        isNotNull(UploadRecord.scheduledVisibility),
        isNull(UploadRecord.deletedAt),
      ),
    )
    .returning({ id: UploadRecord.id });
  return rows.length > 0;
}
