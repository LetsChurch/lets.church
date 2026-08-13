import { beforeEach, describe, expect, it, vi } from 'vitest';

import processLlmBatchOutput, {
  handleAnnotate,
} from './process-llm-batch-output';

const mocks = vi.hoisted(() => ({
  assertBatchSourceCurrent: vi.fn(),
  downloadOutput: vi.fn(),
  fingerprintAnnotationSource: vi.fn(() => 'source-fingerprint'),
  insertValues: vi.fn(),
  parseBatchCustomId: vi.fn(),
  recordLlmCall: vi.fn(),
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
  Context: { current: () => ({ heartbeat: vi.fn() }) },
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
  parseBatchCustomId: mocks.parseBatchCustomId,
}));

vi.mock('../../util/logger', () => {
  const mockedLogger = {
    child: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };
  mockedLogger.child.mockReturnValue(mockedLogger);
  return { default: mockedLogger };
});

vi.mock('../../util/openai-batch', () => ({
  downloadOutput: mocks.downloadOutput,
}));

vi.mock('./annotate-transcript', () => ({
  parseAnnotationResponse: vi.fn(),
}));

vi.mock('./summarize-upload', () => ({ parseSummaryResponse: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  const results = [[upload], paragraphs, [upload], paragraphs];
  mocks.select.mockImplementation(() => queryResult(results.shift() ?? []));
  mocks.transaction.mockImplementation(async (callback) =>
    callback(transactionClient),
  );
  mocks.insertValues.mockResolvedValue(undefined);
  mocks.parseBatchCustomId.mockReturnValue({
    kind: 'annotate',
    uploadId: 'upload-1',
    sourceFingerprint: 'source-fingerprint',
    chunkIdx: null,
  });
});

const contentFilterLine = {
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
};

describe('OpenAI annotation batch fallback', () => {
  it('queues an Anthropic batch fallback for a content-filter response', async () => {
    await expect(
      handleAnnotate('upload-1', 'source-fingerprint', contentFilterLine),
    ).resolves.toBe('fallback');
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
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('returns fallback uploads to the workflow', async () => {
    mocks.downloadOutput.mockReturnValue(
      (async function* () {
        yield contentFilterLine;
      })(),
    );

    await expect(
      processLlmBatchOutput({
        batchId: 'batch-1',
        outputFileId: 'output-1',
        errorFileId: null,
        kind: 'annotate',
      }),
    ).resolves.toEqual({
      succeeded: 1,
      failed: 0,
      fallbackUploadIds: ['upload-1'],
      failedUploadIds: [],
    });
  });

  it('does not queue Anthropic for non-content-filter guard failures', async () => {
    await expect(
      handleAnnotate('upload-1', 'source-fingerprint', {
        ...contentFilterLine,
        response: {
          ...contentFilterLine.response,
          body: {
            choices: [
              { finish_reason: 'length', message: { content: 'truncated' } },
            ],
            usage: { completion_tokens: 10, prompt_tokens: 100 },
          },
        },
      }),
    ).rejects.toThrow('finish_reason=length');
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
