import { ChannelImportSource, db } from '@letschurch/db';
import { eq } from 'drizzle-orm';

/**
 * Update import source timestamps after a successful import.
 */
export async function updateImportSourceTimestamps(
  importSourceId: string,
  lastImportedUploadDate?: Date | string,
) {
  await db
    .update(ChannelImportSource)
    .set({
      lastImportedAt: new Date(),
      lastSuccessfulImportAt: new Date(),
      ...(lastImportedUploadDate && {
        lastImportedUploadDate: new Date(lastImportedUploadDate),
      }),
      updatedAt: new Date(),
    })
    .where(eq(ChannelImportSource.id, importSourceId));
}
