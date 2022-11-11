import {
  condition,
  continueAsNew,
  defineSignal,
  proxyActivities,
  setHandler,
} from '@temporalio/workflow';
import type * as activities from '../../activities/background';
import type { DocumentType } from '../../activities/background/index-document';

const { indexDocument: indexDocumentActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: '1 minute',
});

export const indexDocumentSignal = defineSignal('indexDocument');

export default async function indexDocument(kind: DocumentType, id: string) {
  let debouncing = false;

  setHandler(indexDocumentSignal, () => void (debouncing = true));

  while (await condition(() => debouncing, '15 seconds')) {
    debouncing = false;
  }

  await indexDocumentActivity(kind, id);

  if (debouncing) {
    await continueAsNew(kind, id);
  }
}
