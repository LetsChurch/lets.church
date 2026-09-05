import {
  ApplicationFailure,
  executeChild,
  setCurrentDetails,
} from '@temporalio/workflow';

import { BACKGROUND_QUEUE } from '../../queues';
import { UPLOAD_ID_KEY } from '../../search-attributes';
import {
  DETERMINISTIC_LLM_FALLBACK_FAILURE,
  isDeterministicLlmFallbackFailure,
} from '../../util/llm-completion-guards';
import { indexDocumentWorkflow } from './index-document';
import { annotateTranscriptFlex } from './llm-flex';

export type AnnotateTranscriptOptions = {
  /**
   * When true, recompute annotations even when rows already exist. Default
   * false lets activity retries skip persisted work. Admin "Regenerate
   * Annotations" passes `force: true`.
   */
  force?: boolean;
};

/**
 * Annotation pipeline.
 *
 *   OpenAI Flex annotation → media indexer (lc_media_v1)
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
  setCurrentDetails('Annotating transcript via OpenAI Flex');
  try {
    await annotateTranscriptFlex(uploadRecordId, { force });
  } catch (error) {
    if (isDeterministicLlmFallbackFailure(error)) {
      throw ApplicationFailure.nonRetryable(
        error instanceof Error ? error.message : String(error),
        DETERMINISTIC_LLM_FALLBACK_FAILURE,
      );
    }
    throw error;
  }

  setCurrentDetails('Indexing media');
  await executeChild(indexDocumentWorkflow, {
    workflowId: `media:${uploadRecordId}:${Date.now()}`,
    args: ['media', uploadRecordId],
    taskQueue: BACKGROUND_QUEUE,
    // Propagate UploadId so the grandchild media indexer is filterable by
    // upload in the Temporal UI, same as the rest of the tree.
    typedSearchAttributes: [{ key: UPLOAD_ID_KEY, value: uploadRecordId }],
    retry: { maximumAttempts: 2 },
  });
}
