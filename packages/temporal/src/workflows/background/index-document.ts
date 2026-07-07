import { proxyActivities, setHandler } from '@temporalio/workflow';

import type * as activities from '../../activities/background';
import type { DocumentKind } from '../../activities/background/index-document';
import { BACKGROUND_QUEUE } from '../../queues';
import { emptySignal } from '../../refs';

const { indexDocument: indexDocumentActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 5 },
});

export async function indexDocumentWorkflow(
  kind: DocumentKind,
  uploadRecordId: string,
) {
  let receivedUpdate = false;

  setHandler(emptySignal, () => {
    receivedUpdate = true;
  });

  do {
    receivedUpdate = false;
    await indexDocumentActivity(kind, uploadRecordId);
  } while (receivedUpdate);
}
