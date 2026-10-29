// The 66-book Protestant canon as OSIS ids, plus the spoken book names the
// deterministic transcript reference finder (./explicit.ts) recognizes.

export const OSIS_BOOKS = [
  'Gen',
  'Exod',
  'Lev',
  'Num',
  'Deut',
  'Josh',
  'Judg',
  'Ruth',
  '1Sam',
  '2Sam',
  '1Kgs',
  '2Kgs',
  '1Chr',
  '2Chr',
  'Ezra',
  'Neh',
  'Esth',
  'Job',
  'Ps',
  'Prov',
  'Eccl',
  'Song',
  'Isa',
  'Jer',
  'Lam',
  'Ezek',
  'Dan',
  'Hos',
  'Joel',
  'Amos',
  'Obad',
  'Jonah',
  'Mic',
  'Nah',
  'Hab',
  'Zeph',
  'Hag',
  'Zech',
  'Mal',
  'Matt',
  'Mark',
  'Luke',
  'John',
  'Acts',
  'Rom',
  '1Cor',
  '2Cor',
  'Gal',
  'Eph',
  'Phil',
  'Col',
  '1Thess',
  '2Thess',
  '1Tim',
  '2Tim',
  'Titus',
  'Phlm',
  'Heb',
  'Jas',
  '1Pet',
  '2Pet',
  '1John',
  '2John',
  '3John',
  'Jude',
  'Rev',
] as const;
export type OsisBook = (typeof OSIS_BOOKS)[number];

const OSIS_BOOK_SET: ReadonlySet<string> = new Set(OSIS_BOOKS);
export function isOsisBook(book: string): book is OsisBook {
  return OSIS_BOOK_SET.has(book);
}

// Cited by verse alone ("Jude 3"), always chapter 1.
export const SINGLE_CHAPTER_BOOKS: ReadonlySet<string> = new Set([
  'Obad',
  'Phlm',
  '2John',
  '3John',
  'Jude',
]);

export type BookName = {
  // Lowercase tokens of the spoken name, e.g. ['song', 'of', 'solomon'].
  tokens: string[];
  // OSIS id, or the numbered family's ids by ordinal (1-3) for books that
  // need one ("First Corinthians"). John is both: bare "John" is the gospel,
  // "First John" the epistle.
  osis: OsisBook | null;
  numbered: readonly OsisBook[] | null;
  // Also an everyday given name, so "John one of the twelve" isn't John 1.
  person: boolean;
};

function name(
  spoken: string,
  osis: OsisBook | null,
  options: { person?: boolean; numbered?: readonly OsisBook[] } = {},
): BookName {
  return {
    tokens: spoken.split(' '),
    osis,
    numbered: options.numbered ?? null,
    person: options.person ?? false,
  };
}

const PERSON = { person: true };

