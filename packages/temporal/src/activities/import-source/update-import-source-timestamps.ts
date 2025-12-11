import { prisma } from '@letschurch/db';

/**
 * Update import source timestamps after a successful import.
 */
export async function updateImportSourceTimestamps(
  importSourceId: string,
  lastImportedUploadDate?: Date,
) {
  await prisma.channelImportSource.update({
    where: { id: importSourceId },
    data: {
      lastImportedAt: new Date(),
      lastSuccessfulImportAt: new Date(),
      ...(lastImportedUploadDate && { lastImportedUploadDate }),
    },
  });
}
