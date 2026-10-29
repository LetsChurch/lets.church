import { describe, expect, test } from 'vitest';

import { augmentBibleAnnotations, mergeCandidates } from '.';
import type { ResolvedAnnotation } from '../../activities/background/annotate-transcript';
import { findQuotedRefs } from './quotes';
import { tokenize } from './tokens';

const paragraph = (order: number, text: string) => ({
  id: `p${order}`,
  order,
  text,
  words: [],
});

const bible = (
  paragraphId: string,
  startWord: number,
  endWord: number,
  metadata: Record<string, unknown>,
): ResolvedAnnotation => ({
  paragraphId,
  kind: 'BIBLE',
  startWord,
  endWord,
  rawSpan: null,
  metadata,
});

describe('findQuotedRefs', () => {
  test('matches an uncited quotation across translations', () => {
    const tokens = tokenize(
      'Paul reminds us that all have sinned and fall short of the glory of God, every one.',
    );
    expect(findQuotedRefs([tokens])).toEqual([
      [{ start: 4, end: 15, ref: { book: 'Rom', chapter: 3, verse: 23 } }],
    ]);
  });

  test('ends the span at the quotation, not a stray later word', () => {
    // Romans 3:24 goes on "…through the redemption that is in Christ Jesus".
    const tokens = tokenize(
      'Being justified freely by his grace. In verse 31 Paul asks',
    );
    const [found] = findQuotedRefs([tokens]);
    expect(found?.map((f) => [f.end, f.ref])).toEqual([
      [6, { book: 'Rom', chapter: 3, verse: 24 }],
    ]);
  });

  test('joins consecutive verses into a range', () => {
    const tokens = tokenize(
      'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life. For God sent not his Son into the world to condemn the world; but that the world through him might be saved.',
    );
    expect(findQuotedRefs([tokens])[0]?.map((f) => f.ref)).toEqual([
      { book: 'John', chapter: 3, verse: 16, endVerse: 17 },
    ]);
  });

  test('ignores stock phrases and common-word runs', () => {
    for (const text of [
      'we pray in the name of the Lord our God',
      'but I want you to know that it is good',
      'and again and again and again',
    ]) {
      expect(findQuotedRefs([tokenize(text)])).toEqual([[]]);
    }
  });

  test('prefers a cited chapter among equally good matches', () => {
    // Psalms 14 and 53 open with the same verse.
    const tokens = tokenize(
      'The fool hath said in his heart, There is no God. They are corrupt',
    );
    expect(findQuotedRefs([tokens])[0]?.map((f) => f.ref)).toEqual([
      { book: 'Ps', chapter: 14, verse: 1 },
    ]);
    expect(
      findQuotedRefs([tokens], new Set(['Ps.53']))[0]?.map((f) => f.ref),
    ).toEqual([{ book: 'Ps', chapter: 53, verse: 1 }]);
  });
});

// Positions and references only.
const merge = (...args: Parameters<typeof mergeCandidates>) =>
  mergeCandidates(...args).map(({ start, end, ref }) => ({ start, end, ref }));

describe('mergeCandidates', () => {
  test('folds compatible references into the most specific one', () => {
    expect(
      merge([
        {
          start: 0,
          end: 4,
          ref: { book: 'Rom', chapter: 8 },
          layer: 'explicit',
        },
        {
          start: 0,
          end: 9,
          ref: { book: 'Rom', chapter: 8, verse: 28 },
          layer: 'llm',
        },
      ]),
    ).toEqual([
      { start: 0, end: 9, ref: { book: 'Rom', chapter: 8, verse: 28 } },
    ]);
  });

  test('keeps the higher-priority layer on a conflict', () => {
    expect(
      merge([
        {
          start: 0,
          end: 3,
          ref: { book: 'Rom', chapter: 1, endChapter: 2 },
          layer: 'explicit',
        },
        {
          start: 0,
          end: 8,
          ref: { book: 'Rom', chapter: 12, verse: 1 },
          layer: 'llm',
        },
        {
          start: 4,
          end: 8,
          ref: { book: 'Rom', chapter: 12, verse: 1 },
          layer: 'quote',
        },
      ]),
    ).toEqual([
      { start: 0, end: 3, ref: { book: 'Rom', chapter: 1, endChapter: 2 } },
      { start: 4, end: 8, ref: { book: 'Rom', chapter: 12, verse: 1 } },
    ]);
  });

  test('a lower layer does not narrow a verse range', () => {
    expect(
      merge([
        {
          start: 0,
          end: 5,
          ref: { book: 'Rom', chapter: 8, verse: 28, endVerse: 30 },
          layer: 'explicit',
        },
        {
          start: 0,
          end: 2,
          ref: { book: 'Rom', chapter: 8, verse: 28 },
          layer: 'llm',
        },
      ]),
    ).toEqual([
      {
        start: 0,
        end: 5,
        ref: { book: 'Rom', chapter: 8, verse: 28, endVerse: 30 },
      },
    ]);
  });

  test('a quotation keeps its range when it absorbs a verse mention inside it', () => {
    expect(
      merge([
        {
          start: 31,
          end: 33,
          ref: { book: 'Rom', chapter: 8, verse: 29 },
          layer: 'implied',
        },
        {
          start: 5,
          end: 51,
          ref: { book: 'Rom', chapter: 8, verse: 28, endVerse: 29 },
          layer: 'quote',
        },
      ]),
    ).toEqual([
      {
        start: 5,
        end: 51,
        ref: { book: 'Rom', chapter: 8, verse: 28, endVerse: 29 },
      },
    ]);
  });

  test('a candidate bridging two references does not fuse them', () => {
    const merged = merge([
      {
        start: 1,
        end: 3,
        ref: { book: 'Rom', chapter: 8, verse: 28 },
        layer: 'explicit',
      },
      {
        start: 4,
        end: 6,
        ref: { book: 'Rom', chapter: 8, verse: 31 },
        layer: 'explicit',
      },
      { start: 1, end: 6, ref: { book: 'Rom', chapter: 8 }, layer: 'llm' },
    ]);
    expect(merged.map((m) => m.ref)).toEqual([
      { book: 'Rom', chapter: 8, verse: 28 },
      { book: 'Rom', chapter: 8, verse: 31 },
    ]);
    // Merging the output again changes nothing (the backfill relies on it).
    expect(
      merge(merged.map((m) => ({ ...m, layer: 'llm' as const }))).map(
        (m) => m.ref,
      ),
    ).toEqual(merged.map((m) => m.ref));
  });

  test('joins a citation and its adjacent reading', () => {
    expect(
      merge([
        {
          start: 0,
          end: 3,
          ref: { book: 'John', chapter: 3, verse: 16 },
          layer: 'explicit',
        },
        {
          start: 4,
          end: 12,
          ref: { book: 'John', chapter: 3, verse: 16 },
          layer: 'quote',
        },
      ]),
    ).toEqual([
      { start: 0, end: 12, ref: { book: 'John', chapter: 3, verse: 16 } },
    ]);
  });
});

