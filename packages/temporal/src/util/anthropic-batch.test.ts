import { beforeEach, describe, expect, it, vi } from 'vitest';

import { cancelAnthropicBatch, submitAnthropicBatch } from './anthropic-batch';

const mocks = vi.hoisted(() => ({
  cancel: vi.fn(),
  create: vi.fn(),
  retrieve: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class AnthropicMock {
    messages = {
      batches: {
        cancel: mocks.cancel,
        create: mocks.create,
        retrieve: mocks.retrieve,
      },
    };
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = 'test-key';
});

describe('Anthropic batch safety', () => {
  it('does not retry the non-idempotent create request', async () => {
    const requests = [
      {
        custom_id: 'request_1',
        params: {
          max_tokens: 10,
          messages: [{ role: 'user' as const, content: 'Test' }],
          model: 'claude-haiku-4-5',
        },
      },
    ];
    mocks.create.mockResolvedValue({ id: 'batch-1' });

    await expect(submitAnthropicBatch(requests)).resolves.toEqual({
      batchId: 'batch-1',
    });
    expect(mocks.create).toHaveBeenCalledWith({ requests }, { maxRetries: 0 });
  });

  it('skips cancellation when the batch already ended', async () => {
    mocks.retrieve.mockResolvedValue({ processing_status: 'ended' });

    await expect(cancelAnthropicBatch('batch-1')).resolves.toBeUndefined();
    expect(mocks.cancel).not.toHaveBeenCalled();
  });

  it('accepts only a confirmed ended-during-cancel race', async () => {
    mocks.retrieve
      .mockResolvedValueOnce({ processing_status: 'in_progress' })
      .mockResolvedValueOnce({ processing_status: 'ended' });
    mocks.cancel.mockRejectedValue(new Error('batch already ended'));

    await expect(cancelAnthropicBatch('batch-1')).resolves.toBeUndefined();
    expect(mocks.cancel).toHaveBeenCalledWith('batch-1');
    expect(mocks.retrieve).toHaveBeenCalledTimes(2);
  });

  it('propagates cancellation errors while the batch remains active', async () => {
    const error = new Error('permission denied');
    mocks.retrieve.mockResolvedValue({ processing_status: 'in_progress' });
    mocks.cancel.mockRejectedValue(error);

    await expect(cancelAnthropicBatch('batch-1')).rejects.toBe(error);
  });
});
