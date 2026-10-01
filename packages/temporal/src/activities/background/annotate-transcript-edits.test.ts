import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runAnnotation, type EvalParagraph } from './annotate-transcript';
import { runAnnotationEdits } from './annotate-transcript-edits';

const mocks = vi.hoisted(() => ({ createChatCompletionTracked: vi.fn() }));
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

beforeEach(() => mocks.createChatCompletionTracked.mockReset());

const metadata = {
  channelName: 'Test church',
  title: 'Scripture and doctrine',
  description: null,
};
type SourceData = {
  snapshot: string;
  last: string;
  paragraphs: Array<{ at: string; text: string }>;
};
type RepairData = {
  invalidOperations: Array<{
    slot: string;
    original: {
      at: string;
      text: string;
      ref: Record<string, unknown>;
      title?: string;
    };
    allowedAt: string[];
    dropReason?: string;
  }>;
  sourceParagraphs: Array<{ at: string; text: string }>;
};

function paragraph(id: string, text: string, order = 0): EvalParagraph {
  return {
    id,
    order,
    text,
    words: text.split(/\s+/).map((word, index) => ({
      word,
      start: index * 0.5,
      end: (index + 1) * 0.5,
    })),
  };
}
function envelope(
  data: SourceData,
  values: {
    headings?: unknown[];
    wraps?: unknown[];
    keywords?: unknown[];
  } = {},
) {
  return {
    snapshot: data.snapshot,
    last: data.last,
    headings: [],
    wraps: [],
    keywords: [],
    ...values,
  };
}
function reply<T>(
  build: (data: T) => unknown,
  usage: {
    prompt_tokens?: number;
    completion_tokens?: number;
    cost?: number;
  } = { prompt_tokens: 10, completion_tokens: 20, cost: 0.01 },
  format?: (json: string) => string,
) {
  mocks.createChatCompletionTracked.mockImplementationOnce(
    (request: { messages: Array<{ content: string }> }) => {
      const json = JSON.stringify(
        build(JSON.parse(request.messages[1]?.content ?? '{}') as T),
      );
      return {
        choices: [
          {
            finish_reason: 'stop',
            message: { content: format ? format(json) : json },
          },
        ],
        usage,
      };
    },
  );
}

async function annotate(paragraphs: EvalParagraph[]) {
  return runAnnotationEdits(paragraphs, metadata, 'openai/test-model', {
    via: 'openrouter',
    fallbackModel: null,
  });
}

