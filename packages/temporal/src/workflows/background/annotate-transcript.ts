import {
  executeChild,
  patched,
  proxyActivities,
  setCurrentDetails,
} from '@temporalio/workflow';

import type * as backgroundActivities from '../../activities/background';
import { BACKGROUND_QUEUE, PRIORITY_USER } from '../../queues';
import { UPLOAD_ID_KEY } from '../../search-attributes';
import { indexDocumentWorkflow } from './index-document';
import { runLlmBatch } from './llm-batch';

const ALWAYS_BATCH_ANNOTATE_PATCH = 'always-batch-annotate-v1';

// Replay-only live path for executions that started before annotation moved to
// OpenAI Batch. Remove after all pre-patch histories have closed and the patch
// has gone through Temporal's normal deprecation lifecycle.
const { annotateTranscript } = proxyActivities<typeof backgroundActivities>({
  startToCloseTimeout: '10 minute',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 3 },
});

export type AnnotateTranscriptOptions = {
  /**
   * When true, submit annotation even when rows already exist. Default false:
   * the Batch submit activity skips completed work so workflow retries do not
   * re-bill tokens. Admin "Regenerate Annotations" passes `force: true`.
   */
  force?: boolean;
};

/**
 * Annotation pipeline.
 *
 *   OpenAI annotation batch → media indexer (lc_media_v1)
 *
 * Called before `summarizeUploadWorkflow` on processMedia's transcribe path so
 * its OUTLINE rows are available to the summary prompt, and as a top-level
 * workflow from the admin `regenerateUploadAnnotations` mutation. It remains
 * independent so an admin can regenerate annotations without paying for a
 * new summary.
 *
 * The downstream media reindex is the same `indexDocumentWorkflow` the
 * summary path triggers — racing two reindexes for the same upload is fine,
 * lc_media_v1 reads the current row state from the DB.
 */
export async function annotateTranscriptWorkflow(
  uploadRecordId: string,
  { force = false }: AnnotateTranscriptOptions = {},
) {
  const alwaysBatch = patched(ALWAYS_BATCH_ANNOTATE_PATCH);
  if (alwaysBatch) {
    setCurrentDetails('Annotating transcript via OpenAI Batch');
    await runLlmBatch([uploadRecordId], 'annotate', { force });
  } else {
    setCurrentDetails('Annotating transcript');
    await annotateTranscript(uploadRecordId, { force });
  }

  setCurrentDetails('Indexing media');
  await executeChild(indexDocumentWorkflow, {
    workflowId: `media:${uploadRecordId}:${Date.now()}`,
    args: ['media', uploadRecordId],
    taskQueue: BACKGROUND_QUEUE,
    ...(alwaysBatch ? {} : { priority: { priorityKey: PRIORITY_USER } }),
    // Propagate UploadId so the grandchild media indexer is filterable by
    // upload in the Temporal UI, same as the rest of the tree.
    typedSearchAttributes: [{ key: UPLOAD_ID_KEY, value: uploadRecordId }],
    retry: { maximumAttempts: 2 },
  });
}
