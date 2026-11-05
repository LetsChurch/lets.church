import { describe, expect, test, vi } from 'vitest';

vi.mock('@letschurch/db', () => ({
  Annotation: {},
  Channel: {},
  db: {},
  StudyGuide: {},
  TranscriptParagraph: {},
  UploadRecord: {},
}));
vi.mock('../../util/llm', () => ({
  createChatCompletionTracked: vi.fn(),
  SUMMARY_FALLBACK_MODEL: null,
  SUMMARY_MODEL: 'openai/test',
}));
vi.mock('./summarize-upload', () => ({
  loadOutlineSectionsForSummary: vi.fn(),
}));

import {
  buildContent,
  collectPassages,
  parseResponse,
  quoteMatches,
} from './generate-study-guide';

const row = (order: number, metadata: Record<string, unknown>) => ({
  order,
  metadata,
});

describe('collectPassages', () => {
  test('merges verses of a chapter into ranges in order of first mention', () => {
    const passages = collectPassages([
      row(2, { book: 'Job', chapter: 9, verse: 2 }),
      row(50, { book: '2Tim', chapter: 3, verse: 14 }),
      row(51, { book: '2Tim', chapter: 3, verse: 16, endVerse: 17 }),
      row(52, { book: '2Tim', chapter: 3, verse: 15 }),
      row(60, { book: '2Tim', chapter: 3 }),
      row(119, { book: 'Jude', verse: 3 }),
      row(150, { book: 'Rom', chapter: 1 }),
      row(151, { book: 'Rom' }),
    ]);
    expect(passages.map((p) => p.ref)).toEqual([
      { book: 'Job', chapter: 9, verse: 2 },
      { book: '2Tim', chapter: 3, verse: 14, endVerse: 17 },
      { book: 'Jude', chapter: 1, verse: 3 },
      { book: 'Rom', chapter: 1 },
    ]);
  });

  test('keeps gaps as separate ranges and drops impossible references', () => {
    const passages = collectPassages([
      row(1, { book: 'Deut', chapter: 6, verse: 6 }),
      row(1, { book: 'Deut', chapter: 6, verse: 7 }),
      row(2, { book: 'Deut', chapter: 6, verse: 9 }),
      row(3, { book: 'Jude', chapter: 3 }),
    ]);
    expect(passages.map((p) => p.ref)).toEqual([
      { book: 'Deut', chapter: 6, verse: 6, endVerse: 7 },
      { book: 'Deut', chapter: 6, verse: 9 },
      { book: 'Jude', chapter: 1, verse: 3 },
    ]);
  });
});

describe('collectPassages ordering and duplicates', () => {
  test('dates each range by its own first mention', () => {
    const passages = collectPassages([
      row(2, { book: 'John', chapter: 3, verse: 16 }),
      row(10, { book: 'Rom', chapter: 8, verse: 28 }),
      row(40, { book: 'John', chapter: 3, verse: 1, endVerse: 8 }),
    ]);
    expect(passages.map((p) => [p.ref, p.firstParagraph])).toEqual([
      [{ book: 'John', chapter: 3, verse: 16 }, 2],
      [{ book: 'Rom', chapter: 8, verse: 28 }, 10],
      [{ book: 'John', chapter: 3, verse: 1, endVerse: 8 }, 40],
    ]);
  });

  test('lists a repeated cross-chapter range once', () => {
    const range = {
      book: 'Rom',
      chapter: 8,
      verse: 28,
      endChapter: 9,
      endVerse: 5,
    };
    expect(
      collectPassages([row(1, range), row(5, range), row(9, range)]),
    ).toEqual([{ ref: range, firstParagraph: 1 }]);
  });
});

describe('quoteMatches', () => {
  const paragraph =
    "So you're not going to exhaust the truth. Your child and you are about an inch apart in a million mile race. You're further along than them.";

  test('accepts the words as spoken, with small fixes', () => {
    expect(
      quoteMatches(
        'Your child and you are about an inch apart in a million-mile race.',
        paragraph,
      ),
    ).toBe(true);
  });

  test('rejects a paraphrase', () => {
    expect(
      quoteMatches(
        'Parents are only slightly ahead of their children in understanding God.',
        paragraph,
      ),
    ).toBe(false);
  });
});

