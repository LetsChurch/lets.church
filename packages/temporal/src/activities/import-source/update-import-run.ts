import type { ChannelImportRunStatus, Prisma } from '@letschurch/db';
import { prisma } from '@letschurch/db';

type UpdateImportRunData = {
  status?: ChannelImportRunStatus;
  itemsFound?: number;
  itemsImported?: number;
  itemsSkipped?: number;
  itemsFailed?: number;
  errorMessage?: string;
  errorDetails?: Prisma.InputJsonValue;
};

/**
 * Update import run with stats and status.
 */
export async function updateImportRun(
  runId: string,
  data: UpdateImportRunData,
) {
  await prisma.channelImportRun.update({
    where: { id: runId },
    data: {
      ...data,
      completedAt:
        data.status && data.status !== 'IN_PROGRESS' ? new Date() : undefined,
    },
  });
}
