import {
  CancellationScope,
  executeChild,
  isCancellation,
  proxyActivities,
  sleep,
} from '@temporalio/workflow';
import { invariant } from 'es-toolkit';
import type * as backgroundActivities from '../../activities/background';
import type * as probeActivities from '../../activities/probe';
import type * as transcodeActivities from '../../activities/transcode';
import type * as transcribeActivities from '../../activities/transcribe';
import {
  BACKGROUND_QUEUE,
  PRIORITY_REPROCESS,
  PROBE_QUEUE,
  TRANSCODE_QUEUE,
  TRANSCRIBE_QUEUE,
} from '../../queues';
import { UPLOAD_ID_KEY } from '../../search-attributes';
import type { BatchStatus } from '../../util/openai-batch';
import { probeIsVideoFile } from '../../util/zod';
import { indexDocumentWorkflow } from './index-document';

const { probe } = proxyActivities<typeof probeActivities>({
  startToCloseTimeout: '20 minutes',
  heartbeatTimeout: '10 minutes',
  taskQueue: PROBE_QUEUE,
  retry: { maximumAttempts: 2 },
});

const { transcode, createThumbnails } = proxyActivities<
  typeof transcodeActivities
>({
  startToCloseTimeout: '180 minutes',
  heartbeatTimeout: '10 minutes',
  taskQueue: TRANSCODE_QUEUE,
  retry: { maximumAttempts: 2 },
});

const { transcribe } = proxyActivities<typeof transcribeActivities>({
  startToCloseTimeout: '180 minutes',
  heartbeatTimeout: '10 minutes',
  taskQueue: TRANSCRIBE_QUEUE,
  retry: { maximumAttempts: 2 },
});

const { getFinalizedUploadKey, storeTranscriptParagraphs } = proxyActivities<
  typeof backgroundActivities
>({
  startToCloseTimeout: '10 minutes',
  heartbeatTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 5 },
});

const { submitLlmBatch, processLlmBatchOutput, cleanupBatchFiles } =
  proxyActivities<typeof backgroundActivities>({
    // Both activities are short — submit uploads a JSONL + creates a
    // batch; process streams a (bounded) output file and writes DB
    // rows. 30m gives generous headroom for the larger groups.
    // cleanupBatchFiles is a few `files.delete` calls — short and
    // best-effort (failures swallowed inside the activity).
    startToCloseTimeout: '30 minutes',
    heartbeatTimeout: '1 minute',
    taskQueue: BACKGROUND_QUEUE,
    retry: { maximumAttempts: 3 },
  });

const { getLlmBatchStatus, cancelLlmBatch } = proxyActivities<
  typeof backgroundActivities
>({
  // Single `batches.retrieve` / `batches.cancel` per call — short,
  // safe to retry. The poll *loop* lives in the workflow body via
  // `sleep()` so the multi-hour wait is durable across worker
  // restarts (no heartbeating activity to lose).
  startToCloseTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
  retry: {
    maximumAttempts: 5,
    initialInterval: '10 seconds',
    backoffCoefficient: 2,
    maximumInterval: '5 minutes',
  },
});

// Polling cadence — flat 10 minutes between checks. Expressed as a
// workflow `sleep()` so the wait state is durable across worker
// restarts. 10 minutes × 24h SLA = ~144 polls worst case, which is
// trivial API load; the previous tiered cadence wasn't actually
// catching completions faster in practice.
const POLL_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Wait for an OpenAI batch to reach a terminal status by polling
 * via workflow timers. On workflow cancellation the timer rejects,
 * the catch fires a best-effort `cancelLlmBatch` from a non-
 * cancellable scope so the cleanup happens, and the cancellation
 * re-throws.
 */
async function waitForBatch(batchId: string): Promise<BatchStatus> {
  try {
    while (true) {
      const status = await getLlmBatchStatus(batchId);
      if (isBatchTerminal(status.status)) return status;
      await sleep(POLL_INTERVAL_MS);
    }
  } catch (err) {
    if (isCancellation(err)) {
      await CancellationScope.nonCancellable(() => cancelLlmBatch(batchId));
    }
    throw err;
  }
}

// Inlined to avoid importing from `util/openai-batch` in workflow
// code (that module pulls in the OpenAI SDK + env validation,
// neither of which is safe to evaluate inside the workflow
// sandbox). Mirrors `isBatchTerminal` from that module.
function isBatchTerminal(status: BatchStatus['status']): boolean {
  return (
    status === 'completed' ||
    status === 'failed' ||
    status === 'expired' ||
    status === 'cancelled'
  );
}

