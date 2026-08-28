import {
  ApplicationFailure,
  executeChild,
  setCurrentDetails,
} from '@temporalio/workflow';

import { BACKGROUND_QUEUE } from '../../queues';
import { UPLOAD_ID_KEY } from '../../search-attributes';
import { indexDocumentWorkflow } from './index-document';
import {
  embedTranscriptParagraphsDirect,
  embedUploadDirect,
  summarizeUploadFlex,
} from './llm-flex';

export type SummarizeUploadOptions = {
  /**
   * When true, paragraph embeddings are also (re)computed in parallel with
   * the summary chain. Set by `processMediaWorkflow` on the initial
   * transcribe path — paragraphs are fresh and need embedding for the first
   * time. Defaults to false for the admin "Regenerate Summary" path:
   * paragraph text is stable across summary prompt changes, so re-embedding
   * them is wasted spend.
   */
  embedParagraphs?: boolean;
  /**
   * When true, recompute results even when persisted values already exist.
   * Default false lets workflow retries skip work that already landed. Admin
   * "Regenerate Summary" passes `force: true`.
   */
  force?: boolean;
};

/**
 * LLM summary + embeddings post-processing pipeline.
 *
 *   Flex summary → direct summary embeddings (sequential)
 *   direct paragraph embeddings (parallel, opt-in)
 *   → media indexer (lc_media_v1)
 *
 * Called as a child workflow from `processMediaWorkflow` on the transcribe
 * path (with `embedParagraphs: true`), and as a top-level workflow from the
 * admin `regenerateUploadSummary` tRPC mutation (default options) when an
 * operator wants to spot-fix a summary without re-transcribing. Does NOT
 * run the annotation pipeline — that's `annotateTranscriptWorkflow`, called
 * separately. Splitting them lets admins regenerate one without paying for
 * the other.
 * Chat completions use OpenAI Flex. Embeddings call the standard endpoint
 * directly because Flex does not support the Embeddings API.
 */
export async function summarizeUploadWorkflow(
  uploadRecordId: string,
  { embedParagraphs = false, force = false }: SummarizeUploadOptions = {},
) {
  setCurrentDetails('Summarizing via OpenAI Flex & embedding paragraphs');
  const [summaryResult, paragraphResult] = await Promise.allSettled([
    summarizeUploadFlex(uploadRecordId, { force }),
    embedParagraphs
      ? embedTranscriptParagraphsDirect(uploadRecordId, { force })
      : Promise.resolve(null),
  ]);

  let summaryEmbeddingError: unknown = null;
  if (summaryResult.status === 'fulfilled') {
    try {
      setCurrentDetails('Embedding summary');
      await embedUploadDirect(uploadRecordId, { force });
    } catch (error) {
      summaryEmbeddingError = error;
    }
  }

  throwCombinedFlexFailures([
    summaryResult.status === 'rejected' ? summaryResult.reason : null,
    paragraphResult.status === 'rejected' ? paragraphResult.reason : null,
    summaryEmbeddingError,
  ]);

  setCurrentDetails('Indexing media');
  // Unique child workflow id per invocation. `Date.now()` is deterministic
  // inside a workflow execution (Temporal records it in history and replays
  // the same value), but differs across executions — so retries get fresh
  // child ids without colliding.
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

function throwCombinedFlexFailures(errors: ReadonlyArray<unknown>): void {
  const failures = errors.filter((error) => error !== null);
  if (failures.length === 0) return;
  if (failures.length === 1) throw failures[0];
  throw ApplicationFailure.retryable(
    `summarizeUploadWorkflow: multiple Flex/direct stages failed: ${failures
      .map((error) => (error instanceof Error ? error.message : String(error)))
      .join('; ')}`,
    'OpenAIFlexStagesFailed',
  );
}