describe('augmentBibleAnnotations', () => {
  const paragraphs = [
    paragraph(0, 'Jude, verse three. That is what is meant by sufficiency.'),
    paragraph(1, 'Turn with me to 1 Peter 2:18-25. Now in verse 21 we read'),
  ];

  test('adds the deterministic layers and keeps other kinds', () => {
    const outline: ResolvedAnnotation = {
      paragraphId: 'p0',
      kind: 'OUTLINE',
      startWord: null,
      endWord: null,
      rawSpan: null,
      metadata: { level: 1, title: 'Sufficiency' },
    };
    const { annotations, counts } = augmentBibleAnnotations(
      paragraphs,
      { title: 'Honoring the Dishonorable - 1 Peter 2:18-25' },
      [outline],
    );
    expect(annotations).toEqual([
      outline,
      bibleWithSpan('p0', 0, 3, 'Jude, verse three.', {
        book: 'Jude',
        chapter: 1,
        verse: 3,
        source: 'detected',
      }),
      bibleWithSpan('p1', 4, 7, '1 Peter 2:18-25.', {
        book: '1Pet',
        chapter: 2,
        verse: 18,
        endVerse: 25,
        source: 'detected',
      }),
      bibleWithSpan('p1', 9, 11, 'verse 21', {
        book: '1Pet',
        chapter: 2,
        verse: 21,
        source: 'detected',
      }),
    ]);
    expect(counts).toMatchObject({ explicit: 2, implied: 1, llm: 0, total: 3 });
  });

  test('pins the LLM’s chapterless Jude and drops impossible references', () => {
    const { annotations, counts, invalid } = augmentBibleAnnotations(
      [
        paragraph(
          0,
          'contend for the faith delivered once for all to the saints today',
        ),
      ],
      {},
      [
        bible('p0', 0, 11, { book: 'Jude', verse: 3 }),
        bible('p0', 11, 12, { book: 'John', chapter: 30 }),
      ],
    );
    expect(annotations.map((a) => a.metadata)).toEqual([
      { book: 'Jude', chapter: 1, verse: 3 },
    ]);
    expect(counts.invalid).toBe(1);
    expect(invalid.map((a) => a.metadata)).toEqual([
      { book: 'John', chapter: 30 },
    ]);
  });

  test('re-derives its own earlier output instead of inheriting it', () => {
    const { annotations } = augmentBibleAnnotations(
      [paragraph(0, 'and so we go on today')],
      {},
      // A false positive an earlier run wrote; today's rules don't find it.
      [bible('p0', 0, 3, { book: 'Rom', chapter: 8, source: 'detected' })],
    );
    expect(annotations).toEqual([]);
  });

  test('validates spanless BIBLE rows too', () => {
    const spanless = (
      metadata: Record<string, unknown>,
    ): ResolvedAnnotation => ({
      ...bible('p0', 0, 1, metadata),
      startWord: null,
      endWord: null,
    });
    const { annotations, invalid } = augmentBibleAnnotations(
      [paragraph(0, 'nothing to see')],
      {},
      [
        spanless({ book: 'Jude', verse: 3 }),
        spanless({ book: 'Rom', chapter: 99 }),
      ],
    );
    expect(annotations.map((a) => a.metadata)).toEqual([
      { book: 'Jude', chapter: 1, verse: 3 },
    ]);
    expect(invalid.map((a) => a.metadata)).toEqual([
      { book: 'Rom', chapter: 99 },
    ]);
  });
});

function bibleWithSpan(
  paragraphId: string,
  startWord: number,
  endWord: number,
  rawSpan: string,
  metadata: Record<string, unknown>,
): ResolvedAnnotation {
  return { ...bible(paragraphId, startWord, endWord, metadata), rawSpan };
}