/**
 * OpenAI Batch-API reprocess for a group of uploads. Replaces the
 * per-upload `processMediaWorkflow` chain when the admin enables
 * "Use OpenAI Batch API" on the reprocess page.
 *
 * Phases:
 *   1. Live per-upload prep: probe → transcode + transcribe +
 *      thumbnails → storeTranscriptParagraphs. All uploads run in
 *      parallel via `Promise.allSettled` so a single broken upload
 *      doesn't kill the group.
 *   2-3. In parallel, submit the chat batch (summarize + annotate)
 *      and the paragraph-embed batch, then poll both to terminal.
 *   4. Process both outputs (DB writes + `llm_call` rows with
 *      `viaBatch: true`).
 *   5. Submit the summary-embed batch (depends on phase-4 summaries),
 *      poll, process.
 *   6. Reindex each successful upload's media row.
 *
 * Pre-filtering (skip uploads whose LLM work is already done) is
 * deferred — for now the batch resubmits all requests at 50% cost.
 * Add a `force` toggle + pre-flight DB check later if backfill
 * re-runs become wasteful.
 */
export async function reprocessGroupWorkflow(
  uploadIds: string[],
  processingScope: 'transcode' | 'transcribe' | 'everything' = 'everything',
): Promise<void> {
  if (uploadIds.length === 0) return;

  // --- Phase 1: per-upload live prep ----------------------------
  const prepResults = await Promise.allSettled(
    uploadIds.map(async (uploadId) => {
      const s3UploadKey = await getFinalizedUploadKey(uploadId);
      const probeRes = await probe(uploadId, s3UploadKey);
      invariant(probeRes !== null, `probe returned null for ${uploadId}`);

      const wantsTranscribe =
        processingScope === 'everything' || processingScope === 'transcribe';
      const wantsTranscode =
        processingScope === 'everything' || processingScope === 'transcode';

      const transcribePromise = wantsTranscribe
        ? transcribe(uploadId, s3UploadKey)
        : null;

      await Promise.all([
        transcribePromise,
        wantsTranscode ? transcode(uploadId, s3UploadKey, probeRes) : null,
        ...(wantsTranscode && probeIsVideoFile(probeRes)
          ? [createThumbnails(uploadId, s3UploadKey, probeRes)]
          : []),
      ]);

      if (transcribePromise) {
        const res = await transcribePromise;
        await storeTranscriptParagraphs(uploadId, res.transcriptJsonKey);
      }
      return { uploadId, transcribed: wantsTranscribe };
    }),
  );

  const transcribedUploadIds: string[] = [];
  for (const r of prepResults) {
    if (r.status === 'fulfilled' && r.value.transcribed) {
      transcribedUploadIds.push(r.value.uploadId);
    }
  }

  // If nothing got transcribed (transcode-only run, or every upload
  // failed in prep) there's no LLM work to batch — fall straight to
  // reindex below. Each kind's submit returns an array of OpenAI
  // batches (most kinds always 0 or 1; embed_paragraphs may split
  // across multiple to stay under OpenAI's 50K-inputs-per-batch
  // limit). All poll/process/cleanup ops fan out across the array.
  if (transcribedUploadIds.length > 0) {
    // --- Phase 2: submit chat + paragraph-embed batches in parallel
    const [chatSubmit, embedParagraphsSubmit] = await Promise.all([
      submitLlmBatch({
        uploadRecordIds: transcribedUploadIds,
        kind: 'summarize_annotate',
      }),
      submitLlmBatch({
        uploadRecordIds: transcribedUploadIds,
        kind: 'embed_paragraphs',
      }),
    ]);

    // --- Phase 3: poll every batch from both kinds in parallel ---
    // Both `Promise.all`s are awaited in one combined `Promise.all`
    // so chat and paragraph-embed polls run concurrently — submitted
    // together to OpenAI in phase 2, so they finish in roughly the
    // same window. (Sequential awaits would serialise the two 24h
    // SLAs unnecessarily.)
    const [chatStatuses, embedParagraphsStatuses] = await Promise.all([
      Promise.all(chatSubmit.batches.map((b) => waitForBatch(b.batchId))),
      Promise.all(
        embedParagraphsSubmit.batches.map((b) => waitForBatch(b.batchId)),
      ),
    ]);

    // --- Phase 4: process every batch's output in parallel -------
    await Promise.all([
      ...chatSubmit.batches.map((b, i) => {
        const status = chatStatuses[i];
        if (!status) return null;
        return processLlmBatchOutput({
          batchId: b.batchId,
          outputFileId: status.outputFileId,
          errorFileId: status.errorFileId,
          kind: 'summarize_annotate',
        });
      }),
      ...embedParagraphsSubmit.batches.map((b, i) => {
        const status = embedParagraphsStatuses[i];
        if (!status) return null;
        return processLlmBatchOutput({
          batchId: b.batchId,
          outputFileId: status.outputFileId,
          errorFileId: status.errorFileId,
          kind: 'embed_paragraphs',
        });
      }),
    ]);

    // --- Phase 4b: delete the input + output + error files once
    // their batch's output has been consumed. Files persist in
    // OpenAI's Files storage and count against the org's quota; this
    // keeps the Files list tidy across many reprocess runs.
    // Best-effort — failures swallowed inside the activity.
    await cleanupBatchFiles({
      fileIds: collectFileIds([
        ...chatSubmit.batches.flatMap((b, i) => [
          b.inputFileId,
          chatStatuses[i]?.outputFileId ?? null,
          chatStatuses[i]?.errorFileId ?? null,
        ]),
        ...embedParagraphsSubmit.batches.flatMap((b, i) => [
          b.inputFileId,
          embedParagraphsStatuses[i]?.outputFileId ?? null,
          embedParagraphsStatuses[i]?.errorFileId ?? null,
        ]),
      ]),
    });

    // --- Phase 5: summary-embed batch (depends on phase-4 summaries) ---
    // Skip cleanly when no summaries got written — `submitLlmBatch`
    // returns an empty result rather than throwing, so the
    // downstream reindex still runs.
    if (chatSubmit.includedUploadIds.length > 0) {
      const embedSummarySubmit = await submitLlmBatch({
        uploadRecordIds: chatSubmit.includedUploadIds,
        kind: 'embed_summary',
      });
      if (embedSummarySubmit.batches.length > 0) {
        const embedSummaryStatuses = await Promise.all(
          embedSummarySubmit.batches.map((b) => waitForBatch(b.batchId)),
        );
        await Promise.all(
          embedSummarySubmit.batches.map((b, i) => {
            const status = embedSummaryStatuses[i];
            if (!status) return null;
            return processLlmBatchOutput({
              batchId: b.batchId,
              outputFileId: status.outputFileId,
              errorFileId: status.errorFileId,
              kind: 'embed_summary',
            });
          }),
        );
        await cleanupBatchFiles({
          fileIds: collectFileIds(
            embedSummarySubmit.batches.flatMap((b, i) => [
              b.inputFileId,
              embedSummaryStatuses[i]?.outputFileId ?? null,
              embedSummaryStatuses[i]?.errorFileId ?? null,
            ]),
          ),
        });
      }
    }
  }

  // --- Phase 6: per-upload reindex (parallel children) ------------
  // Spawn one child per upload so we get per-upload retries and the
  // Temporal UI shows individual reindex progress. Cheap workflow.
  const fulfilledUploadIds = prepResults
    .filter(
      (
        r,
      ): r is PromiseFulfilledResult<{
        uploadId: string;
        transcribed: boolean;
      }> => r.status === 'fulfilled',
    )
    .map((r) => r.value.uploadId);
  await Promise.all(
    fulfilledUploadIds.map((uploadId) =>
      executeChild(indexDocumentWorkflow, {
        workflowId: `media:${uploadId}:batch:${Date.now()}`,
        args: ['media', uploadId],
        taskQueue: BACKGROUND_QUEUE,
        priority: { priorityKey: PRIORITY_REPROCESS },
        typedSearchAttributes: [{ key: UPLOAD_ID_KEY, value: uploadId }],
        retry: { maximumAttempts: 2 },
      }),
    ),
  );
}

// Filter a list of optional file ids down to the non-null/empty
// strings that the cleanup activity should actually try to delete.
function collectFileIds(ids: ReadonlyArray<string | null>): string[] {
  return ids.filter((id): id is string => typeof id === 'string' && id !== '');
}
