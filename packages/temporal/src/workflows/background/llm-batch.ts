import {
  ApplicationFailure,
  CancellationScope,
  log,
  proxyActivities,
  sleep,
} from '@temporalio/workflow';

import type * as backgroundActivities from '../../activities/background';
import type {
  LlmBatchKind,
  SubmitLlmBatchResult,
} from '../../activities/background';
import { BACKGROUND_QUEUE } from '../../queues';
import { getBatchAccountingErrors } from '../../util/llm-batch-accounting';
import type { BatchStatus } from '../../util/openai-batch';

const { submitLlmBatch } = proxyActivities<typeof backgroundActivities>({
  // Building the JSONL can include a full transcript or thousands of
  // paragraph inputs. The activity itself is retriable; a failed attempt may
  // upload a file before batch creation fails, so submitBatch deletes that
  // orphan before the activity retries.
  startToCloseTimeout: '120 minutes',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 3 },
});

const { processLlmBatchOutput } = proxyActivities<typeof backgroundActivities>({
  // Output processing streams the JSONL and heartbeats after every line.
  startToCloseTimeout: '6 hours',
  heartbeatTimeout: '10 minutes',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 3 },
});

const { cleanupBatchFiles } = proxyActivities<typeof backgroundActivities>({
  startToCloseTimeout: '30 minutes',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 3 },
});

const { getLlmBatchStatus, cancelLlmBatch } = proxyActivities<
  typeof backgroundActivities
>({
  startToCloseTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
  retry: {
    maximumAttempts: 5,
    initialInterval: '10 seconds',
    backoffCoefficient: 2,
    maximumInterval: '5 minutes',
  },
});

// A durable workflow timer keeps the potentially multi-hour Batch API wait
// out of an activity. Ten minutes is frequent enough for an asynchronous
// processing pipeline while remaining trivial API load over the 24-hour SLA.
const POLL_INTERVAL_MS = 10 * 60 * 1000;

async function waitForBatch(batchId: string): Promise<BatchStatus> {
  try {
    while (true) {
      const status = await getLlmBatchStatus(batchId);
      if (isBatchTerminal(status.status)) return status;
      await sleep(POLL_INTERVAL_MS);
    }
  } catch (error) {
    // A workflow retry cannot recover this batch id from the prior run.
    // Cancel on every exhausted polling failure, not only Temporal
    // cancellation, so a replacement attempt does not leave billable work
    // running in parallel.
    await CancellationScope.nonCancellable(() => cancelLlmBatch(batchId));
    throw error;
  }
}

function isBatchTerminal(status: BatchStatus['status']): boolean {
  return (
    status === 'completed' ||
    status === 'failed' ||
    status === 'expired' ||
    status === 'cancelled'
  );
}

/**
 * Submit one logical LLM stage through OpenAI Batch, wait durably for every
 * shard, apply the results, and clean up successful files. This is shared by
 * normal single-upload processing and every retry/regeneration path.
 *
 * A batch can complete while individual request lines fail. The output handler
 * can recover annotation content-filter responses through the configured live
 * OpenRouter fallback. Treat every other failed line as a workflow failure so
 * Temporal retries the same regular job through Batch again.
 */
export async function runLlmBatch(
  uploadRecordIds: string[],
  kind: LlmBatchKind,
  { force = false }: { force?: boolean } = {},
): Promise<SubmitLlmBatchResult> {
  const submission = await submitLlmBatch({
    uploadRecordIds,
    kind,
    force,
  });
  if (submission.batches.length === 0) return submission;

  const statusSettled = await Promise.allSettled(
    submission.batches.map((batch) => waitForBatch(batch.batchId)),
  );
  const statuses = statusSettled.map((result) =>
    result.status === 'fulfilled' ? result.value : null,
  );
  const resultSettled = await Promise.allSettled(
    submission.batches.map((batch, index) => {
      const status = statuses[index];
      if (!status) return null;
      return processLlmBatchOutput({
        batchId: batch.batchId,
        outputFileId: status.outputFileId,
        errorFileId: status.errorFileId,
        kind,
      });
    }),
  );
  const results = resultSettled.map((result) =>
    result.status === 'fulfilled' ? result.value : null,
  );
  const accountingErrorsByBatch = submission.batches.map((batch, index) =>
    getBatchAccountingErrors(
      batch.requestCount,
      statuses[index] ?? null,
      results[index] ?? null,
    ),
  );

  // Keep error files for failed requests as a short-lived forensic trail.
  // OpenAI expires them after 30 days; successful input/output/error files can
  // be deleted immediately to avoid consuming the organization file quota.
  // Run this after every shard settles and outside cancellation so one failed
  // poll/process call cannot strand files from the successful siblings.
  try {
    await CancellationScope.nonCancellable(() =>
      cleanupBatchFiles({
        fileIds: collectFileIds(
          submission.batches.flatMap((batch, index) => {
            const status = statuses[index];
            const result = results[index];
            const failed =
              !status ||
              status.status !== 'completed' ||
              status.failedCount > 0 ||
              !result ||
              result.failed > 0 ||
              (accountingErrorsByBatch[index]?.length ?? 0) > 0;
            return [
              batch.inputFileId,
              failed ? null : (status?.outputFileId ?? null),
              failed ? null : (status?.errorFileId ?? null),
            ];
          }),
        ),
      }),
    );
  } catch (error) {
    // cleanupBatchFiles is explicitly best effort. Do not mask the primary
    // batch/process error or retry a successful forced regeneration.
    log.warn('OpenAI batch file cleanup failed', {
      error: error instanceof Error ? error.message : String(error),
      kind,
    });
  }

  const statusFailure = statusSettled.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (statusFailure) throw statusFailure.reason;
  const processFailure = resultSettled.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (processFailure) throw processFailure.reason;

  const failedRequestCount = results.reduce(
    (total, result) => total + (result?.failed ?? 0),
    0,
  );
  const providerFailedRequestCount = statuses.reduce(
    (total, status) => total + (status?.failedCount ?? 0),
    0,
  );
  const badStatuses = statuses.filter(
    (status): status is BatchStatus =>
      status !== null && status.status !== 'completed',
  );
  const accountingErrors = accountingErrorsByBatch.flatMap((errors, index) =>
    errors.map(
      (error) =>
        `${submission.batches[index]?.batchId ?? `shard-${index}`}: ${error}`,
    ),
  );
  if (
    badStatuses.length > 0 ||
    failedRequestCount > 0 ||
    providerFailedRequestCount > 0 ||
    accountingErrors.length > 0
  ) {
    const states = [...new Set(badStatuses.map((status) => status.status))];
    throw ApplicationFailure.retryable(
      `OpenAI ${kind} batch failed: ${Math.max(failedRequestCount, providerFailedRequestCount)} request(s) failed${states.length > 0 ? `; terminal status ${states.join(', ')}` : ''}${accountingErrors.length > 0 ? `; accounting: ${accountingErrors.join('; ')}` : ''}`,
      states.includes('expired') ? 'OpenAIBatchExpired' : 'OpenAIBatchFailed',
    );
  }

  return submission;
}

function collectFileIds(ids: ReadonlyArray<string | null>): string[] {
  return ids.filter((id): id is string => typeof id === 'string' && id !== '');
}
