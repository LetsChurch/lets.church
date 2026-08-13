import Anthropic from '@anthropic-ai/sdk';
import type {
  BatchCreateParams,
  MessageBatchIndividualResponse,
} from '@anthropic-ai/sdk/resources/messages/batches';
import { z } from 'zod';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (client) return client;
  const apiKey = z.string().trim().min(1).parse(process.env.ANTHROPIC_API_KEY);
  client = new Anthropic({ apiKey, maxRetries: 5 });
  return client;
}

export type AnthropicBatchRequest = BatchCreateParams.Request;

export type AnthropicBatchStatus = {
  status: 'in_progress' | 'canceling' | 'ended';
  requestCount: number;
  processingCount: number;
  succeededCount: number;
  failedCount: number;
};

export async function submitAnthropicBatch(
  requests: ReadonlyArray<AnthropicBatchRequest>,
): Promise<{ batchId: string }> {
  if (requests.length === 0) {
    throw new Error('submitAnthropicBatch: empty requests array');
  }
  // Anthropic does not document an idempotency key for batch creation. Do not
  // let the SDK retry this POST after an ambiguous network failure; the
  // workflow also configures this activity for one attempt.
  const batch = await getClient().messages.batches.create(
    { requests: [...requests] },
    { maxRetries: 0 },
  );
  return { batchId: batch.id };
}

export async function pollAnthropicBatch(
  batchId: string,
): Promise<AnthropicBatchStatus> {
  const batch = await getClient().messages.batches.retrieve(batchId);
  const counts = batch.request_counts;
  return {
    status: batch.processing_status,
    requestCount:
      counts.processing +
      counts.succeeded +
      counts.errored +
      counts.canceled +
      counts.expired,
    processingCount: counts.processing,
    succeededCount: counts.succeeded,
    failedCount: counts.errored + counts.canceled + counts.expired,
  };
}

export async function* downloadAnthropicBatchResults(
  batchId: string,
): AsyncGenerator<MessageBatchIndividualResponse, void, void> {
  const results = await getClient().messages.batches.results(batchId);
  for await (const result of results) yield result;
}

export async function cancelAnthropicBatch(batchId: string): Promise<void> {
  const anthropic = getClient();
  const current = await anthropic.messages.batches.retrieve(batchId);
  if (current.processing_status === 'ended') return;
  try {
    await anthropic.messages.batches.cancel(batchId);
  } catch (error) {
    // The batch can end between retrieve and cancel. Confirm that exact race;
    // authentication, permission, not-found, rate-limit, and server errors
    // remain actionable.
    try {
      const latest = await anthropic.messages.batches.retrieve(batchId);
      if (latest.processing_status === 'ended') return;
    } catch {
      // Preserve the cancellation error, which is the operation that failed.
    }
    throw error;
  }
}
