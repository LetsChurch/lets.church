import { db, UploadRecord } from '@letschurch/db';
import { eq } from 'drizzle-orm';
import type { UploadRecordUpdateData } from '../../client';

const DATE_FIELDS: ReadonlyArray<keyof UploadRecordUpdateData> = [
  'publishedAt',
  'transcodingStartedAt',
  'transcodingFinishedAt',
  'transcribingStartedAt',
  'transcribingFinishedAt',
  'uploadFinalizedAt',
  'scoreStaleAt',
];

function coerceDates(data: UploadRecordUpdateData): UploadRecordUpdateData {
  const result = { ...data };
  for (const field of DATE_FIELDS) {
    const val = result[field];
    if (typeof val === 'string') {
      (result as Record<string, unknown>)[field] = new Date(val);
    }
  }
  return result;
}

export default async function updateUploadRecord(
  uploadRecordId: string,
  data: UploadRecordUpdateData,
) {
  await db
    .update(UploadRecord)
    .set({ ...coerceDates(data), updatedAt: new Date() } as unknown as Partial<
      typeof UploadRecord.$inferInsert
    >)
    .where(eq(UploadRecord.id, uploadRecordId));
}
