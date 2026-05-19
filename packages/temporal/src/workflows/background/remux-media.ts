import {
  executeChild,
  proxyActivities,
  workflowInfo,
} from '@temporalio/workflow';
import type * as backgroundActivities from '../../activities/background';
import type * as transcodeActivities from '../../activities/transcode';
import { BACKGROUND_QUEUE, PRIORITY_USER, TRANSCODE_QUEUE } from '../../queues';
import { indexDocumentWorkflow } from './index-document';

const { sendUploadErrorNotification } = proxyActivities<
  typeof backgroundActivities
>({
  startToCloseTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 3 },
});

const { remux } = proxyActivities<typeof transcodeActivities>({
  startToCloseTimeout: '180 minutes',
  heartbeatTimeout: '10 minutes',
  taskQueue: TRANSCODE_QUEUE,
  retry: { maximumAttempts: 2 },
});

export async function remuxMediaWorkflow(targetId: string) {
  try {
    await remux(targetId);

    await executeChild(indexDocumentWorkflow, {
      workflowId: `upload:remux:${targetId}`,
      args: ['upload', targetId],
      taskQueue: BACKGROUND_QUEUE,
      priority: { priorityKey: PRIORITY_USER },
      retry: { maximumAttempts: 2 },
    });
  } catch (err) {
    const { attempt, retryPolicy } = workflowInfo();
    const maxAttempts = retryPolicy?.maximumAttempts ?? 1;
    if (attempt >= maxAttempts) {
      await sendUploadErrorNotification(
        targetId,
        err instanceof Error ? err.message : String(err),
      );
    }
    throw err;
  }
}
