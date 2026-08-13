import { cancelAnthropicBatch as cancelBatch } from '../../util/anthropic-batch';

export default async function cancelAnthropicBatch(
  batchId: string,
): Promise<void> {
  await cancelBatch(batchId);
}
