import { prisma } from '@letschurch/db';

/**
 * Fetch import source from database.
 */
export async function getImportSource(importSourceId: string) {
  const source = await prisma.channelImportSource.findUnique({
    where: { id: importSourceId },
    include: {
      channel: {
        select: {
          id: true,
          slug: true,
          name: true,
        },
      },
      createdBy: {
        select: {
          id: true,
          username: true,
        },
      },
    },
  });

  if (!source) {
    throw new Error(`Import source ${importSourceId} not found`);
  }

  return source;
}
