import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertBatchSourceCurrent: vi.fn(),
  fingerprintAnnotationSource: vi.fn(() => 'source-fingerprint'),
  heartbeat: vi.fn(),
  insertValues: vi.fn(),
  recordLlmCall: vi.fn(),
  runAnnotation: vi.fn(),
  select: vi.fn(),
  transaction: vi.fn(),
}));

const upload = {
  title: 'Test upload',
  description: null,
  channelName: 'Test channel',
};
const paragraphs = [
  {
    id: 'paragraph-1',
    order: 0,
    text: 'Test paragraph',
    words: [{ word: 'Test', start: 0, end: 1 }],
  },
];
const fallbackAnnotations = [
  {
    paragraphId: 'paragraph-1',
    kind: 'OUTLINE' as const,
    startWord: null,
    endWord: null,
    rawSpan: null,
    metadata: { level: 1, title: 'Opening' },
  },
];

function queryResult<T>(value: T) {
  const query = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    orderBy: vi.fn(() => Promise.resolve(value)),
    then: (
      resolve: (result: T) => unknown,
      reject: (error: unknown) => unknown,
    ) => Promise.resolve(value).then(resolve, reject),
    where: vi.fn(),
  };
  query.from.mockReturnValue(query);
  query.innerJoin.mockReturnValue(query);
  query.where.mockReturnValue(query);
  return query;
}

const transactionClient = {
  delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
  insert: vi.fn(() => ({ values: mocks.insertValues })),
  select: mocks.select,
  update: vi.fn(() => ({
    set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
  })),
};

vi.mock('@letschurch/db', () => ({
  Annotation: { paragraphId: 'annotation.paragraphId' },
  Channel: { id: 'channel.id', name: 'channel.name' },
  db: {
    select: mocks.select,
    transaction: mocks.transaction,
  },
  TranscriptParagraph: {
    id: 'paragraph.id',
    order: 'paragraph.order',
    text: 'paragraph.text',
    uploadRecordId: 'paragraph.uploadRecordId',
    words: 'paragraph.words',
  },
  UploadRecord: {
    channelId: 'upload.channelId',
    description: 'upload.description',
    id: 'upload.id',
    sections: 'upload.sections',
    title: 'upload.title',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  asc: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn(),
  isNotNull: vi.fn(),
  sql: vi.fn(),
}));

vi.mock('@temporalio/activity', () => ({
  Context: { current: () => ({ heartbeat: mocks.heartbeat }) },
}));

vi.mock('../../util/llm', () => ({
  ANNOTATE_FALLBACK_MODEL: 'anthropic/claude-haiku-4-5',
  ANNOTATE_MODEL: 'openai/gpt-5.6-luna',
  EMBED_DIMS: 1536,
  EMBED_MAX_INPUTS: 2048,
  EMBED_MODEL: 'openai/text-embedding-3-small',
  recordLlmCall: mocks.recordLlmCall,
  SUMMARY_MODEL: 'openai/gpt-5.6-luna',
}));

vi.mock('../../util/llm-batch-source', () => ({
  assertBatchSourceCurrent: mocks.assertBatchSourceCurrent,
  fingerprintAnnotationSource: mocks.fingerprintAnnotationSource,
  fingerprintParagraphEmbeddingSource: vi.fn(),
  fingerprintSummaryEmbeddingSource: vi.fn(),
  fingerprintSummarySource: vi.fn(),
  parseBatchCustomId: vi.fn(),
}));

vi.mock('../../util/logger', () => ({
  default: { child: () => ({ info: vi.fn(), warn: vi.fn() }) },
}));

vi.mock('../../util/openai-batch', () => ({ downloadOutput: vi.fn() }));

vi.mock('./annotate-transcript', () => ({
  parseAnnotationResponse: vi.fn(),
  runAnnotation: mocks.runAnnotation,
}));

vi.mock('./summarize-upload', () => ({ parseSummaryResponse: vi.fn() }));

let handleAnnotate: typeof import('./process-llm-batch-output').handleAnnotate;

beforeAll(async () => {
  ({ handleAnnotate } = await import('./process-llm-batch-output'));
});

beforeEach(() => {
  vi.clearAllMocks();
  const results = [[upload], paragraphs, [upload], paragraphs];
  mocks.select.mockImplementation(() => queryResult(results.shift() ?? []));
  mocks.transaction.mockImplementation(async (callback) =>
    callback(transactionClient),
  );
  mocks.insertValues.mockResolvedValue(undefined);
  mocks.runAnnotation.mockResolvedValue({
    annotations: fallbackAnnotations,
    prompt: { system: 'system', user: 'user' },
    responseText: 'fallback output',
    skippedItems: [],
    stats: {
      bible: 0,
      completionTokens: 10,
      costUsd: null,
      durationMs: 1,
      keyword: 0,
      outline: 1,
      paragraphs: 1,
      promptTokens: 10,
      skipped: 0,
    },
  });
});

describe('handleAnnotate', () => {
  it('retries an OpenAI Batch content-filter response with Anthropic', async () => {
    await handleAnnotate('upload-1', 'source-fingerprint', {
      custom_id: 'a:upload-1:source-fingerprint',
      error: null,
      id: 'batch-line-1',
      response: {
        body: {
          choices: [
            { finish_reason: 'content_filter', message: { content: null } },
          ],
          usage: { completion_tokens: 0, prompt_tokens: 100 },
        },
        request_id: 'request-1',
        status_code: 200,
      },
    });

    expect(mocks.recordLlmCall).toHaveBeenCalledWith(
      expect.objectContaining({
        activity: 'annotateTranscript',
        finishReason: 'content_filter',
        model: 'openai/gpt-5.6-luna',
        outcome: 'guard_content_filter',
        uploadRecordId: 'upload-1',
        viaBatch: true,
      }),
    );
    expect(mocks.runAnnotation).toHaveBeenCalledWith(
      paragraphs,
      upload,
      'anthropic/claude-haiku-4-5',
      {
        fallbackModel: null,
        tracking: {
          activity: 'annotateTranscript',
          uploadRecordId: 'upload-1',
        },
        via: 'openrouter',
      },
    );
    expect(mocks.heartbeat).toHaveBeenNthCalledWith(1, {
      kind: 'annotate',
      phase: 'fallback',
      status: 'starting',
      uploadRecordId: 'upload-1',
    });
    expect(mocks.heartbeat).toHaveBeenNthCalledWith(2, {
      kind: 'annotate',
      phase: 'fallback',
      status: 'completed',
      uploadRecordId: 'upload-1',
    });
    expect(mocks.insertValues).toHaveBeenCalledWith([
      expect.objectContaining(fallbackAnnotations[0]),
    ]);
  });

  it('does not use Anthropic for non-content-filter guard failures', async () => {
    await expect(
      handleAnnotate('upload-1', 'source-fingerprint', {
        custom_id: 'a:upload-1:source-fingerprint',
        error: null,
        id: 'batch-line-1',
        response: {
          body: {
            choices: [
              { finish_reason: 'length', message: { content: 'truncated' } },
            ],
            usage: { completion_tokens: 10, prompt_tokens: 100 },
          },
          request_id: 'request-1',
          status_code: 200,
        },
      }),
    ).rejects.toThrow('finish_reason=length');

    expect(mocks.runAnnotation).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
