import { describe, expect, test } from 'vitest';
import type {
  TranscriptAnnotation,
  TranscriptParagraph,
} from '@/components/transcript-paragraphs';
import { buildScriptureIndex } from './scripture-index';

type BibleMeta = {
  book: string;
  chapter?: number;
  verse?: number;
  endChapter?: number;
  endVerse?: number;
};

// Builds a paragraph containing one BIBLE annotation per supplied ref.
// Each annotation gets a distinct word span so excerpt rendering stays
// deterministic (we don't assert on excerpts in these tests, but it keeps
// the helper realistic).
function paragraph(
  start: number,
  refs: ReadonlyArray<BibleMeta>,
): TranscriptParagraph {
  const words = Array.from({ length: refs.length * 2 + 4 }, (_, i) => ({
    word: `w${i}`,
    start: start + i * 0.1,
    end: start + i * 0.1 + 0.1,
  }));
  const annotations: Array<TranscriptAnnotation> = refs.map((ref, i) => ({
    kind: 'BIBLE' as const,
    startWord: i * 2,
    endWord: i * 2 + 1,
    metadata: ref as unknown as TranscriptAnnotation['metadata'],
  }));
  return {
    order: start,
    start,
    end: start + words.length * 0.1,
    speaker: null,
    text: words.map((w) => w.word).join(' '),
    words,
    annotations,
  };
}

