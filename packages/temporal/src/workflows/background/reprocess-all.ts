import {
  continueAsNew,
  ParentClosePolicy,
  proxyActivities,
  startChild,
} from '@temporalio/workflow';
import type * as backgroundActivities from '../../activities/background';
import { BACKGROUND_QUEUE, PRIORITY_REPROCESS } from '../../queues';
import type { ReprocessScope } from '../../reprocess-scope';
import {
  CHANNEL_ID_KEY,
  CHANNEL_SLUG_KEY,
  UPLOAD_ID_KEY,
  USER_ID_KEY,
  USERNAME_KEY,
} from '../../search-attributes';
import { processMediaWorkflow } from './process-media';
import { reprocessGroupWorkflow } from './reprocess-group';

const { getReprocessBatch } = proxyActivities<typeof backgroundActivities>({
  startToCloseTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 3 },
});

// Uploads per iteration. In viaBatch mode this is also the size of each
// reprocessGroupWorkflow's OpenAI batch, so keep it modest: 50 keeps each
// group's submit/process activity well within its timeout while still
// amortizing the batch overhead.
const BATCH_SIZE = 50;

export type ReprocessAllOptions = {
  /**
   * When true, dispatch each iteration's uploads to one
   * `reprocessGroupWorkflow` (which batches the LLM stages via
   * OpenAI Batch). When false (default), keep the per-upload
   * `processMediaWorkflow` behavior with live LLM calls.
   */
  viaBatch?: boolean;
  /**
   * Reuse each upload's stored probe.json instead of a fresh download +
   * ffprobe (falling back to a live probe per upload when none is
   * stored). Defaults to true for reprocess runs.
   */
  skipProbe?: boolean;
  /**
   * Inclusive ISO datetime bounds restricting which uploads are
   * selected. The column they apply to is chosen from `processingScope`
   * (creation date for a full run, transcode/transcribe finish date
   * otherwise). Not used by the `no_paragraphs` migration scope.
   */
  dateStart?: string;
  dateEnd?: string;
  /**
   * When true (and the run transcodes), only reprocess uploads that
   * already have a video variant.
   */
  videoOnly?: boolean;
  /**
   * LLM stage control passed through to each upload:
   *   'run' (default) — run summarize + annotate
   *   'skip'          — skip the LLM stages entirely
   *   'skip-existing' — skip only uploads that already have a summary
   *                     and annotations; run for the ones missing them
   */
  llmMode?: 'run' | 'skip' | 'skip-existing';
};

export async function reprocessAllWorkflow(
  scope: ReprocessScope,
  processingScope: 'transcode' | 'transcribe' | 'everything' = 'transcode',
  cursor: string | null = null,
  options: ReprocessAllOptions = {},
): Promise<void> {
  const skipProbe = options.skipProbe ?? true;
  const llmMode = options.llmMode ?? 'run';

  const { items, nextCursor } = await getReprocessBatch(
    scope,
    BATCH_SIZE,
    cursor,
    {
      processingScope,
      dateStart: options.dateStart,
      dateEnd: options.dateEnd,
      videoOnly: options.videoOnly,
    },
  );

  if (options.viaBatch) {
    // Each iterator batch (≤100 uploads) becomes ONE
    // `reprocessGroupWorkflow` child. Inside that child the work
    // splits into three OpenAI batches because the Batch API
    // restricts each batch to a single endpoint:
    //   - one `/v1/chat/completions` batch carrying every upload's
    //     summarize + annotate requests,
    //   - one `/v1/embeddings` batch carrying every upload's
    //     paragraph-vector requests (runs in parallel with the chat
    //     batch — paragraph text is in the DB after transcribe),
    //   - one `/v1/embeddings` batch carrying every upload's
    //     summary-vector requests (runs after the chat batch
    //     finishes since it depends on summaries being written).
    // Plus live per-upload prep (transcribe) at the start and live
    // per-upload reindex children at the end.
    //
    // `startChild` + `ABANDON` (matching the unbatched per-upload
    // branch below) so the parent advances through the cursor
    // immediately and the group children run in parallel. With
    // sequential `executeChild` a 50-group full reprocess would
    // serialise the 24h Batch SLA into ~50 days; with parallel
    // children every group's batches sit in OpenAI's queue
    // concurrently and finish in ~24h total. Tier-4 quotas
    // (1B chat / 500M embed queued) easily fit dozens of groups in
    // flight at once.
    //
    // Trade-off: like the unbatched branch, the parent workflow
    // completes as soon as dispatch finishes, so the admin status
    // badge will flip to "Completed" while abandoned group
    // children may still have hours of polling left. Operators can
    // see per-group progress via the Temporal UI's
    // `reprocessGroup:*` workflows. Cancellation of the parent
    // also doesn't cascade to the abandoned children — same as the
    // unbatched path.
    if (items.length > 0) {
      try {
        await startChild(reprocessGroupWorkflow, {
          workflowId: `reprocessGroup:${items[0]?.id ?? 'empty'}:${items.length}`,
          args: [items.map((i) => i.id), processingScope, skipProbe, llmMode],
          taskQueue: BACKGROUND_QUEUE,
          parentClosePolicy: ParentClosePolicy.ABANDON,
          priority: { priorityKey: PRIORITY_REPROCESS },
          retry: { maximumAttempts: 1 },
          // No `typedSearchAttributes` on the group workflow itself —
          // a group spans up to 100 uploads (and many channels in the
          // `no_paragraphs` / `all` scopes), so cherry-picking
          // `items[0]`'s ids would be misleading. The per-upload
          // indexDocument grandchildren inside the group still set
          // `UPLOAD_ID_KEY` so the upload-tree filter stays intact.
        });
      } catch (err) {
        // Mirror the unbatched per-upload branch's already-started
        // tolerance: cursor advancement should prevent duplicate
        // ids, but defending against a re-entered resume is cheap.
        if (
          !(
            err instanceof Error &&
            err.name === 'WorkflowExecutionAlreadyStartedError'
          )
        ) {
          throw err;
        }
      }
    }
  } else {
    for (const item of items) {
      try {
        await startChild(processMediaWorkflow, {
          workflowId: `reprocessUpload:${item.id}`,
          args: [item.id, processingScope, skipProbe, llmMode],
          taskQueue: BACKGROUND_QUEUE,
          parentClosePolicy: ParentClosePolicy.ABANDON,
          priority: { priorityKey: PRIORITY_REPROCESS },
          retry: { maximumAttempts: 2 },
          typedSearchAttributes: [
            { key: UPLOAD_ID_KEY, value: item.id },
            { key: CHANNEL_ID_KEY, value: item.channelId },
            { key: CHANNEL_SLUG_KEY, value: item.channelSlug },
            { key: USER_ID_KEY, value: item.appUserId },
            { key: USERNAME_KEY, value: item.username },
          ],
        });
      } catch (err) {
        if (
          err instanceof Error &&
          err.name === 'WorkflowExecutionAlreadyStartedError'
        ) {
          continue;
        }
        throw err;
      }
    }
  }

  if (nextCursor !== null) {
    await continueAsNew<typeof reprocessAllWorkflow>(
      scope,
      processingScope,
      nextCursor,
      options,
    );
  }
}
