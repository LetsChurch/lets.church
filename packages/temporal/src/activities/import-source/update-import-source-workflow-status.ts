import {
  ChannelImportSource,
  type ChannelImportSourceWorkflowStatus,
  db,
} from '@letschurch/db';
import { eq } from 'drizzle-orm';

type ChannelImportSourceWorkflowStatusValue =
  (typeof ChannelImportSourceWorkflowStatus.enumValues)[number];

/**
 * Update import source workflow status.
 */
export async function updateImportSourceWorkflowStatus(
  importSourceId: string,
  status: ChannelImportSourceWorkflowStatusValue,
  workflowId?: string,
) {
  await db
    .update(ChannelImportSource)
    .set({
      workflowStatus: status,
      workflowId: workflowId || null,
      updatedAt: new Date(),
    })
    .where(eq(ChannelImportSource.id, importSourceId));
}
