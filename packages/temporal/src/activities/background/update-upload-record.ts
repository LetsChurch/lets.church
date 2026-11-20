import { db, UploadRecord } from '@letschurch/db';
import { eq, sql } from 'drizzle-orm';

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

/**
 * An auto-generated default thumbnail (from transcoding) must not override an
 * editor's choice to show the channel default. Guard it in the same UPDATE so
 * a concurrent "use channel default" can't race past a read-then-write check.
 */
function guardDefaultThumbnail(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...data };
  // Only transcoding writes the default thumbnail, and it's always the
  // automatic frame. A transcode worker from before `autoThumbnailPath`
  // existed sends only the default: record it as the automatic frame too, or
  // with the guard below skipping the default it would be lost entirely.
  if (
    result.defaultThumbnailPath !== undefined &&
    result.autoThumbnailPath === undefined
  ) {
    result.autoThumbnailPath = result.defaultThumbnailPath;
    result.autoThumbnailBlurhash = result.defaultThumbnailBlurhash ?? null;
  }
  for (const [field, column] of [
    ['defaultThumbnailPath', UploadRecord.defaultThumbnailPath],
    ['defaultThumbnailBlurhash', UploadRecord.defaultThumbnailBlurhash],
  ] as const) {
    // An explicit undefined means "leave it alone", as Drizzle's .set() treats
    // it; only a real value (including null) is a write to guard.
    if (result[field] !== undefined) {
      result[field] =
        sql`case when ${UploadRecord.useChannelDefaultThumbnail} then ${column} else ${result[field]} end`;
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
    .set({
      ...guardDefaultThumbnail(coerceDates(data)),
      updatedAt: new Date(),
    } as unknown as Partial<typeof UploadRecord.$inferInsert>)
    .where(eq(UploadRecord.id, uploadRecordId));
}
