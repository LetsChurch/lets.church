import {
  executeChild,
  proxyActivities,
  setCurrentDetails,
} from '@temporalio/workflow';

import type * as backgroundActivities from '../../activities/background';
import { BACKGROUND_QUEUE, PRIORITY_USER } from '../../queues';
import { UPLOAD_ID_KEY } from '../../search-attributes';
import { indexDocumentWorkflow } from './index-document';

const { annotateTranscript } = proxyActivities<typeof backgroundActivities>({
  // No heartbeatTimeout: the activity is a single LLM round-trip and
  // doesn't heartbeat. A heartbeat-based timeout would cap each attempt
  // at that interval instead of using `startToCloseTimeout` as the real
  // ceiling, which matters once the content_filter fallback chains a
  // second model into the same attempt.
  startToCloseTimeout: '10 minute',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 3 },
});

export type AnnotateTranscriptOptions = {
  /**
   * When true, the annotate activity overwrites any existing annotations
   * for this upload. Default false: the activity short-circuits if any
   * `annotation` row already exists for the upload's paragraphs, so
   * parent-workflow retries (process-media's `Promise.allSettled`
   * re-runs the happy-path child if its sibling fails) don't re-bill
   * LLM tokens for work already done. The admin "Regenerate
   * Annotations" mutation passes `force: true`.
   */
  force?: boolean;
};

/**
 * Annotation pipeline.
 *
 *   annotateTranscript → media indexer (lc_media_v1)
 *
 * Called as a child workflow from `processMediaWorkflow` on the transcribe
 * path (in parallel with `summarizeUploadWorkflow`), and as a top-level
 * workflow from the admin `regenerateUploadAnnotations` tRPC mutation when
 * an operator wants to re-run annotations after a prompt change without
 * re-summarizing. Independent of the summary pipeline so admins regenerate
 * one without paying for the other (~$0.02 each for gpt-5.4-mini on a
 * typical sermon-length transcript, but a dozen reruns adds up).
 *
 * The downstream media reindex is the same `indexDocumentWorkflow` the
 * summary path triggers — racing two reindexes for the same upload is fine,
 * lc_media_v1 reads the current row state from the DB.
 */
export async function annotateTranscriptWorkflow(
  uploadRecordId: string,
  { force = false }: AnnotateTranscriptOptions = {},
) {
  setCurrentDetails('Annotating transcript');
  await annotateTranscript(uploadRecordId, { force });

  setCurrentDetails('Indexing media');
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
