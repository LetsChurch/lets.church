import type { BatchStatus } from './openai-batch';

export type BatchProcessCounts = {
  succeeded: number;
  failed: number;
};

/**
 * Reconcile the three independent views of a Batch API shard: what we
 * submitted, what OpenAI reports, and how many output/error lines we consumed.
 * A terminal "completed" status is not sufficient by itself because nullable
 * or truncated files would otherwise look like a zero-failure success.
 */
export function getBatchAccountingErrors(
  submittedRequestCount: number,
  status: BatchStatus | null,
  result: BatchProcessCounts | null,
): string[] {
  if (!status) return ['batch status was unavailable'];

  const errors: string[] = [];
  if (status.requestCount !== submittedRequestCount) {
    errors.push(
      `provider total ${status.requestCount} != submitted ${submittedRequestCount}`,
    );
  }

  if (status.status !== 'completed') return errors;

  if (status.completedCount + status.failedCount !== status.requestCount) {
    errors.push(
      `provider completed+failed ${status.completedCount + status.failedCount} != total ${status.requestCount}`,
    );
  }
  if (status.completedCount > 0 && !status.outputFileId) {
    errors.push(
      `provider reported ${status.completedCount} completed request(s) without an output file`,
    );
  }
  if (status.failedCount > 0 && !status.errorFileId) {
    errors.push(
      `provider reported ${status.failedCount} failed request(s) without an error file`,
    );
  }
  if (!result) {
    errors.push('batch output processing result was unavailable');
  } else if (result.succeeded + result.failed !== submittedRequestCount) {
    errors.push(
      `processed lines ${result.succeeded + result.failed} != submitted ${submittedRequestCount}`,
    );
  }

  return errors;
}
