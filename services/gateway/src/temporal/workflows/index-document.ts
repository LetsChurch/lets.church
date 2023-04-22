import {
  defineSignal,
  proxyActivities,
  setHandler,
} from '@temporalio/workflow';
import type * as activities from '../activities/background';
import type { DocumentKind } from '../activities/background/index-document';
import { BACKGROUND_QUEUE } from '../queues';

const { indexDocument: indexDocumentActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
});

export const indexDocumentSignal = defineSignal('indexDocument');

export async function indexDocumentWorkflow(
  kind: DocumentKind,
  uploadRecordId: string,
  s3UploadKey?: string,
) {
  let receivedUpdate = false;

  setHandler(indexDocumentSignal, () => void (receivedUpdate = true));

  do {
    receivedUpdate = false;
    await Promise.all([
      indexDocumentActivity(kind, uploadRecordId, s3UploadKey),
      // If this is an upload make sure we additionally index any changes to the transcript
      ...(kind === 'upload'
        ? [
            indexDocumentActivity(
              'transcript',
              uploadRecordId,
              `${uploadRecordId}/transcript.vtt`,
            ),
          ]
        : []),
    ]);
  } while (receivedUpdate);
}
