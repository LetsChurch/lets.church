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
    expect(
      mocks.createChatCompletionTracked.mock.calls[0]?.[0],
    ).not.toHaveProperty('service_tier');
  });

  it('uses Flex for direct OpenAI annotation requests', async () => {
    mocks.createChatCompletionTracked.mockResolvedValue({
      choices: [
        {
          finish_reason: 'stop',
          message: { content: 'Test paragraph' },
        },
      ],
      service_tier: 'flex',
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    });

    await runAnnotation(
      [{ id: 'p1', order: 0, text: 'Test paragraph', words: [] }],
      { channelName: 'Test channel', title: null, description: null },
      'openai/test-model',
      {
        serviceTier: 'flex',
        tracking: { activity: 'annotateTranscript' },
      },
    );

    expect(mocks.createChatCompletionTracked).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'openai/test-model',
        service_tier: 'flex',
        via: 'openai',
      }),
    );
  });

  it('keeps unmarked direct calls on the standard tier', async () => {
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
    );

    expect(
      mocks.createChatCompletionTracked.mock.calls[0]?.[0],
    ).not.toHaveProperty('service_tier');
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

describe('Bible annotation normalization', () => {
  it('coalesces adjacent spans for the same reference', async () => {
    const text = 'Proverbs 20, verse 17, says bread gained by deceit is sweet.';
    const words = text.split(/\s+/).map((word, index) => ({
      word,
      start: index,
      end: index + 1,
    }));
    mocks.createChatCompletionTracked.mockResolvedValue({
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content:
              '[Proverbs 20, verse 17](#bible?book=Prov&chapter=20&verse=17), says [bread gained by deceit is sweet](#bible?book=Prov&chapter=20&verse=17).',
          },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    });

    const result = await runAnnotation(
      [{ id: 'p1', order: 0, text, words }],
      { channelName: 'Test channel', title: null, description: null },
      'openai/test-model',
    );

    expect(result.annotations).toEqual([
      expect.objectContaining({
        paragraphId: 'p1',
        kind: 'BIBLE',
        startWord: 0,
        endWord: words.length,
        metadata: expect.objectContaining({
          book: 'Prov',
          chapter: 20,
          verse: 17,
        }),
      }),
    ]);
    expect(result.stats.bible).toBe(1);
  });

  it('preserves distinct mentions of the same reference', async () => {
    const text = 'John 3:16 is central. Later in the sermon John 3:16 returns.';
    const words = text.split(/\s+/).map((word, index) => ({
      word,
      start: index,
      end: index + 1,
    }));
    mocks.createChatCompletionTracked.mockResolvedValue({
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content:
              '[John 3:16](#bible?book=John&chapter=3&verse=16) is central. Later in the sermon [John 3:16](#bible?book=John&chapter=3&verse=16) returns.',
          },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    });

    const result = await runAnnotation(
      [{ id: 'p1', order: 0, text, words }],
      { channelName: 'Test channel', title: null, description: null },
      'openai/test-model',
    );

    expect(
      result.annotations.filter((annotation) => annotation.kind === 'BIBLE'),
    ).toHaveLength(2);
    expect(result.stats.bible).toBe(2);
  });
});
