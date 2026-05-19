import {
  continueAsNew,
  ParentClosePolicy,
  proxyActivities,
  startChild,
} from '@temporalio/workflow';
import type * as backgroundActivities from '../../activities/background';
import { BACKGROUND_QUEUE, PRIORITY_REPROCESS } from '../../queues';
import type { RemuxScope } from '../../remux-scope';
import {
  CHANNEL_ID_KEY,
  CHANNEL_SLUG_KEY,
  UPLOAD_ID_KEY,
  USER_ID_KEY,
  USERNAME_KEY,
} from '../../search-attributes';
import { remuxMediaWorkflow } from './remux-media';

const { getRemuxBatch } = proxyActivities<typeof backgroundActivities>({
  startToCloseTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 3 },
});

const BATCH_SIZE = 100;

export async function remuxAllWorkflow(
  scope: RemuxScope = { kind: 'legacy' },
  cursor: string | null = null,
): Promise<void> {
  const { items, nextCursor } = await getRemuxBatch(scope, BATCH_SIZE, cursor);

  for (const item of items) {
    try {
      await startChild(remuxMediaWorkflow, {
        workflowId: `remuxUpload:${item.id}`,
        args: [item.id],
        taskQueue: BACKGROUND_QUEUE,
        parentClosePolicy: ParentClosePolicy.ABANDON,
        priority: { priorityKey: PRIORITY_REPROCESS },
        retry: { maximumAttempts: 2 },
        typedSearchAttributes: [
          { key: UPLOAD_ID_KEY, value: item.id },
          { key: CHANNEL_ID_KEY, value: item.channelId },
          { key: CHANNEL_SLUG_KEY, value: item.channelSlug },
          { key: USER_ID_KEY, value: item.appUserId },
          { key: USERNAME_KEY, value: item.username },
        ],
      });
    } catch (err) {
      if (
        err instanceof Error &&
        err.name === 'WorkflowExecutionAlreadyStartedError'
      ) {
        continue;
      }
      throw err;
    }
  }

  if (nextCursor !== null) {
    await continueAsNew<typeof remuxAllWorkflow>(scope, nextCursor);
  }
}
