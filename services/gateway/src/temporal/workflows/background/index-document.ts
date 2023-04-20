import {
  defineSignal,
  proxyActivities,
  setHandler,
} from '@temporalio/workflow';
import type * as activities from '../../activities/background';
import type { DocumentKind } from '../../activities/background/index-document';

const { indexDocument: indexDocumentActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: '1 minute',
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
    await indexDocumentActivity(kind, uploadRecordId, s3UploadKey);
  } while (receivedUpdate);
}
