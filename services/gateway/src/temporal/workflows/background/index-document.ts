import {
  condition,
  continueAsNew,
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
  let debouncing = false;

  setHandler(indexDocumentSignal, () => void (debouncing = true));

  while (await condition(() => debouncing, '15 seconds')) {
    debouncing = false;
  }

  await indexDocumentActivity(kind, uploadRecordId, s3UploadKey);

  if (debouncing) {
    await continueAsNew(kind, uploadRecordId, s3UploadKey);
  }
}