describe('exact-source span annotation', () => {
  it.each([
    ['JSON fence', '```json', '\n'],
    ['bare fence', '```', '\n'],
    ['case-insensitive JSON fence with CRLF', '```JSON', '\r\n'],
  ])(
    'accepts a complete outer %s without changing source spans',
    async (_name, opening, newline) => {
      const source = paragraph('p1', 'John 3:16 teaches grace.');
      reply<SourceData>(
        (data) =>
          envelope(data, {
            wraps: [
              {
                at: data.paragraphs[0]?.at,
                text: 'John 3:16',
                ref: { book: 'John', chapter: 3, verse: 16 },
              },
            ],
          }),
        undefined,
        (json) => ` \n${opening}${newline}${json}${newline}\`\`\`\n `,
      );
      const result = await annotate([source]);
      expect(result.editDiagnostics).toMatchObject({
        valid: true,
        repairAttempted: false,
      });
      expect(result.annotations).toEqual([
        {
          paragraphId: 'p1',
          kind: 'BIBLE',
          startWord: 0,
          endWord: 2,
          rawSpan: 'John 3:16',
          metadata: { book: 'John', chapter: 3, verse: 16 },
        },
      ]);
    },
  );

  it('accepts a fenced targeted repair and still selects the exact second occurrence', async () => {
    const source = paragraph('p1', 'John 3:16 opens. Later John 3:16 closes.');
    reply<SourceData>((data) =>
      envelope(data, {
        wraps: [
          {
            at: data.paragraphs[0]?.at,
            text: 'John 3:16',
            ref: { book: 'John', chapter: 3, verse: 16 },
          },
        ],
      }),
    );
    reply<RepairData>(
      (data) => ({
        repairs: data.invalidOperations.map((problem) => ({
          slot: problem.slot,
          action: 'replace',
          value: { ...problem.original, before: 'Later ', after: ' closes.' },
        })),
      }),
      undefined,
      (json) => `\`\`\`json\n${json}\n\`\`\``,
    );
    const result = await annotate([source]);
    expect(result.editDiagnostics).toMatchObject({
      valid: true,
      repairAttempted: true,
      errors: [],
    });
    expect(result.annotations).toEqual([
      {
        paragraphId: 'p1',
        kind: 'BIBLE',
        startWord: 4,
        endWord: 6,
        rawSpan: 'John 3:16',
        metadata: { book: 'John', chapter: 3, verse: 16 },
      },
    ]);
  });

  it.each([
    [
      'leading commentary',
      (json: string) => `Here is the result:\n\`\`\`json\n${json}\n\`\`\``,
    ],
    [
      'trailing commentary',
      (json: string) => `\`\`\`json\n${json}\n\`\`\`\nDone.`,
    ],
    ['missing closing fence', (json: string) => `\`\`\`json\n${json}`],
    [
      'multiple fenced replies',
      (json: string) =>
        `\`\`\`json\n${json}\n\`\`\`\n\`\`\`json\n${json}\n\`\`\``,
    ],
  ])(
    'rejects %s rather than extracting embedded JSON',
    async (_name, format) => {
      reply<SourceData>((data) => envelope(data), undefined, format);
      const result = await annotate([
        paragraph('p1', 'John 3:16 teaches grace.'),
      ]);
      expect(result.annotations).toEqual([]);
      expect(result.editDiagnostics).toMatchObject({
        valid: false,
        repairAttempted: false,
        errors: [{ reason: 'invalid_json' }],
      });
    },
  );

  it('does not bypass source identity checks inside a complete fence', async () => {
    reply<SourceData>(
      (data) => ({ ...envelope(data), snapshot: 'wrong-source' }),
      undefined,
      (json) => `\`\`\`json\n${json}\n\`\`\``,
    );
    const result = await annotate([
      paragraph('p1', 'John 3:16 teaches grace.'),
    ]);
    expect(result.annotations).toEqual([]);
    expect(result.editDiagnostics).toMatchObject({
      valid: false,
      repairAttempted: false,
      errors: [{ reason: 'invalid_snapshot' }],
    });
  });

  it('uses adjacent context to select the second same-paragraph occurrence', async () => {
    const source = paragraph('p1', 'John 3:16 opens. Later John 3:16 closes.');
    reply<SourceData>((data) =>
      envelope(data, {
        wraps: [
          {
            at: data.paragraphs[0]?.at,
            text: 'John 3:16',
            before: 'Later ',
            after: ' closes.',
            ref: { book: 'John', chapter: 3, verse: 16 },
          },
        ],
      }),
    );
    const result = await annotate([source]);
    expect(result.annotations).toEqual([
      {
        paragraphId: 'p1',
        kind: 'BIBLE',
        startWord: 4,
        endWord: 6,
        rawSpan: 'John 3:16',
        metadata: { book: 'John', chapter: 3, verse: 16 },
      },
    ]);
    expect(result.editDiagnostics).toMatchObject({
      valid: true,
      repairAttempted: false,
      errors: [],
    });
  });

  it('rejects ambiguity rather than silently using the first occurrence', async () => {
    const source = paragraph('p1', 'John 3:16 opens. Later John 3:16 closes.');
    reply<SourceData>((data) =>
      envelope(data, {
        wraps: [
          {
            at: data.paragraphs[0]?.at,
            text: 'John 3:16',
            ref: { book: 'John', chapter: 3, verse: 16 },
          },
        ],
      }),
    );
    reply<RepairData>((data) => ({
      repairs: data.invalidOperations.map((problem) => ({
        slot: problem.slot,
        action: 'replace',
        value: problem.original,
      })),
    }));
    const result = await annotate([source]);
    expect(result.annotations).toEqual([]);
    expect(result.editDiagnostics).toMatchObject({
      valid: false,
      repairAttempted: true,
      errors: [expect.objectContaining({ reason: 'ambiguous_text' })],
    });
  });

  it('repairs an ambiguous phrase by selecting the second occurrence with exact context', async () => {
    const source = paragraph('p1', 'John 3:16 opens. Later John 3:16 closes.');
    reply<SourceData>((data) =>
      envelope(data, {
        wraps: [
          {
            at: data.paragraphs[0]?.at,
            text: 'John 3:16',
            ref: { book: 'John', chapter: 3, verse: 16 },
          },
        ],
      }),
    );
    reply<RepairData>((data) => ({
      repairs: data.invalidOperations.map((problem) => ({
        slot: problem.slot,
        action: 'replace',
        value: { ...problem.original, before: 'Later ', after: ' closes.' },
      })),
    }));
    const result = await annotate([source]);
    expect(result.annotations).toEqual([
      {
        paragraphId: 'p1',
        kind: 'BIBLE',
        startWord: 4,
        endWord: 6,
        rawSpan: 'John 3:16',
        metadata: { book: 'John', chapter: 3, verse: 16 },
      },
    ]);
    expect(result.editDiagnostics).toMatchObject({
      valid: true,
      repairAttempted: true,
      initialErrors: [expect.objectContaining({ reason: 'ambiguous_text' })],
      errors: [],
    });
  });

  it('repairs an invalid target while retaining valid Bible and outline operations and reference intent', async () => {
    const paragraphs = [
      paragraph('p1', 'Romans 8:28 assures us of providence.'),
      paragraph('p2', 'The Word became flesh and dwelt among us.', 1),
    ];
    reply<SourceData>(
      (data) =>
        envelope(data, {
          headings: [
            {
              at: data.paragraphs[0]?.at,
              title: 'Providence and the Incarnation',
            },
          ],
          wraps: [
            {
              at: data.paragraphs[0]?.at,
              text: 'Romans 8:28',
              ref: { book: 'Rom', chapter: 8, verse: 28 },
            },
            {
              at: data.paragraphs[0]?.at,
              text: 'The Word became flesh',
              ref: { book: 'John', chapter: 1, verse: 14 },
            },
          ],
        }),
      { prompt_tokens: 100, completion_tokens: 30, cost: 0.03 },
    );
    reply<RepairData>(
      (data) => ({
        repairs: data.invalidOperations.map((problem) => ({
          slot: problem.slot,
          action: 'replace',
          value: {
            ...problem.original,
            at: data.sourceParagraphs.find((entry) =>
              entry.text.includes(problem.original.text),
            )?.at,
          },
        })),
      }),
      { prompt_tokens: 40, completion_tokens: 15, cost: 0.02 },
    );
    const result = await annotate(paragraphs);
    expect(result.annotations).toEqual([
      {
        paragraphId: 'p1',
        kind: 'OUTLINE',
        startWord: null,
        endWord: null,
        rawSpan: null,
        metadata: { level: 1, title: 'Providence and the Incarnation' },
      },
      {
        paragraphId: 'p1',
        kind: 'BIBLE',
        startWord: 0,
        endWord: 2,
        rawSpan: 'Romans 8:28',
        metadata: { book: 'Rom', chapter: 8, verse: 28 },
      },
      {
        paragraphId: 'p2',
        kind: 'BIBLE',
        startWord: 0,
        endWord: 4,
        rawSpan: 'The Word became flesh',
        metadata: { book: 'John', chapter: 1, verse: 14 },
      },
    ]);
    expect(result.editDiagnostics).toMatchObject({
      valid: true,
      repairAttempted: true,
      initialErrors: [
        expect.objectContaining({
          reason: 'text_or_context_not_found',
          slot: 'wraps:1',
        }),
      ],
      errors: [],
    });
    expect(result.stats).toMatchObject({
      outline: 1,
      bible: 2,
      promptTokens: 140,
      completionTokens: 45,
      costUsd: 0.05,
    });
  });

  it.each(['drop', 'change-reference'] as const)(
    'rejects unauthorized %s rather than hiding a rejected quotation',
    async (action) => {
      const paragraphs = [
        paragraph('p1', 'We study the incarnation.'),
        paragraph('p2', 'The Word became flesh.', 1),
      ];
      reply<SourceData>((data) =>
        envelope(data, {
          wraps: [
            {
              at: data.paragraphs[0]?.at,
              text: 'The Word became flesh',
              ref: { book: 'John', chapter: 1, verse: 14 },
            },
          ],
        }),
      );
      reply<RepairData>((data) => ({
        repairs: data.invalidOperations.map((problem) =>
          action === 'drop'
            ? { slot: problem.slot, action: 'drop', reason: 'duplicate' }
            : {
                slot: problem.slot,
                action: 'replace',
                value: {
                  ...problem.original,
                  at: data.sourceParagraphs.find((entry) =>
                    entry.text.includes(problem.original.text),
                  )?.at,
                  ref: { book: 'John', chapter: 3, verse: 16 },
                },
              },
        ),
      }));
      const result = await annotate(paragraphs);
      expect(result.annotations).toEqual([]);
      expect(result.editDiagnostics).toMatchObject({
        valid: false,
        repairAttempted: true,
        errors: [
          expect.objectContaining({
            reason:
              action === 'drop'
                ? 'unauthorized_drop'
                : 'replacement_target_or_reference_changed',
          }),
        ],
      });
    },
  );

  it.each(['snapshot', 'last'] as const)(
    'does not repair invalid %s identity',
    async (field) => {
      reply<SourceData>((data) => ({
        ...envelope(data),
        [field]: 'unrelated-source',
      }));
      const result = await annotate([
        paragraph('p1', 'John 3:16 teaches divine love.'),
      ]);
      expect(result.annotations).toEqual([]);
      expect(result.editDiagnostics).toMatchObject({
        valid: false,
        repairAttempted: false,
        errors: [{ reason: `invalid_${field}` }],
      });
    },
  );

  it('keeps canonical keyword propagation across case, punctuation and Bible spans', async () => {
    const paragraphs = [
      paragraph('p1', 'We teach imputed righteousness.'),
      paragraph(
        'p2',
        'Imputed righteousness, not earned merit, is our subject.',
        1,
      ),
    ];
    reply<SourceData>((data) =>
      envelope(data, {
        wraps: [
          {
            at: data.paragraphs[0]?.at,
            text: 'imputed righteousness',
            ref: { book: 'Rom', chapter: 4 },
          },
        ],
        keywords: ['imputed righteousness'],
      }),
    );
    const edits = await annotate(paragraphs);
    mocks.createChatCompletionTracked.mockResolvedValueOnce({
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content:
              'We teach [imputed righteousness](#keyword).\n\nImputed righteousness, not earned merit, is our subject.',
          },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 20 },
    });
    const markdown = await runAnnotation(
      paragraphs,
      metadata,
      'openai/test-model',
      { fallbackModel: null },
    );
    expect(
      edits.annotations.filter((annotation) => annotation.kind === 'KEYWORD'),
    ).toEqual(
      markdown.annotations.filter(
        (annotation) => annotation.kind === 'KEYWORD',
      ),
    );
    expect(
      edits.annotations.filter((annotation) => annotation.kind === 'KEYWORD'),
    ).toEqual([
      {
        paragraphId: 'p1',
        kind: 'KEYWORD',
        startWord: 2,
        endWord: 4,
        rawSpan: 'imputed righteousness',
        metadata: {},
      },
      {
        paragraphId: 'p2',
        kind: 'KEYWORD',
        startWord: 0,
        endWord: 2,
        rawSpan: 'imputed righteousness',
        metadata: {},
      },
    ]);
    expect(edits.stats).toMatchObject({ bible: 1, keyword: 2 });
  });

  it('only authorizes a covered-span drop when reference metadata agrees', async () => {
    const source = paragraph('p1', 'God so loved the world.');
    reply<SourceData>((data) =>
      envelope(data, {
        wraps: [
          {
            at: data.paragraphs[0]?.at,
            text: 'God so loved the world',
            ref: { book: 'John', chapter: 3, verse: 16 },
          },
          {
            at: data.paragraphs[0]?.at,
            text: 'loved the world',
            ref: { book: 'John', chapter: 1, verse: 14 },
          },
        ],
      }),
    );
    reply<RepairData>((data) => ({
      repairs: data.invalidOperations.map((problem) => ({
        slot: problem.slot,
        action: 'drop',
        reason: 'already_covered',
      })),
    }));
    const result = await annotate([source]);
    expect(result.annotations).toEqual([]);
    expect(result.editDiagnostics.errors).toEqual([
      expect.objectContaining({ reason: 'unauthorized_drop' }),
    ]);
  });

  it('accepts a deterministic duplicate drop without losing the retained annotation', async () => {
    const source = paragraph('p1', 'John 3:16 teaches divine love.');
    reply<SourceData>((data) => {
      const wrap = {
        at: data.paragraphs[0]?.at,
        text: 'John 3:16',
        ref: { book: 'John', chapter: 3, verse: 16 },
      };
      return envelope(data, { wraps: [wrap, wrap] });
    });
    reply<RepairData>((data) => ({
      repairs: data.invalidOperations.map((problem) => ({
        slot: problem.slot,
        action: 'drop',
        reason: 'duplicate',
      })),
    }));
    const result = await annotate([source]);
    expect(result.annotations).toEqual([
      {
        paragraphId: 'p1',
        kind: 'BIBLE',
        startWord: 0,
        endWord: 2,
        rawSpan: 'John 3:16',
        metadata: { book: 'John', chapter: 3, verse: 16 },
      },
    ]);
    expect(result.editDiagnostics).toMatchObject({
      valid: true,
      repairAttempted: true,
    });
  });

  it('rejects replacement operations that steal an earlier locked annotation location', async () => {
    const paragraphs = [
      paragraph('p1', 'Unrelated introduction.'),
      paragraph('p2', 'John 3:16 teaches divine love.', 1),
    ];
    reply<SourceData>((data) =>
      envelope(data, {
        wraps: [
          {
            at: data.paragraphs[0]?.at,
            text: 'John 3:16',
            ref: { book: 'John', chapter: 3, verse: 16 },
          },
          {
            at: data.paragraphs[1]?.at,
            text: 'John 3:16',
            ref: { book: 'John', chapter: 3, verse: 16 },
          },
        ],
      }),
    );
    reply<RepairData>((data) => ({
      repairs: data.invalidOperations.map((problem) => ({
        slot: problem.slot,
        action: 'replace',
        value: {
          ...problem.original,
          at: data.sourceParagraphs.find((entry) =>
            entry.text.includes(problem.original.text),
          )?.at,
        },
      })),
    }));
    const result = await annotate(paragraphs);
    expect(result.annotations).toEqual([]);
    expect(result.editDiagnostics.errors).toContainEqual({
      reason: 'locked_operation_changed',
      slot: 'wraps:1',
    });
  });

  it('rejects invalid reference metadata without replacing its intent', async () => {
    reply<SourceData>((data) =>
      envelope(data, {
        wraps: [
          {
            at: data.paragraphs[0]?.at,
            text: 'The Gospel of Thomas',
            ref: { book: 'Thomas', chapter: 1 },
          },
        ],
      }),
    );
    const result = await annotate([
      paragraph('p1', 'The Gospel of Thomas is not canonical.'),
    ]);
    expect(result.annotations).toEqual([]);
    expect(result.editDiagnostics).toMatchObject({
      valid: false,
      repairAttempted: false,
    });
    expect(result.editDiagnostics.errors).toContainEqual(
      expect.objectContaining({ reason: 'invalid_metadata' }),
    );
  });

  it('rejects unaligned source words instead of manufacturing word indices', async () => {
    const source = paragraph('p1', 'John 3:16 teaches divine love.');
    source.words = source.words.slice(1);
    reply<SourceData>((data) =>
      envelope(data, {
        wraps: [
          {
            at: data.paragraphs[0]?.at,
            text: 'John 3:16',
            ref: { book: 'John', chapter: 3, verse: 16 },
          },
        ],
      }),
    );
    reply<RepairData>((data) => ({
      repairs: data.invalidOperations.map((problem) => ({
        slot: problem.slot,
        action: 'unresolved',
        reason: 'Source words are unaligned.',
      })),
    }));
    const result = await annotate([source]);
    expect(result.annotations).toEqual([]);
    expect(result.editDiagnostics.initialErrors).toContainEqual(
      expect.objectContaining({ reason: 'missing_word_alignment' }),
    );
    expect(result.editDiagnostics.valid).toBe(false);
  });

  it('coalesces adjacent citations and quotations using canonical same-reference normalization', async () => {
    const source = paragraph(
      'p1',
      'Proverbs 20, verse 17, says bread gained by deceit is sweet.',
    );
    reply<SourceData>((data) =>
      envelope(data, {
        wraps: [
          {
            at: data.paragraphs[0]?.at,
            text: 'Proverbs 20, verse 17',
            ref: { book: 'Prov', chapter: 20, verse: 17 },
          },
          {
            at: data.paragraphs[0]?.at,
            text: 'bread gained by deceit is sweet',
            ref: { book: 'Prov', chapter: 20, verse: 17 },
          },
        ],
      }),
    );
    const result = await annotate([source]);
    expect(result.annotations).toEqual([
      {
        paragraphId: 'p1',
        kind: 'BIBLE',
        startWord: 0,
        endWord: source.words.length,
        rawSpan: 'Proverbs 20, verse 17, says bread gained by deceit is sweet',
        metadata: { book: 'Prov', chapter: 20, verse: 17 },
      },
    ]);
    expect(result.stats.bible).toBe(1);
  });

  it('keeps aggregate usage unknown if either actual completion omits it', async () => {
    const paragraphs = [
      paragraph('p1', 'Introduction.'),
      paragraph('p2', 'John 3:16 teaches divine love.', 1),
    ];
    reply<SourceData>((data) =>
      envelope(data, {
        wraps: [
          {
            at: data.paragraphs[0]?.at,
            text: 'John 3:16',
            ref: { book: 'John', chapter: 3, verse: 16 },
          },
        ],
      }),
    );
    reply<RepairData>(
      (data) => ({
        repairs: data.invalidOperations.map((problem) => ({
          slot: problem.slot,
          action: 'replace',
          value: {
            ...problem.original,
            at: data.sourceParagraphs.find((entry) =>
              entry.text.includes(problem.original.text),
            )?.at,
          },
        })),
      }),
      {},
    );
    const result = await annotate(paragraphs);
    expect(result.editDiagnostics.valid).toBe(true);
    expect(result.stats).toMatchObject({
      promptTokens: null,
      completionTokens: null,
      costUsd: null,
    });
  });

  it('rejects a repair response missing a requested slot', async () => {
    const paragraphs = [
      paragraph('p1', 'Introduction.'),
      paragraph('p2', 'John 3:16 teaches divine love.', 1),
    ];
    reply<SourceData>((data) =>
      envelope(data, {
        wraps: [
          {
            at: data.paragraphs[0]?.at,
            text: 'John 3:16',
            ref: { book: 'John', chapter: 3, verse: 16 },
          },
        ],
      }),
    );
    reply<RepairData>(() => ({ repairs: [] }));
    const result = await annotate(paragraphs);
    expect(result.annotations).toEqual([]);
    expect(result.editDiagnostics.errors).toEqual([
      { reason: 'invalid_repair_envelope' },
    ]);
  });

  it('rejects more than 128 invalid slots without attempting a regeneration', async () => {
    const source = paragraph(
      'p1',
      Array.from({ length: 140 }, () => 'teaching').join(' '),
    );
    reply<SourceData>((data) =>
      envelope(data, {
        wraps: Array.from({ length: 129 }, () => ({
          at: data.paragraphs[0]?.at,
          text: 'Absent citation',
          ref: { book: 'John', chapter: 3, verse: 16 },
        })),
      }),
    );
    const result = await annotate([source]);
    expect(result.annotations).toEqual([]);
    expect(result.editDiagnostics).toMatchObject({
      valid: false,
      repairAttempted: false,
    });
    expect(result.editDiagnostics.errors).toContainEqual({
      reason: 'repair_slot_limit',
    });
  });
});
