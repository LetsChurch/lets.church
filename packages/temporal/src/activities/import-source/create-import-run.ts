import { prisma } from '@letschurch/db';

/**
 * Create a new import run record.
 * Returns the created run ID.
 */
export async function createImportRun(importSourceId: string): Promise<string> {
  const run = await prisma.channelImportRun.create({
    data: {
      importSourceId,
      status: 'IN_PROGRESS',
    },
  });

  return run.id;
}
