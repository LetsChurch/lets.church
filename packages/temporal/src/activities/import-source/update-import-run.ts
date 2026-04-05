import {
  ChannelImportRun,
  type ChannelImportRunStatus,
  db,
} from '@letschurch/db';
import { eq } from 'drizzle-orm';

type ChannelImportRunStatusValue =
  (typeof ChannelImportRunStatus.enumValues)[number];

type UpdateImportRunData = {
  status?: ChannelImportRunStatusValue;
  itemsFound?: number;
  itemsImported?: number;
  itemsSkipped?: number;
  itemsFailed?: number;
  errorMessage?: string;
  errorDetails?: unknown;
};

/**
 * Update import run with stats and status.
 */
export async function updateImportRun(
  runId: string,
  data: UpdateImportRunData,
) {
  await db
    .update(ChannelImportRun)
    .set({
      ...data,
      completedAt:
        data.status && data.status !== 'IN_PROGRESS' ? new Date() : undefined,
    })
    .where(eq(ChannelImportRun.id, runId));
}
