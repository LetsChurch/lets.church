import { cancelBatch } from '../../util/openai-batch';

/**
 * Best-effort `batches.cancel`. Called from a non-cancellable
 * cleanup scope in the workflow when the surrounding poll loop is
 * cancelled, so a cancelled reprocess doesn't keep accruing OpenAI
 * token quota. Failures are swallowed inside `cancelBatch`.
 */
export default async function cancelLlmBatch(batchId: string): Promise<void> {
  await cancelBatch(batchId);
}
