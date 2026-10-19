import { condition, proxyActivities, setHandler } from '@temporalio/workflow';

import type * as activities from '../../activities/background';
import { BACKGROUND_QUEUE } from '../../queues';
import { emptySignal } from '../../refs';

const { getScheduledPublish, publishScheduledUpload, indexDocument } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: '1 minute',
    taskQueue: BACKGROUND_QUEUE,
    retry: { maximumInterval: '5 minutes' },
  });

/**
 * Durable timer for an upload's scheduled publish. One per upload (stable
 * workflow id), started or woken with signal-with-start whenever the schedule
 * columns change. Each pass re-reads the schedule from the DB, sleeps until
 * it is due (or until signalled), then publishes and reindexes. Exits once
 * nothing is scheduled.
 */
export async function scheduledPublishUploadWorkflow(uploadRecordId: string) {
  let changed = false;
  setHandler(emptySignal, () => {
    changed = true;
  });

  for (;;) {
    changed = false;
    const at = await getScheduledPublish(uploadRecordId);
    if (!at) {
      return;
    }

    const delay = Date.parse(at) - Date.now();
    if (delay > 0 && (await condition(() => changed, delay))) {
      // Schedule edited or cleared while we slept; re-read it.
      continue;
    }

    if (await publishScheduledUpload(uploadRecordId, at)) {
      await indexDocument('media', uploadRecordId);
    }
  }
}
