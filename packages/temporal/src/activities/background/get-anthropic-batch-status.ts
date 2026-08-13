import {
  type AnthropicBatchStatus,
  pollAnthropicBatch,
} from '../../util/anthropic-batch';

export default async function getAnthropicBatchStatus(
  batchId: string,
): Promise<AnthropicBatchStatus> {
  return pollAnthropicBatch(batchId);
}