describe('buildContent', () => {
  const paragraphs = [
    { order: 0, text: 'How can a man be righteous before God?', start: 0.8 },
    {
      order: 1,
      text: 'Who is the final word over the people of God?',
      start: 1161.5,
    },
    { order: 2, text: 'Your word is a sharp, two-edged sword.', start: 3053.2 },
  ];
  const passages = collectPassages([
    row(0, { book: 'Job', chapter: 9, verse: 2 }),
    row(2, { book: 'Rev', chapter: 1, verse: 16 }),
  ]);
  const response = {
    title: 'Sola Scriptura',
    seriesLabel: null,
    bigIdea: 'Scripture alone is the final authority.',
    opening: null,
    keyPassage: { book: '2Tim', chapter: 3, verse: 14, endVerse: 17 },
    outline: [
      { marker: 'Intro', text: "Luther's crisis.", answer: null, paragraph: 0 },
      {
        marker: 'I.',
        text: "Scripture carries God's ___ (2 Tim 3:16).",
        answer: 'authority',
        paragraph: 1,
      },
      { marker: 'II.', text: 'No blank here.', answer: 'stray', paragraph: 99 },
    ],
    questions: { observe: ['a', 'b', 'c'], interpret: [], apply: ['d'] },
    family: null,
    memoryVerse: { book: '2Tim', chapter: 3, verse: 16, endVerse: 17 },
    keyTerms: [],
    timeline: { heading: 'Road', items: [] },
    quotes: [
      { text: 'Who is the final word over the people of God?', paragraph: 1 },
      { text: 'Scripture is our only rule.', paragraph: 1 },
    ],
    prayer: 'Pray.',
    echoes: [
      { book: 'Heb', chapter: 4, verse: 12, paragraph: 2 },
      { book: 'Job', chapter: 9, verse: 2, paragraph: 0 },
      { book: 'Heb', chapter: 40, verse: 1, paragraph: 2 },
    ],
    dropPassages: ['Rev.1.16'],
  };

  const content = buildContent(response, paragraphs, passages);

  test('resolves passages to BSB text', () => {
    expect(content.keyPassage?.verses.map((v) => v.verse)).toEqual([
      14, 15, 16, 17,
    ]);
    expect(content.keyPassage?.verses[2]?.text).toMatch(
      /^All Scripture is God-breathed/,
    );
    expect(content.memoryVerse?.translation).toBe('BSB');
  });

  test('splits blanks and maps paragraphs to timestamps', () => {
    expect(content.outline[1]).toEqual({
      marker: 'I.',
      before: "Scripture carries God's ",
      answer: 'authority',
      after: ' (2 Tim 3:16).',
      startSec: 1161.5,
    });
    expect(content.outline[2]).toMatchObject({
      before: 'No blank here.',
      answer: null,
      startSec: null,
    });
  });

  test('drops flagged passages, duplicate or impossible echoes and invented quotes', () => {
    expect(content.passages).toEqual([{ book: 'Job', chapter: 9, verse: 2 }]);
    expect(content.echoes).toEqual([{ book: 'Heb', chapter: 4, verse: 12 }]);
    expect(content.quotes).toEqual([
      {
        text: 'Who is the final word over the people of God?',
        startSec: 1161.5,
      },
    ]);
  });

  test('skips verses the BSB omits instead of dropping the passage', () => {
    const omitted = buildContent(
      {
        ...response,
        keyPassage: { book: 'Matt', chapter: 18, verse: 10, endVerse: 12 },
      },
      paragraphs,
      passages,
    );
    expect(omitted.keyPassage?.verses.map((v) => v.verse)).toEqual([10, 12]);
  });

  test('drops a flagged chapter range by the id the prompt lists', () => {
    const chapterRange = collectPassages([
      row(0, { book: 'Rom', chapter: 1, endChapter: 3 }),
      row(1, { book: 'Job', chapter: 9, verse: 2 }),
    ]);
    const kept = buildContent(
      { ...response, dropPassages: ['Rom.1-3'] },
      paragraphs,
      chapterRange,
    );
    expect(kept.passages).toEqual([{ book: 'Job', chapter: 9, verse: 2 }]);
  });

  test('keeps a blank the model left unanswered, however it is drawn', () => {
    const blanks = buildContent(
      {
        ...response,
        outline: [
          {
            marker: 'I.',
            text: 'Scripture is _____ for all.',
            answer: null,
            paragraph: 1,
          },
        ],
      },
      paragraphs,
      passages,
    );
    expect(blanks.outline[0]).toMatchObject({
      before: 'Scripture is ',
      answer: '',
      after: ' for all.',
    });
  });

  test('drops an echo the sermon already cites as part of a range', () => {
    const cited = collectPassages([
      row(1, { book: '2Tim', chapter: 3, verse: 14, endVerse: 17 }),
    ]);
    const echoed = buildContent(
      {
        ...response,
        dropPassages: [],
        echoes: [
          { book: '2Tim', chapter: 3, verse: 16 },
          { book: 'Heb', chapter: 4, verse: 12 },
        ],
      },
      paragraphs,
      cited,
    );
    expect(echoed.echoes).toEqual([{ book: 'Heb', chapter: 4, verse: 12 }]);
  });

  test('cuts an over-long passage to the verses the page holds', () => {
    const long = buildContent(
      {
        ...response,
        keyPassage: { book: '2Tim', chapter: 3, verse: 10, endVerse: 17 },
        memoryVerse: { book: 'Ps', chapter: 119, verse: 105, endVerse: 112 },
      },
      paragraphs,
      passages,
    );
    expect(long.keyPassage?.ref).toEqual({
      book: '2Tim',
      chapter: 3,
      verse: 10,
      endVerse: 15,
    });
    expect(long.keyPassage?.verses).toHaveLength(6);
    expect(long.memoryVerse?.ref).toEqual({
      book: 'Ps',
      chapter: 119,
      verse: 105,
      endVerse: 107,
    });
  });

  test('caps lists and empties an empty timeline', () => {
    expect(content.questions.observe).toHaveLength(2);
    expect(content.timeline).toBeNull();
  });
});

describe('parseResponse', () => {
  test('accepts paragraph labels echoed as "P12" or "[P12]" and drops unplaceable ones', () => {
    const parsed = parseResponse(
      JSON.stringify({
        title: 'T',
        bigIdea: 'B',
        outline: [
          { marker: 'I.', text: 'x ___', answer: 'y', paragraph: 'P12' },
        ],
        questions: {},
        quotes: [
          { text: 'a', paragraph: 'P3' },
          { text: 'b', paragraph: '[P7]' },
          { text: 'c', paragraph: 'somewhere' },
        ],
        prayer: 'P',
      }),
    );
    expect(parsed.outline[0]?.paragraph).toBe(12);
    expect(parsed.quotes.map((q) => q.paragraph)).toEqual([3, 7, null]);
  });
});
