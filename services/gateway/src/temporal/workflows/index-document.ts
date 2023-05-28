import { proxyActivities, setHandler } from '@temporalio/workflow';
import type * as activities from '../activities/background';
import type { DocumentKind } from '../activities/background/index-document';
import { BACKGROUND_QUEUE } from '../queues';
import { emptySignal } from '../signals';

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
  s3UploadKey?: string,
) {
  let receivedUpdate = false;

  setHandler(emptySignal, () => void (receivedUpdate = true));

  do {
    receivedUpdate = false;
    await Promise.all([
      indexDocumentActivity(kind, uploadRecordId, s3UploadKey),
      // TODO: nothing actually changes transcripts yet
      // If this is an upload make sure we additionally index any changes to the transcript
      /* ...(kind === 'upload' */
      /*   ? [ */
      /*       indexDocumentActivity( */
      /*         'transcript', */
      /*         uploadRecordId, */
      /*         `${uploadRecordId}/transcript.vtt`, */
      /*       ), */
      /*     ] */
      /*   : []), */
    ]);
  } while (receivedUpdate);
}
