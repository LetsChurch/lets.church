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

const {
  getFinalizedUploadKey,
  getStoredProbe,
  getUploadsMissingLlmData,
  storeTranscriptParagraphs,
} = proxyActivities<typeof backgroundActivities>({
  startToCloseTimeout: '10 minutes',
  heartbeatTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 5 },
});

const { submitLlmBatch } = proxyActivities<typeof backgroundActivities>({
  // Scales with group size: builds + uploads a JSONL whose annotate kind
  // echoes each upload's full transcript. Single build+upload, no
  // heartbeat, so startToCloseTimeout is the only ceiling.
  startToCloseTimeout: '120 minutes',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 3 },
});

const { processLlmBatchOutput } = proxyActivities<typeof backgroundActivities>({
  // Streams the whole output file and does per-upload DB writes; runtime
  // scales with group size and can be long for big groups. It heartbeats
  // per line, so a genuine hang is caught by heartbeatTimeout in minutes
  // instead of burning the whole ceiling; the generous startToClose just
  // bounds total runtime. All applies are idempotent (summary update,
  // annotate delete+insert, embed update), so a retry from the start is
  // safe.
  startToCloseTimeout: '6 hours',
  heartbeatTimeout: '10 minutes',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 3 },
});

const { cleanupBatchFiles, embedUploadSummariesBulk } = proxyActivities<
  typeof backgroundActivities
>({
  // Both are short, fixed-cost: cleanupBatchFiles is a few
  // `files.delete` calls; embedUploadSummariesBulk is one live
  // `embeddings.create` round-trip (≤200 inputs) + a transactional
  // UPDATE per upload. 30m is generous headroom. No heartbeatTimeout
  // because neither heartbeats — startToCloseTimeout is the only
  // ceiling.
  startToCloseTimeout: '30 minutes',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 3 },
});

