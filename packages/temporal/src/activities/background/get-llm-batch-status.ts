import { type BatchStatus, pollBatch } from '../../util/openai-batch';

/**
 * Single `batches.retrieve` call. The workflow does the actual wait
 * loop via `sleep()` so the long wait is durable across worker
 * restarts — much safer than a multi-hour heartbeating activity.
 */
export default async function getLlmBatchStatus(
  batchId: string,
): Promise<BatchStatus> {
  return pollBatch(batchId);
}
