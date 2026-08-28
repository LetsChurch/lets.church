import { proxyActivities } from '@temporalio/workflow';

import type * as backgroundActivities from '../../activities/background';
import { BACKGROUND_QUEUE } from '../../queues';

// Flex may return 429 Resource Unavailable without charging. A 75-minute
// activity ceiling accommodates the one-hour HTTP timeout plus prompt/DB work;
// Temporal then retries durably for three days. The capped interval avoids
// multi-hour gaps while still backing off to modest API load. Embeddings share
// this policy during the direct-API cutover, but remain on the standard tier
// because OpenAI Flex only supports Responses and Chat Completions.
export const {
  annotateTranscript: annotateTranscriptFlex,
  summarizeUpload: summarizeUploadFlex,
  embedUpload: embedUploadDirect,
  embedTranscriptParagraphs: embedTranscriptParagraphsDirect,
} = proxyActivities<typeof backgroundActivities>({
  startToCloseTimeout: '75 minutes',
  scheduleToCloseTimeout: '3 days',
  taskQueue: BACKGROUND_QUEUE,
  retry: {
    initialInterval: '1 minute',
    backoffCoefficient: 2,
    maximumInterval: '30 minutes',
  },
});
