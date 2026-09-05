import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createChatCompletionTracked } from './llm';
import { DETERMINISTIC_LLM_FALLBACK_FAILURE } from './llm-completion-guards';
import { computeCost } from './llm-pricing';

const mocks = vi.hoisted(() => {
  process.env.OPENAI_API_KEY = 'test-openai-key';
  process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
  const insertReturning = vi.fn();
  const updateWhere = vi.fn();
  return {
    chatCreate: vi.fn(),
    insertReturning,
    insertValues: vi.fn((_values: unknown) => ({
      returning: insertReturning,
    })),
    updateSet: vi.fn((_values: unknown) => ({ where: updateWhere })),
    updateWhere,
  };
});

vi.mock('@letschurch/db', () => ({
  db: {
    insert: vi.fn(() => ({ values: mocks.insertValues })),
    update: vi.fn(() => ({ set: mocks.updateSet })),
  },
  LlmCall: { id: 'llm_call.id' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'llm_call.id = call-id'),
}));

vi.mock('openai', () => ({
  default: class OpenAI {
    chat = { completions: { create: mocks.chatCreate } };
    embeddings = { create: vi.fn() };
  },
}));

beforeEach(() => {
  mocks.chatCreate.mockReset();
  mocks.insertReturning.mockReset();
  mocks.insertReturning.mockResolvedValue([{ id: 'call-id' }]);
  mocks.insertValues.mockClear();
  mocks.updateSet.mockClear();
  mocks.updateWhere.mockReset();
  mocks.updateWhere.mockResolvedValue(undefined);
});

describe('createChatCompletionTracked Flex processing', () => {
  it('uses the Flex timeout and records Batch-rate cost without Batch tagging', async () => {
    mocks.chatCreate.mockResolvedValue({
      choices: [{ finish_reason: 'stop', message: { content: 'done' } }],
      service_tier: 'flex',
      usage: {
        prompt_tokens: 1_000_000,
        completion_tokens: 1_000_000,
      },
    });

    const standardCost = computeCost(
      'openai/gpt-5.6-luna',
      1_000_000,
      1_000_000,
    );
    expect(standardCost).not.toBeNull();

    await createChatCompletionTracked({
      model: 'openai/gpt-5.6-luna',
      messages: [{ role: 'user', content: 'work' }],
      service_tier: 'flex',
      tracking: { activity: 'annotateTranscript' },
    });

    expect(mocks.chatCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-5.6-luna',
        service_tier: 'flex',
      }),
      { maxRetries: 0, timeout: 60 * 60 * 1000 },
    );
    expect(mocks.insertValues.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        activity: 'annotateTranscript',
        outcome: 'started',
      }),
    );
    const settled = mocks.updateSet.mock.calls[0]?.[0];
    expect(settled).toEqual(
      expect.objectContaining({
        computedCostUsd: String((standardCost ?? 0) * 0.5),
        outcome: 'success',
      }),
    );
    expect(settled).not.toHaveProperty('viaBatch');
  });

  it('does not send the OpenAI service tier to an OpenRouter fallback', async () => {
    mocks.chatCreate
      .mockResolvedValueOnce({
        choices: [
          { finish_reason: 'content_filter', message: { content: null } },
        ],
        service_tier: 'flex',
        usage: { prompt_tokens: 10, completion_tokens: 0 },
      })
      .mockResolvedValueOnce({
        choices: [{ finish_reason: 'stop', message: { content: 'done' } }],
        usage: { prompt_tokens: 10, completion_tokens: 10 },
      });

    await createChatCompletionTracked({
      model: 'openai/gpt-5.6-luna',
      messages: [{ role: 'user', content: 'work' }],
      service_tier: 'flex',
      fallbackModel: 'anthropic/claude-haiku-4-5',
      tracking: { activity: 'annotateTranscript' },
    });

    const fallbackBody = mocks.chatCreate.mock.calls[1]?.[0];
    expect(fallbackBody).toMatchObject({
      model: 'anthropic/claude-haiku-4-5',
    });
    expect(fallbackBody).not.toHaveProperty('service_tier');
  });

  it('disables SDK retries and makes deterministic fallback guards non-retryable', async () => {
    mocks.chatCreate
      .mockResolvedValueOnce({
        choices: [
          { finish_reason: 'content_filter', message: { content: null } },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 0 },
      })
      .mockResolvedValueOnce({
        choices: [{ finish_reason: 'length', message: { content: 'partial' } }],
        usage: { prompt_tokens: 10, completion_tokens: 10 },
      });

    await expect(
      createChatCompletionTracked({
        model: 'openai/gpt-5.6-luna',
        messages: [{ role: 'user', content: 'work' }],
        fallbackModel: 'anthropic/claude-haiku-4-5',
        tracking: { activity: 'annotateTranscript' },
      }),
    ).rejects.toMatchObject({
      nonRetryable: true,
      type: DETERMINISTIC_LLM_FALLBACK_FAILURE,
    });

    expect(mocks.chatCreate.mock.calls[1]?.[1]).toEqual({ maxRetries: 0 });
    expect(mocks.insertValues).toHaveBeenCalledTimes(2);
    expect(mocks.updateSet.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({ outcome: 'guard_length_truncation' }),
    );
  });

  it('returns a completed provider response when settling its audit row fails', async () => {
    mocks.chatCreate.mockResolvedValue({
      choices: [{ finish_reason: 'stop', message: { content: 'done' } }],
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    });
    mocks.updateWhere.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(
      createChatCompletionTracked({
        model: 'openai/gpt-5.6-luna',
        messages: [{ role: 'user', content: 'work' }],
        tracking: { activity: 'annotateTranscript' },
      }),
    ).resolves.toMatchObject({
      choices: [{ message: { content: 'done' } }],
    });
    expect(mocks.chatCreate).toHaveBeenCalledOnce();
  });

  it('rejects Flex on user-facing tracked activities', async () => {
    await expect(
      createChatCompletionTracked({
        model: 'openai/gpt-5.6-luna',
        messages: [{ role: 'user', content: 'work' }],
        service_tier: 'flex',
        tracking: { activity: 'searchAnswerAgent' },
      }),
    ).rejects.toThrow(
      'OpenAI Flex is restricted to tracked background annotation and summary activities',
    );
    expect(mocks.chatCreate).not.toHaveBeenCalled();
  });
});
