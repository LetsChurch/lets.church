import { executeChild, proxyActivities } from '@temporalio/workflow';
import type * as backgroundActivities from '../../activities/background';
import { BACKGROUND_QUEUE, PRIORITY_USER } from '../../queues';
import { UPLOAD_ID_KEY } from '../../search-attributes';
import { indexDocumentWorkflow } from './index-document';

const { summarizeUpload, embedUpload, embedTranscriptParagraphs } =
  proxyActivities<typeof backgroundActivities>({
    startToCloseTimeout: '10 minute',
    heartbeatTimeout: '1 minute',
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
};

/**
 * Shared LLM post-processing pipeline.
 *
 *   summarize → embed-summary (sequential)
 *   embed-paragraphs (parallel, opt-in)
 *   → media indexer (lc_media_v1)
 *
 * Called as a child workflow from `processMediaWorkflow` on the transcribe
 * path (with `embedParagraphs: true`), and as a top-level workflow from the
 * admin `regenerateUploadSummary` tRPC mutation (default options) when an
 * operator wants to spot-fix a tropey summary without re-transcribing.
 *
 * Note: the file/workflow share a name with the `summarizeUpload` activity
 * (different directory, different exported identifier — the workflow appends
 * `Workflow`). The workflow is the broader pipeline; the activity is just
 * the chat-completion call.
 */
export async function summarizeUploadWorkflow(
  uploadRecordId: string,
  { embedParagraphs = false }: SummarizeUploadOptions = {},
) {
  await Promise.all([
    (async () => {
      await summarizeUpload(uploadRecordId);
      await embedUpload(uploadRecordId);
    })(),
    embedParagraphs ? embedTranscriptParagraphs(uploadRecordId) : undefined,
  ]);

  // Unique child workflow id per invocation. `Date.now()` is deterministic
  // inside a workflow execution (Temporal records it in history and replays
  // the same value), but differs across executions — so retries get fresh
  // child ids without colliding.
  await executeChild(indexDocumentWorkflow, {
    workflowId: `media:${uploadRecordId}:${Date.now()}`,
    args: ['media', uploadRecordId],
    taskQueue: BACKGROUND_QUEUE,
    priority: { priorityKey: PRIORITY_USER },
    // Propagate UploadId so the grandchild media indexer is filterable by
    // upload in the Temporal UI, same as the rest of the tree.
    typedSearchAttributes: [{ key: UPLOAD_ID_KEY, value: uploadRecordId }],
    retry: { maximumAttempts: 2 },
  });
}