describe('buildScriptureIndex', () => {
  test('returns [] for null/empty input', () => {
    expect(buildScriptureIndex(null)).toEqual([]);
    expect(buildScriptureIndex(undefined)).toEqual([]);
    expect(buildScriptureIndex([])).toEqual([]);
  });

  test('passes through a single citation as a one-entry group', () => {
    const groups = buildScriptureIndex([
      paragraph(10, [{ book: 'Prov', chapter: 16, verse: 5 }]),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      ref: 'Proverbs 16:5',
      entryCount: 1,
      occurrences: [{ seconds: 10, ref: '16:5' }],
    });
  });

  test('dedupes repeated citations of the same ref at the same paragraph', () => {
    const groups = buildScriptureIndex([
      paragraph(10, [
        { book: 'Prov', chapter: 16, verse: 5 },
        { book: 'Prov', chapter: 16, verse: 5 },
      ]),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].entryCount).toBe(1);
    expect(groups[0].occurrences).toHaveLength(1);
  });

  test('collects repeat citations of the same ref across paragraphs', () => {
    const groups = buildScriptureIndex([
      paragraph(10, [{ book: 'Prov', chapter: 16, verse: 5 }]),
      paragraph(99, [{ book: 'Prov', chapter: 16, verse: 5 }]),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      ref: 'Proverbs 16:5',
      entryCount: 1,
      occurrences: [{ seconds: 10 }, { seconds: 99 }],
    });
  });

  describe('consecutive grouping', () => {
    test('explicit range absorbs subsumed singletons', () => {
      const groups = buildScriptureIndex([
        paragraph(11, [{ book: 'Prov', chapter: 3, verse: 5, endVerse: 7 }]),
        paragraph(23, [
          { book: 'Prov', chapter: 3, verse: 5 },
          { book: 'Prov', chapter: 3, verse: 6 },
          { book: 'Prov', chapter: 3, verse: 7 },
        ]),
      ]);
      expect(groups).toHaveLength(1);
      expect(groups[0].ref).toBe('Proverbs 3:5-7');
      expect(groups[0].entryCount).toBe(4);
      expect(groups[0].occurrences.map((o) => o.ref)).toEqual([
        '3:5-7',
        '3:5',
        '3:6',
        '3:7',
      ]);
      expect(groups[0].occurrences.map((o) => o.seconds)).toEqual([
        11, 23, 23, 23,
      ]);
    });

    test('two overlapping ranges merge', () => {
      const groups = buildScriptureIndex([
        paragraph(11, [{ book: 'Prov', chapter: 14, verse: 26, endVerse: 27 }]),
        paragraph(35, [{ book: 'Prov', chapter: 14, verse: 26 }]),
      ]);
      expect(groups).toHaveLength(1);
      expect(groups[0].ref).toBe('Proverbs 14:26-27');
      expect(groups[0].entryCount).toBe(2);
    });

    test('synthesizes a range from adjacent singletons', () => {
      const groups = buildScriptureIndex([
        paragraph(10, [{ book: 'Prov', chapter: 3, verse: 5 }]),
        paragraph(20, [{ book: 'Prov', chapter: 3, verse: 6 }]),
        paragraph(30, [{ book: 'Prov', chapter: 3, verse: 7 }]),
      ]);
      expect(groups).toHaveLength(1);
      expect(groups[0].ref).toBe('Proverbs 3:5-7');
      expect(groups[0].entryCount).toBe(3);
    });

    test('extends a range with a verse-adjacent singleton', () => {
      const groups = buildScriptureIndex([
        paragraph(10, [{ book: 'Prov', chapter: 3, verse: 5, endVerse: 7 }]),
        paragraph(20, [{ book: 'Prov', chapter: 3, verse: 8 }]),
      ]);
      expect(groups).toHaveLength(1);
      expect(groups[0].ref).toBe('Proverbs 3:5-8');
      expect(groups[0].entryCount).toBe(2);
    });

    test('sorts occurrences within a group by seconds', () => {
      const groups = buildScriptureIndex([
        paragraph(30, [{ book: 'Prov', chapter: 3, verse: 7 }]),
        paragraph(10, [{ book: 'Prov', chapter: 3, verse: 5 }]),
        paragraph(20, [{ book: 'Prov', chapter: 3, verse: 6 }]),
      ]);
      expect(groups[0].occurrences.map((o) => o.seconds)).toEqual([10, 20, 30]);
    });
  });

  describe('negative cases (no grouping)', () => {
    test('gap in verses prevents grouping', () => {
      const groups = buildScriptureIndex([
        paragraph(10, [{ book: 'Prov', chapter: 3, verse: 5 }]),
        paragraph(20, [{ book: 'Prov', chapter: 3, verse: 7 }]),
      ]);
      expect(groups).toHaveLength(2);
      expect(groups.map((g) => g.ref)).toEqual([
        'Proverbs 3:5',
        'Proverbs 3:7',
      ]);
    });

    test('different chapters do not group', () => {
      const groups = buildScriptureIndex([
        paragraph(10, [{ book: 'Prov', chapter: 3, verse: 5 }]),
        paragraph(20, [{ book: 'Prov', chapter: 4, verse: 1 }]),
      ]);
      expect(groups).toHaveLength(2);
      expect(groups.map((g) => g.ref)).toEqual([
        'Proverbs 3:5',
        'Proverbs 4:1',
      ]);
    });

    test('different books do not group', () => {
      const groups = buildScriptureIndex([
        paragraph(10, [{ book: 'Ps', chapter: 8, verse: 3 }]),
        paragraph(20, [{ book: 'Prov', chapter: 8, verse: 4 }]),
      ]);
      expect(groups).toHaveLength(2);
      expect(groups.map((g) => g.ref)).toEqual(['Psalm 8:3', 'Proverbs 8:4']);
    });

    test('cross-chapter range does not group with a singleton in either chapter', () => {
      const groups = buildScriptureIndex([
        paragraph(10, [
          {
            book: 'Rom',
            chapter: 1,
            verse: 32,
            endChapter: 2,
            endVerse: 5,
          },
        ]),
        paragraph(20, [{ book: 'Rom', chapter: 1, verse: 32 }]),
        paragraph(30, [{ book: 'Rom', chapter: 2, verse: 5 }]),
      ]);
      expect(groups).toHaveLength(3);
      expect(groups.map((g) => g.ref)).toEqual([
        'Romans 1:32-2:5',
        'Romans 1:32',
        'Romans 2:5',
      ]);
    });

    test('chapter-only citation does not absorb verse citations in the same chapter', () => {
      const groups = buildScriptureIndex([
        paragraph(10, [{ book: 'Prov', chapter: 3 }]),
        paragraph(20, [{ book: 'Prov', chapter: 3, verse: 5 }]),
      ]);
      expect(groups).toHaveLength(2);
      expect(groups.map((g) => g.ref)).toEqual(['Proverbs 3', 'Proverbs 3:5']);
    });
  });

  test('orders groups by canonical book then chapter then verse', () => {
    const groups = buildScriptureIndex([
      paragraph(10, [{ book: 'Rev', chapter: 22, verse: 1 }]),
      paragraph(20, [{ book: 'Gen', chapter: 1, verse: 1 }]),
      paragraph(30, [{ book: 'Ps', chapter: 23, verse: 1 }]),
      paragraph(40, [{ book: 'Ps', chapter: 8, verse: 3 }]),
    ]);
    expect(groups.map((g) => g.ref)).toEqual([
      'Genesis 1:1',
      'Psalm 8:3',
      'Psalm 23:1',
      'Revelation 22:1',
    ]);
  });

  test('drops annotations whose book is not in the canonical table', () => {
    const groups = buildScriptureIndex([
      paragraph(10, [
        { book: 'NotABook', chapter: 1, verse: 1 },
        { book: 'Prov', chapter: 3, verse: 5 },
      ]),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].ref).toBe('Proverbs 3:5');
  });
});
