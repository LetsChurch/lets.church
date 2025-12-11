import type { ChannelImportSourceWorkflowStatus } from '@letschurch/db';
import { prisma } from '@letschurch/db';

/**
 * Update import source workflow status.
 */
export async function updateImportSourceWorkflowStatus(
  importSourceId: string,
  status: ChannelImportSourceWorkflowStatus,
  workflowId?: string,
) {
  await prisma.channelImportSource.update({
    where: { id: importSourceId },
    data: {
      workflowStatus: status,
      workflowId: workflowId || null,
    },
  });
}
