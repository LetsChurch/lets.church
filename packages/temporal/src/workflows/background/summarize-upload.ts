import { executeChild, proxyActivities } from '@temporalio/workflow';
import type * as backgroundActivities from '../../activities/background';
import { BACKGROUND_QUEUE, PRIORITY_USER } from '../../queues';
import { UPLOAD_ID_KEY } from '../../search-attributes';
import { indexDocumentWorkflow } from './index-document';

const { summarizeUpload, embedUpload, embedTranscriptParagraphs } =
  proxyActivities<typeof backgroundActivities>({
    // No heartbeatTimeout: these activities are single LLM round-trips
    // (or a small batched embed) and don't heartbeat. Without a
    // heartbeat-based timeout, `startToCloseTimeout` is the only ceiling
    // — which matters once the content_filter fallback chains a second
    // model into the same attempt.
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
   * When true, the summarize activity overwrites any existing summary.
   * Default false: the activity short-circuits if `upload_record.summary`
   * is already populated, so parent-workflow retries (process-media's
   * `Promise.allSettled` re-runs the happy-path child if its sibling
   * fails) don't re-bill LLM tokens for work already done. The admin
   * "Regenerate Summary" mutation passes `force: true`.
   */
  force?: boolean;
};

/**
 * LLM summary + embeddings post-processing pipeline.
 *
 *   summarize → embed-summary (sequential)
 *   embed-paragraphs (parallel, opt-in)
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
 * Note: the file/workflow share a name with the `summarizeUpload` activity
 * (different directory, different exported identifier — the workflow appends
 * `Workflow`). The workflow is the broader pipeline; the activity is just
 * the chat-completion call.
 */
export async function summarizeUploadWorkflow(
  uploadRecordId: string,
  { embedParagraphs = false, force = false }: SummarizeUploadOptions = {},
) {
  // `force` propagates to every step in the chain so admin Regenerate
  // (which always passes force=true) actually rewrites: summary text →
  // summary embeddings (otherwise the old vector outlives the new
  // text), and paragraph embeddings when requested. The first-pass
  // transcribe path runs with force=false so retries reuse durable
  // landings instead of re-billing tokens — see each activity's
  // idempotency comment.
  await Promise.all([
    (async () => {
      await summarizeUpload(uploadRecordId, { force });
      await embedUpload(uploadRecordId, { force });
    })(),
    embedParagraphs
      ? embedTranscriptParagraphs(uploadRecordId, { force })
      : undefined,
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
