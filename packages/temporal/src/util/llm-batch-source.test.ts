import { describe, expect, it } from 'vitest';

import {
  assertBatchSourceCurrent,
  buildBatchCustomId,
  fingerprintAnnotationSource,
  fingerprintParagraphEmbeddingSource,
  fingerprintSummaryEmbeddingSource,
  fingerprintSummarySource,
  fingerprintTranscriptSource,
  parseBatchCustomId,
} from './llm-batch-source';

const uploadId = '123e4567-e89b-12d3-a456-426614174000';
const metadata = {
  channelName: 'Channel',
  title: 'Title',
  description: 'Description',
};
const paragraphs = [
  {
    id: '223e4567-e89b-12d3-a456-426614174000',
    order: 0,
    text: 'Paragraph text',
    words: [{ word: 'Paragraph', start: 0, end: 1 }],
  },
];

describe('batch source fingerprints', () => {
  it('is deterministic and changes with annotation source data', () => {
    const fingerprint = fingerprintAnnotationSource(metadata, paragraphs);
    expect(fingerprintAnnotationSource(metadata, paragraphs)).toBe(fingerprint);
    expect(
      fingerprintAnnotationSource(metadata, [
        { ...paragraphs[0]!, text: 'Changed paragraph' },
      ]),
    ).not.toBe(fingerprint);
    expect(
      fingerprintAnnotationSource(
        { ...metadata, channelName: 'Renamed channel' },
        paragraphs,
      ),
    ).not.toBe(fingerprint);
  });

  it('versions summary prompts, paragraph embeddings, and summary embeddings', () => {
    const sections = [
      { id: 'section-1', title: 'Opening', firstParagraphOrder: 0 },
    ];
    expect(fingerprintSummarySource(metadata, paragraphs, sections)).not.toBe(
      fingerprintSummarySource(metadata, paragraphs, [
        { ...sections[0]!, id: 'section-2' },
      ]),
    );
    expect(fingerprintParagraphEmbeddingSource(paragraphs)).not.toBe(
      fingerprintParagraphEmbeddingSource([
        { ...paragraphs[0]!, id: 'new-paragraph-id' },
      ]),
    );
    expect(fingerprintSummaryEmbeddingSource('summary', 'search')).not.toBe(
      fingerprintSummaryEmbeddingSource('new summary', 'search'),
    );
  });

  it('versions transcript replacement inputs but ignores non-source fields', () => {
    const source = [
      {
        order: 0,
        start: 0,
        end: 1,
        speaker: null,
        speakerEmbedding: null,
        text: 'Text',
        words: [{ word: 'Text', start: 0, end: 1 }],
      },
    ];
    expect(fingerprintTranscriptSource(source)).toBe(
      fingerprintTranscriptSource(
        source.map((row) => ({
          ...row,
          // PostgreSQL JSONB may return object keys in a different order than
          // the freshly parsed transcript JSON; semantic equality must win.
          words: [{ end: 1, start: 0, word: 'Text' }],
        })),
      ),
    );
    expect(fingerprintTranscriptSource(source)).not.toBe(
      fingerprintTranscriptSource(source.map((row) => ({ ...row, end: 1.25 }))),
    );
  });
});

describe('batch custom ids', () => {
  const sourceFingerprint = fingerprintAnnotationSource(metadata, paragraphs);

  it('round-trips fingerprinted ids for every request kind', () => {
    expect(
      parseBatchCustomId(
        buildBatchCustomId('annotate', uploadId, sourceFingerprint),
      ),
    ).toEqual({
      kind: 'annotate',
      uploadId,
      sourceFingerprint,
      chunkIdx: null,
    });
    const paragraphId = buildBatchCustomId(
      'embed-paragraphs',
      uploadId,
      sourceFingerprint,
      12,
    );
    expect(paragraphId.length).toBeLessThanOrEqual(64);
    expect(parseBatchCustomId(paragraphId)).toEqual({
      kind: 'embed-paragraphs',
      uploadId,
      sourceFingerprint,
      chunkIdx: 12,
    });
  });

  it('parses legacy ids only so apply-side validation can reject them safely', () => {
    expect(parseBatchCustomId(`summarize:${uploadId}`)).toEqual({
      kind: 'summarize',
      uploadId,
      sourceFingerprint: null,
      chunkIdx: null,
    });
  });

  it('rejects chunk indices that cannot round-trip as safe integers', () => {
    expect(() =>
      parseBatchCustomId(
        `ep:${uploadId}:${sourceFingerprint}:9007199254740992`,
      ),
    ).toThrow('Malformed Batch API custom_id');
    expect(() =>
      parseBatchCustomId(`embed-paragraphs:${uploadId}:9007199254740992`),
    ).toThrow('Malformed Batch API custom_id');
  });

  it('rejects stale and unverifiable source versions', () => {
    expect(() =>
      assertBatchSourceCurrent('a:id:fingerprint', null, sourceFingerprint),
    ).toThrow('has no source fingerprint');
    expect(() =>
      assertBatchSourceCurrent(
        'a:id:fingerprint',
        '00000000000000000000',
        sourceFingerprint,
      ),
    ).toThrow('is stale');
    expect(() =>
      assertBatchSourceCurrent(
        'a:id:fingerprint',
        sourceFingerprint,
        sourceFingerprint,
      ),
    ).not.toThrow();
  });
});
