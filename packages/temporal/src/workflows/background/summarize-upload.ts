import {
  ApplicationFailure,
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

const ALWAYS_BATCH_SUMMARIZE_PATCH = 'always-batch-summarize-v1';

// Replay-only live path for histories that were created before the Batch API
// migration. New executions always take the patched branch below.
const { summarizeUpload, embedUpload, embedTranscriptParagraphs } =
  proxyActivities<typeof backgroundActivities>({
    startToCloseTimeout: '10 minute',
    taskQueue: BACKGROUND_QUEUE,
    retry: { maximumAttempts: 3 },
  });

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
   * When true, submit the summary and embedding batches even when persisted
   * results already exist. Default false lets workflow retries skip work that
   * already landed. Admin "Regenerate Summary" passes `force: true`.
   */
  force?: boolean;
};

/**
 * LLM summary + embeddings post-processing pipeline.
 *
 *   summarize batch → summary-embedding batch (sequential)
 *   paragraph-embedding batch (parallel, opt-in)
 *   → media indexer (lc_media_v1)
 *
 * Called as a child workflow from `processMediaWorkflow` on the transcribe
 * path (with `embedParagraphs: true`), and as a top-level workflow from the
 * admin `regenerateUploadSummary` tRPC mutation (default options) when an
 * operator wants to spot-fix a summary without re-transcribing. Does NOT
 * run the annotation pipeline — that's `annotateTranscriptWorkflow`, called
 * separately. Splitting them lets admins regenerate one without paying for
 * the other.
 *
 * Every model call uses OpenAI Batch, including a single-upload admin run.
 */
export async function summarizeUploadWorkflow(
  uploadRecordId: string,
  { embedParagraphs = false, force = false }: SummarizeUploadOptions = {},
) {
  const alwaysBatch = patched(ALWAYS_BATCH_SUMMARIZE_PATCH);
  if (alwaysBatch) {
    // Wait for both first-wave batches to settle so one failure does not
    // abandon another submitted OpenAI batch. Summary embeddings form a second
    // wave because their inputs do not exist until summary output is persisted.
    setCurrentDetails('Summarizing & embedding paragraphs via OpenAI Batch');
    const [summaryResult, paragraphResult] = await Promise.allSettled([
      runLlmBatch([uploadRecordId], 'summarize', { force }),
      embedParagraphs
        ? runLlmBatch([uploadRecordId], 'embed_paragraphs', { force })
        : Promise.resolve(null),
    ]);

    let summaryEmbeddingError: unknown = null;
    if (summaryResult.status === 'fulfilled') {
      try {
        setCurrentDetails('Embedding summary via OpenAI Batch');
        await runLlmBatch([uploadRecordId], 'embed_summary', { force });
      } catch (error) {
        summaryEmbeddingError = error;
      }
    }

    throwCombinedBatchFailures([
      summaryResult.status === 'rejected' ? summaryResult.reason : null,
      paragraphResult.status === 'rejected' ? paragraphResult.reason : null,
      summaryEmbeddingError,
    ]);
  } else {
    setCurrentDetails('Summarizing & embedding');
    await Promise.all([
      (async () => {
        await summarizeUpload(uploadRecordId, { force });
        await embedUpload(uploadRecordId, { force });
      })(),
      embedParagraphs
        ? embedTranscriptParagraphs(uploadRecordId, { force })
        : undefined,
    ]);
  }

  setCurrentDetails('Indexing media');
  // Unique child workflow id per invocation. `Date.now()` is deterministic
  // inside a workflow execution (Temporal records it in history and replays
  // the same value), but differs across executions — so retries get fresh
  // child ids without colliding.
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

function throwCombinedBatchFailures(errors: ReadonlyArray<unknown>): void {
  const failures = errors.filter((error) => error !== null);
  if (failures.length === 0) return;
  if (failures.length === 1) throw failures[0];
  throw ApplicationFailure.retryable(
    `summarizeUploadWorkflow: multiple batch stages failed: ${failures
      .map((error) => (error instanceof Error ? error.message : String(error)))
      .join('; ')}`,
    'OpenAIBatchStagesFailed',
  );
}
