import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createChatCompletionTracked: vi.fn(),
}));

vi.mock('@letschurch/db', () => ({
  Annotation: {},
  Channel: {},
  db: {},
  TranscriptParagraph: {},
  UploadRecord: {},
}));

vi.mock('../../util/llm', () => ({
  ANNOTATE_FALLBACK_MODEL: 'anthropic/test-fallback',
  ANNOTATE_MODEL: 'openai/test-model',
  createChatCompletionTracked: mocks.createChatCompletionTracked,
}));

let buildAnnotationChatBody: typeof import('./annotate-transcript').buildAnnotationChatBody;
let runAnnotation: typeof import('./annotate-transcript').runAnnotation;

beforeAll(async () => {
  ({ buildAnnotationChatBody, runAnnotation } =
    await import('./annotate-transcript'));
});

beforeEach(() => {
  mocks.createChatCompletionTracked.mockReset();
});

describe('buildAnnotationChatBody', () => {
  it('leaves temperature unset for provider and eval model compatibility', () => {
    const body = buildAnnotationChatBody(
      [{ id: 'p1', order: 0, text: 'Test paragraph', words: [] }],
      { channelName: 'Test channel', title: null, description: null },
      'openai/test-model',
    );

    expect(body).not.toHaveProperty('temperature');
  });

  it('leaves temperature unset on the live and admin-eval request path', async () => {
    mocks.createChatCompletionTracked.mockResolvedValue({
      choices: [
        {
          finish_reason: 'stop',
          message: { content: 'Test paragraph' },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    });

    await runAnnotation(
      [{ id: 'p1', order: 0, text: 'Test paragraph', words: [] }],
      { channelName: 'Test channel', title: null, description: null },
      'openai/test-model',
      { via: 'openrouter' },
    );

    expect(mocks.createChatCompletionTracked).toHaveBeenCalledOnce();
    expect(mocks.createChatCompletionTracked.mock.calls[0]?.[0]).toMatchObject({
      fallbackModel: 'anthropic/test-fallback',
      model: 'openai/test-model',
      via: 'openrouter',
    });
    expect(
      mocks.createChatCompletionTracked.mock.calls[0]?.[0],
    ).not.toHaveProperty('temperature');
  });

  it('can disable recursive fallback when already calling the fallback model', async () => {
    mocks.createChatCompletionTracked.mockResolvedValue({
      choices: [
        {
          finish_reason: 'stop',
          message: { content: 'Test paragraph' },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    });

    await runAnnotation(
      [{ id: 'p1', order: 0, text: 'Test paragraph', words: [] }],
      { channelName: 'Test channel', title: null, description: null },
      'anthropic/test-fallback',
      { fallbackModel: null, via: 'openrouter' },
    );

    expect(mocks.createChatCompletionTracked).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackModel: null,
        model: 'anthropic/test-fallback',
        via: 'openrouter',
      }),
    );
  });
});
