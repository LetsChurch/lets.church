import { proxyActivities, setHandler } from '@temporalio/workflow';

import type * as activities from '../../activities/background';
import { BACKGROUND_QUEUE } from '../../queues';
import { emptySignal } from '../../refs';

const { syncChannelDocuments } = proxyActivities<typeof activities>({
  // One throttled update-by-query over the channel's out-of-date media docs; a
  // channel-wide change on the largest channel (~37k docs at 25 docs/s) takes
  // ~25 minutes. The activity heartbeats while it polls the task.
  startToCloseTimeout: '2 hours',
  heartbeatTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 5 },
});

const { deleteSearchDocument } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 5 },
});

/**
 * Sync a channel's search docs after a channel edit (name, visibility,
 * approval). Started with signal-with-start on a stable id: a change that lands
 * while a sync is running signals it, and the loop runs once more so the final
 * pass always reads the latest row.
 */
export async function syncChannelDocumentsWorkflow(channelId: string) {
  let receivedUpdate = false;

  setHandler(emptySignal, () => {
    receivedUpdate = true;
  });

  do {
    receivedUpdate = false;
    await syncChannelDocuments(channelId);
  } while (receivedUpdate);
}

/** Remove a standalone channel/organization search doc after its row is deleted. */
export async function deleteSearchDocumentWorkflow(
  kind: 'channel' | 'organization',
  id: string,
) {
  await deleteSearchDocument(kind, id);
}