// Live retries for batch failures. Each makes one (or two, via the
// activity's built-in fallback-model path) LLM round-trip. The annotate
// echoes a full transcript so completion tokens are large; 30m SCT is
// generous headroom. `maximumAttempts: 1` because the activity already
// handles content-filter / empty-response by switching to the fallback
// model internally — retrying the whole activity on top of that
// rarely changes the outcome and just delays the next upload.
const { annotateTranscript, summarizeUpload, embedTranscriptParagraphs } =
  proxyActivities<typeof backgroundActivities>({
    startToCloseTimeout: '30 minutes',
    taskQueue: BACKGROUND_QUEUE,
    retry: { maximumAttempts: 1 },
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
 * With `llmMode: 'run'` (default) the batch resubmits LLM requests for
 * every transcribed upload at 50% cost. 'skip' drops the LLM waves
 * entirely; 'skip-existing' pre-filters to uploads missing a summary/
 * annotations so the batch only spends LLM on the gaps.
 */
export async function reprocessGroupWorkflow(
  uploadIds: string[],
  processingScope: 'transcode' | 'transcribe' | 'everything' = 'everything',
  // Mirrors `processMediaWorkflow`: reuse the stored probe.json instead
  // of a fresh download + ffprobe, falling back to a live probe per
  // upload when none is stored. Defaults false; reprocess flows opt in.
  skipProbe = false,
  // LLM stage control — see `processMediaWorkflow` / `getUploadsMissingLlmData`.
  llmMode: 'run' | 'skip' | 'skip-existing' = 'run',
): Promise<void> {
  if (uploadIds.length === 0) return;

  // --- Phase 1: per-upload live prep ----------------------------
  const prepResults = await Promise.allSettled(
    uploadIds.map(async (uploadId) => {
      const s3UploadKey = await getFinalizedUploadKey(uploadId);
      const probeRes =
        (skipProbe ? await getStoredProbe(uploadId) : null) ??
        (await probe(uploadId, s3UploadKey));
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

  // LLM stage gating. 'skip' drops the LLM waves entirely; 'skip-existing'
  // restricts them to uploads missing a summary/annotations so the batch
  // only spends LLM on the gaps. The reindex below still covers every
  // prepped upload regardless of this filter.
  let llmUploadIds = transcribedUploadIds;
  if (llmMode === 'skip') {
    llmUploadIds = [];
  } else if (llmMode === 'skip-existing' && transcribedUploadIds.length > 0) {
    llmUploadIds = await getUploadsMissingLlmData(transcribedUploadIds);
  }

  // If nothing got transcribed (transcode-only run, or every upload
  // failed in prep) there's no LLM work to batch — fall straight to
  // reindex below. The LLM stages are split across two batch waves:
  //   Wave 1 (parallel): annotate batch + paragraph-embed batches.
  //                      annotate writes OUTLINE annotations, which
  //                      the summarize wave reads as input.
  //   Wave 2 (after 1):  summarize batch — uses outlines + paragraphs
  //                      to produce summary + searchSummary + per-
  //                      section descriptions.
  //   Live tail:         bulk embed-summary (one round-trip, no batch).
  // Each kind's submit returns an array of OpenAI batches; embed_-
  // paragraphs may split when total inputs exceed the 50K cap.
  if (llmUploadIds.length > 0) {
    // --- Wave 1, Phase 2: submit annotate + paragraph-embed --------
    const [annotateSubmit, embedParagraphsSubmit] = await Promise.all([
      submitLlmBatch({
        uploadRecordIds: llmUploadIds,
        kind: 'annotate',
      }),
      submitLlmBatch({
        uploadRecordIds: llmUploadIds,
        kind: 'embed_paragraphs',
      }),
    ]);

    // --- Wave 1, Phase 3: poll both kinds in parallel --------------
    const [annotateStatuses, embedParagraphsStatuses] = await Promise.all([
      Promise.all(annotateSubmit.batches.map((b) => waitForBatch(b.batchId))),
      Promise.all(
        embedParagraphsSubmit.batches.map((b) => waitForBatch(b.batchId)),
      ),
    ]);

    // --- Wave 1, Phase 4: process both outputs (annotate writes
    //     OUTLINE annotations + scripture/keyword annotations to DB;
    //     paragraph-embed writes vectors) -------------------------
    const annotateResults = await Promise.all(
      annotateSubmit.batches.map((b, i) => {
        const status = annotateStatuses[i];
        if (!status) return null;
        return processLlmBatchOutput({
          batchId: b.batchId,
          outputFileId: status.outputFileId,
          errorFileId: status.errorFileId,
          kind: 'annotate',
        });
      }),
    );
    const embedParagraphsResults = await Promise.all(
      embedParagraphsSubmit.batches.map((b, i) => {
        const status = embedParagraphsStatuses[i];
        if (!status) return null;
        return processLlmBatchOutput({
          batchId: b.batchId,
          outputFileId: status.outputFileId,
          errorFileId: status.errorFileId,
          kind: 'embed_paragraphs',
        });
      }),
    );

    // --- Wave 1, Phase 4.5: live retries for annotate failures ----
    // The annotate batch can drop individual uploads either via the
    // OpenAI error file (rate limit, content classifier, malformed
    // input) or via our own per-line apply (parse error, schema
    // mismatch). The live activity does one normal-model attempt and
    // an automatic fallback-model attempt on content-filter blocks,
    // so it covers both classes. Each retry is independently
    // catch-handled — one upload's failure shouldn't sink the group.
    const annotateRetryIds = new Set<string>();
    for (const r of annotateResults) {
      if (!r) continue;
      for (const id of r.failedUploadIds) annotateRetryIds.add(id);
    }
    if (annotateRetryIds.size > 0) {
      await Promise.all(
        [...annotateRetryIds].map((uploadId) =>
          annotateTranscript(uploadId).catch(() => undefined),
        ),
      );
    }

    // --- Wave 1, Phase 4.6: live retries for embed-paragraphs ----
    // Embed batches split per-upload into ≤EMBED_MAX_INPUTS chunks,
    // so a single failed chunk leaves an upload with partial vector
    // coverage (some paragraphs embedded, the chunk's range missing).
    // The live `embedTranscriptParagraphs` activity with the default
    // `force: false` only touches rows where `embedding IS NULL`, so
    // one call per affected upload picks up exactly the missing
    // chunk(s) and doesn't redo any successful ones.
    const embedRetryIds = new Set<string>();
    for (const r of embedParagraphsResults) {
      if (!r) continue;
      for (const id of r.failedUploadIds) embedRetryIds.add(id);
    }
    if (embedRetryIds.size > 0) {
      await Promise.all(
        [...embedRetryIds].map((uploadId) =>
          embedTranscriptParagraphs(uploadId).catch(() => undefined),
        ),
      );
    }

    // --- Wave 1 cleanup: drop input/output/error files ------------
    // Preserve error files for batches that had any failures —
    // OpenAI's 30-day file expiry then keeps the forensic trail
    // alive long enough to diagnose a class of failure (today's
    // gpt-5.4 `max_tokens` regression took a lot longer to chase
    // down because we'd already deleted the file). Successful
    // batches' nullish error files cost nothing to "skip".
    await cleanupBatchFiles({
      fileIds: collectFileIds([
        ...annotateSubmit.batches.flatMap((b, i) => [
          b.inputFileId,
          annotateStatuses[i]?.outputFileId ?? null,
          annotateResults[i]?.failed
            ? null
            : (annotateStatuses[i]?.errorFileId ?? null),
        ]),
        ...embedParagraphsSubmit.batches.flatMap((b, i) => [
          b.inputFileId,
          embedParagraphsStatuses[i]?.outputFileId ?? null,
          embedParagraphsResults[i]?.failed
            ? null
            : (embedParagraphsStatuses[i]?.errorFileId ?? null),
        ]),
      ]),
    });

    // --- Wave 2, Phase 5: submit summarize (depends on annotate's
    //     outlines having landed in `annotation`) -------------------
    if (annotateSubmit.includedUploadIds.length > 0) {
      const summarizeSubmit = await submitLlmBatch({
        uploadRecordIds: annotateSubmit.includedUploadIds,
        kind: 'summarize',
      });

      // --- Wave 2, Phase 6: poll summarize batch ------------------
      const summarizeStatuses = await Promise.all(
        summarizeSubmit.batches.map((b) => waitForBatch(b.batchId)),
      );

      // --- Wave 2, Phase 7: process summarize output (writes
      //     summary + searchSummary + per-section descriptions) ----
      const summarizeResults = await Promise.all(
        summarizeSubmit.batches.map((b, i) => {
          const status = summarizeStatuses[i];
          if (!status) return null;
          return processLlmBatchOutput({
            batchId: b.batchId,
            outputFileId: status.outputFileId,
            errorFileId: status.errorFileId,
            kind: 'summarize',
          });
        }),
      );

      // --- Wave 2, Phase 7.5: live retries for summarize failures
      // Same shape as the annotate retry path. The live summarize
      // activity uses SUMMARY_FALLBACK_MODEL on content-filter blocks.
      const summarizeRetryIds = new Set<string>();
      for (const r of summarizeResults) {
        if (!r) continue;
        for (const id of r.failedUploadIds) summarizeRetryIds.add(id);
      }
      if (summarizeRetryIds.size > 0) {
        await Promise.all(
          [...summarizeRetryIds].map((uploadId) =>
            summarizeUpload(uploadId).catch(() => undefined),
          ),
        );
      }

      // --- Wave 2 cleanup ----------------------------------------
      // Same error-file preservation rule as Wave 1 — keep the file
      // for any batch that had failures so the 30-day OpenAI window
      // is available for postmortem.
      await cleanupBatchFiles({
        fileIds: collectFileIds(
          summarizeSubmit.batches.flatMap((b, i) => [
            b.inputFileId,
            summarizeStatuses[i]?.outputFileId ?? null,
            summarizeResults[i]?.failed
              ? null
              : (summarizeStatuses[i]?.errorFileId ?? null),
          ]),
        ),
      });

      // --- Live tail, Phase 8: bulk embed summaries ---------------
      // One live `embeddings.create` round-trip for every upload in
      // the summarize batch. Replaces the previous embed-summary
      // batch — the work is too small to justify another 24h
      // batch cycle (~$0.001/100 uploads of batch discount).
      if (summarizeSubmit.includedUploadIds.length > 0) {
        await embedUploadSummariesBulk({
          uploadRecordIds: summarizeSubmit.includedUploadIds,
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
