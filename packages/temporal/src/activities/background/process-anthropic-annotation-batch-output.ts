import { Context } from '@temporalio/activity';

import { downloadAnthropicBatchResults } from '../../util/anthropic-batch';
import { ANNOTATE_FALLBACK_MODEL, recordLlmCall } from '../../util/llm';
import { parseAnthropicAnnotationBatchCustomId } from '../../util/llm-batch-source';
import logger from '../../util/logger';
import type { BatchResponseLine } from '../../util/openai-batch';
import { handleAnnotate } from './process-llm-batch-output';

const moduleLogger = logger.child({
  module:
    'temporal/activities/background/process-anthropic-annotation-batch-output',
});

export type ProcessAnthropicAnnotationBatchOutputResult = {
  succeeded: number;
  failed: number;
  failedUploadIds: string[];
};

export default async function processAnthropicAnnotationBatchOutput(
  batchId: string,
): Promise<ProcessAnthropicAnnotationBatchOutputResult> {
  if (!ANNOTATE_FALLBACK_MODEL) {
    throw new Error('Anthropic annotation batch fallback is disabled');
  }

  let succeeded = 0;
  let failed = 0;
  const failedUploadIds = new Set<string>();
  for await (const line of downloadAnthropicBatchResults(batchId)) {
    const { uploadId, sourceFingerprint } =
      parseAnthropicAnnotationBatchCustomId(line.custom_id);
    try {
      if (line.result.type !== 'succeeded') {
        const errorMessage =
          line.result.type === 'errored'
            ? `${line.result.error.error.type}: ${line.result.error.error.message}`
            : `Anthropic batch request ${line.result.type}`;
        await recordLlmCall({
          model: ANNOTATE_FALLBACK_MODEL,
          activity: 'annotateTranscript',
          uploadRecordId: uploadId,
          promptTokens: null,
          completionTokens: null,
          durationMs: 0,
          outcome: 'batch_request_failed',
          errorMessage,
          viaBatch: true,
        });
        throw new Error(errorMessage);
      }

      const message = line.result.message;
      const raw = message.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('');
      const finishReason =
        message.stop_reason === 'max_tokens' ||
        message.stop_reason === 'model_context_window_exceeded'
          ? 'length'
          : message.stop_reason === 'refusal'
            ? 'content_filter'
            : (message.stop_reason ?? 'stop');
      const syntheticLine: BatchResponseLine = {
        id: message.id,
        custom_id: line.custom_id,
        error: null,
        response: {
          status_code: 200,
          request_id: message.id,
          body: {
            choices: [
              {
                finish_reason: finishReason,
                message: { content: raw || null },
              },
            ],
            usage: {
              prompt_tokens: message.usage.input_tokens,
              completion_tokens: message.usage.output_tokens,
            },
          },
        },
      };
      await handleAnnotate(uploadId, sourceFingerprint, syntheticLine, {
        model: ANNOTATE_FALLBACK_MODEL,
        allowFallback: false,
      });
      succeeded += 1;
    } catch (error) {
      failed += 1;
      failedUploadIds.add(uploadId);
      moduleLogger.warn(
        {
          err: error instanceof Error ? error : new Error(String(error)),
          uploadRecordId: uploadId,
          context: { batchId, customId: line.custom_id },
        },
        'Failed to apply Anthropic annotation batch result',
      );
    }
    Context.current().heartbeat({
      kind: 'annotate',
      provider: 'anthropic',
      phase: 'output',
      succeeded,
      failed,
    });
  }

  return { succeeded, failed, failedUploadIds: [...failedUploadIds] };
}
