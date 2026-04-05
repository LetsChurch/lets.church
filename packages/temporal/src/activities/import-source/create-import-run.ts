import { ChannelImportRun, db } from '@letschurch/db';

/**
 * Create a new import run record.
 * Returns the created run ID.
 */
export async function createImportRun(importSourceId: string): Promise<string> {
  const [run] = await db
    .insert(ChannelImportRun)
    .values({
      importSourceId,
      status: 'IN_PROGRESS',
      itemsFound: 0,
      itemsImported: 0,
      itemsSkipped: 0,
      itemsFailed: 0,
    })
    .returning();

  if (!run)
    throw new Error(
      `Failed to create import run for source: ${importSourceId}`,
    );
  return run.id;
}