export const BOOK_NAMES: readonly BookName[] = [
  name('genesis', 'Gen'),
  name('exodus', 'Exod'),
  name('leviticus', 'Lev'),
  name('numbers', 'Num'),
  name('deuteronomy', 'Deut'),
  name('joshua', 'Josh', PERSON),
  name('judges', 'Judg'),
  name('ruth', 'Ruth', PERSON),
  name('samuel', null, { person: true, numbered: ['1Sam', '2Sam'] }),
  name('kings', null, { numbered: ['1Kgs', '2Kgs'] }),
  name('chronicles', null, { numbered: ['1Chr', '2Chr'] }),
  name('ezra', 'Ezra', PERSON),
  name('nehemiah', 'Neh', PERSON),
  name('esther', 'Esth', PERSON),
  name('job', 'Job', PERSON),
  name('psalm', 'Ps'),
  name('psalms', 'Ps'),
  name('proverbs', 'Prov'),
  name('ecclesiastes', 'Eccl'),
  name('song of solomon', 'Song'),
  name('song of songs', 'Song'),
  name('songs of solomon', 'Song'),
  name('isaiah', 'Isa', PERSON),
  name('jeremiah', 'Jer', PERSON),
  name('lamentations', 'Lam'),
  name('ezekiel', 'Ezek', PERSON),
  name('daniel', 'Dan', PERSON),
  name('hosea', 'Hos', PERSON),
  name('joel', 'Joel', PERSON),
  name('amos', 'Amos', PERSON),
  name('obadiah', 'Obad', PERSON),
  name('jonah', 'Jonah', PERSON),
  name('micah', 'Mic', PERSON),
  name('nahum', 'Nah', PERSON),
  name('habakkuk', 'Hab', PERSON),
  name('zephaniah', 'Zeph', PERSON),
  name('haggai', 'Hag', PERSON),
  name('zechariah', 'Zech', PERSON),
  name('malachi', 'Mal', PERSON),
  name('matthew', 'Matt', PERSON),
  name('mark', 'Mark', PERSON),
  name('luke', 'Luke', PERSON),
  name('john', 'John', { person: true, numbered: ['1John', '2John', '3John'] }),
  name('acts', 'Acts'),
  name('romans', 'Rom'),
  name('corinthians', null, { numbered: ['1Cor', '2Cor'] }),
  name('galatians', 'Gal'),
  name('ephesians', 'Eph'),
  name('philippians', 'Phil'),
  name('phillipians', 'Phil'),
  name('colossians', 'Col'),
  name('thessalonians', null, { numbered: ['1Thess', '2Thess'] }),
  name('timothy', null, { person: true, numbered: ['1Tim', '2Tim'] }),
  name('titus', 'Titus', PERSON),
  name('philemon', 'Phlm', PERSON),
  name('hebrews', 'Heb'),
  name('james', 'Jas', PERSON),
  name('peter', null, { person: true, numbered: ['1Pet', '2Pet'] }),
  name('jude', 'Jude', PERSON),
  name('revelation', 'Rev'),
  name('revelations', 'Rev'),
];

// Spoken/written ordinals that prefix the numbered books.
export const ORDINALS: Readonly<Record<string, 1 | 2 | 3>> = {
  '1': 1,
  '2': 2,
  '3': 3,
  '1st': 1,
  '2nd': 2,
  '3rd': 3,
  first: 1,
  second: 2,
  third: 3,
};

/**
 * Pin a single-chapter book's reference to chapter 1. Speakers (and the LLM
 * annotator) cite these by verse alone, which arrives either chapterless
 * (`{Jude, verse 3}`) or with the verse misread as a chapter
 * (`{Jude, chapter 3}`). Everything downstream assumes a verse-level
 * reference carries its chapter, so normalize at every boundary that reads or
 * writes BIBLE metadata. Other books pass through untouched.
 */
export function normalizeSingleChapterRef<
  T extends {
    book?: unknown;
    chapter?: unknown;
    verse?: unknown;
    endChapter?: unknown;
    endVerse?: unknown;
  },
>(meta: T): T {
  if (typeof meta.book !== 'string' || !SINGLE_CHAPTER_BOOKS.has(meta.book)) {
    return meta;
  }
  const chapter = toPositiveInt(meta.chapter);
  const verse = toPositiveInt(meta.verse);
  const endChapter = toPositiveInt(meta.endChapter);
  const endVerse = toPositiveInt(meta.endVerse);
  // Whole-book mention: nothing to pin.
  if (chapter === null && verse === null) return meta;
  // A chapter other than 1 (or a chapterless verse) is really the verse.
  const start =
    chapter !== null && chapter !== 1 && verse === null ? chapter : verse;
  // Likewise a chapter range ("Jude 3-4" read as chapters 3 to 4).
  let end =
    endChapter !== null && endChapter !== 1 && endVerse === null
      ? endChapter
      : endVerse;
  // "Jude 1-4" read as chapters 1 to 4 is verses 1 to 4.
  if (start === null && chapter === 1 && end !== null) {
    return normalizeSingleChapterRef({
      ...meta,
      verse: 1,
      endVerse: end,
      endChapter: undefined,
    });
  }
  const out: Record<string, unknown> = { ...meta, chapter: 1 };
  delete out.endChapter;
  delete out.verse;
  delete out.endVerse;
  if (start !== null) out.verse = start;
  if (start !== null && end !== null && end > start) out.endVerse = end;
  return out as T;
}

export function toPositiveInt(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}
