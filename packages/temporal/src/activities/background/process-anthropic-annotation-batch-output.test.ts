import { beforeEach, describe, expect, it, vi } from 'vitest';

import processAnthropicAnnotationBatchOutput from './process-anthropic-annotation-batch-output';

const mocks = vi.hoisted(() => ({
  downloadAnthropicBatchResults: vi.fn(),
  handleAnnotate: vi.fn(),
  heartbeat: vi.fn(),
  recordLlmCall: vi.fn(),
}));

vi.mock('@temporalio/activity', () => ({
  Context: { current: () => ({ heartbeat: mocks.heartbeat }) },
}));

vi.mock('../../util/anthropic-batch', () => ({
  downloadAnthropicBatchResults: mocks.downloadAnthropicBatchResults,
}));

vi.mock('../../util/llm', () => ({
  ANNOTATE_FALLBACK_MODEL: 'anthropic/claude-haiku-4-5',
  recordLlmCall: mocks.recordLlmCall,
}));
vi.mock('../../util/llm-batch-source', () => ({
  parseAnthropicAnnotationBatchCustomId: vi.fn(() => ({
    kind: 'annotate',
    uploadId: 'upload-1',
    sourceFingerprint: 'source-fingerprint',
    chunkIdx: null,
  })),
}));

vi.mock('../../util/logger', () => ({
  default: { child: () => ({ warn: vi.fn() }) },
}));

vi.mock('./process-llm-batch-output', () => ({
  handleAnnotate: mocks.handleAnnotate,
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.handleAnnotate.mockResolvedValue('applied');
});

describe('processAnthropicAnnotationBatchOutput', () => {
  it('applies successful Anthropic batch messages through the shared annotation path', async () => {
    mocks.downloadAnthropicBatchResults.mockReturnValue(
      (async function* () {
        yield {
          custom_id: 'a:upload-1:source-fingerprint',
          result: {
            type: 'succeeded',
            message: {
              id: 'msg-1',
              content: [{ type: 'text', text: '# Heading\n\nTest paragraph' }],
              stop_reason: 'end_turn',
              usage: { input_tokens: 100, output_tokens: 20 },
            },
          },
        };
      })(),
    );

    await expect(
      processAnthropicAnnotationBatchOutput('batch-1'),
    ).resolves.toEqual({ succeeded: 1, failed: 0, failedUploadIds: [] });
    expect(mocks.handleAnnotate).toHaveBeenCalledWith(
      'upload-1',
      'source-fingerprint',
      expect.objectContaining({
        custom_id: 'a:upload-1:source-fingerprint',
        response: expect.objectContaining({
          body: expect.objectContaining({
            choices: [
              {
                finish_reason: 'end_turn',
                message: { content: '# Heading\n\nTest paragraph' },
              },
            ],
            usage: { prompt_tokens: 100, completion_tokens: 20 },
          }),
        }),
      }),
      {
        model: 'anthropic/claude-haiku-4-5',
        allowFallback: false,
      },
    );
  });

  it('records errored Anthropic batch requests without applying annotations', async () => {
    mocks.downloadAnthropicBatchResults.mockReturnValue(
      (async function* () {
        yield {
          custom_id: 'a:upload-1:source-fingerprint',
          result: {
            type: 'errored',
            error: {
              type: 'error',
              request_id: 'request-1',
              error: { type: 'overloaded_error', message: 'overloaded' },
            },
          },
        };
      })(),
    );

    await expect(
      processAnthropicAnnotationBatchOutput('batch-1'),
    ).resolves.toEqual({
      succeeded: 0,
      failed: 1,
      failedUploadIds: ['upload-1'],
    });
    expect(mocks.recordLlmCall).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'anthropic/claude-haiku-4-5',
        outcome: 'batch_request_failed',
        uploadRecordId: 'upload-1',
        viaBatch: true,
      }),
    );
    expect(mocks.handleAnnotate).not.toHaveBeenCalled();
  });
});
