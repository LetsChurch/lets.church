import invariant from 'tiny-invariant';
import { orderBy } from 'lodash-es';

type Book = {
  name: string;
  aliases: ReadonlyArray<string>;
  chapters: number;
};

export const books: ReadonlyArray<Book> = [
  { name: 'Genesis', aliases: ['Gen', 'Ge', 'Gn'], chapters: 50 },
  { name: 'Exodus', aliases: ['Exod', 'Exo', 'Ex'], chapters: 40 },
  { name: 'Leviticus', aliases: ['Lev', 'Le', 'Lv'], chapters: 27 },
  { name: 'Numbers', aliases: ['Num', 'Nu', 'Nm', 'Nb'], chapters: 36 },
  { name: 'Deuteronomy', aliases: ['Deut', 'De', 'Dt'], chapters: 34 },
  { name: 'Joshua', aliases: ['Josh', 'Jos', 'Jsh'], chapters: 24 },
  { name: 'Judges', aliases: ['Judg', 'Jdg', 'Jg', 'Jdgs'], chapters: 21 },
  { name: 'Ruth', aliases: ['Rth', 'Ru'], chapters: 4 },
  {
    name: '1 Samuel',
    aliases: [
      '1 Sam',
      '1 Sa',
      '1S',
      'I Sa',
      '1 Sm',
      '1Sa',
      '1Sam',
      '1st Sam',
      '1st Samuel',
      'First Sam',
      'First Samuel',
    ],
    chapters: 31,
  },
  {
    name: '2 Samuel',
    aliases: [
      '2 Sam',
      '2 Sm',
      '2 Sa',
      '2 S',
      'II Sam',
      'II Sa',
      '2Sam',
      '2Sa',
      '2S',
      '2nd Samuel',
      '2nd Sam',
      'Second Samuel',
      'Second Sam',
    ],
    chapters: 24,
  },
  {
    name: '1 Kings',
    aliases: [
      '1 Kgs',
      '1 Ki',
      '1K',
      'I Kgs',
      '1Kgs',
      'I Ki',
      '1Ki',
      '1Kin',
      '1st Kgs',
      '1st Kings',
      'First Kgs',
      'First Kings',
    ],
    chapters: 22,
  },
  {
    name: '2 Kings',
    aliases: [
      '2 Kings',
      '2 Kgs',
      '2 Ki',
      '2Kgs',
      '2Kin',
      '2Ki',
      '2K',
      'II Kgs',
      'II Ki',
      '2nd Kings',
      '2nd Kgs',
      'Second Kings',
      'Second Kgs',
    ],
    chapters: 25,
  },
  {
    name: '1 Chronicles',
    aliases: [
      '1 Chron',
      '1 Ch',
      'I Ch',
      '1Ch',
      '1 Chr',
      'I Chr',
      '1Chr',
      'I Chron',
      '1Chron',
      '1st Chron',
      '1st Chronicles',
      'First Chron',
      'First Chronicles',
    ],
    chapters: 29,
  },
  {
    name: '2 Chronicles',
    aliases: [
      '2 Chron',
      '2 Chr',
      '2 Ch',
      '2Chron',
      '2Chr',
      '2Ch',
      'II Chron',
      'II Chr',
      'II Ch',
      '2nd Chronicles',
      '2nd Chron',
      'Second Chronicles',
      'Second Chron',
    ],
    chapters: 36,
  },
  { name: 'Ezra', aliases: ['Ezr', 'Ez'], chapters: 10 },
  { name: 'Nehemiah', aliases: ['Neh', 'Ne'], chapters: 13 },
  { name: 'Esther', aliases: ['Esth', 'Es'], chapters: 10 },
  { name: 'Job', aliases: ['Jb'], chapters: 42 },
  {
    name: 'Psalms',
    aliases: ['Psalm', 'Pslm', 'Ps', 'Psa', 'Psm', 'Pss'],
    chapters: 150,
  },
  { name: 'Proverbs', aliases: ['Prov', 'Pro', 'Pr', 'Prv'], chapters: 31 },
  {
    name: 'Ecclsiastes',
    aliases: ['Eccles', 'Eccle', 'Ecc', 'Ec', 'Qoh'],
    chapters: 12,
  },
  {
    name: 'Song of Solomon',
    aliases: [
      'Song of Songs',
      'Song',
      'So',
      'SOS',
      'Canticle of Canticles',
      'Canticles',
      'Cant',
    ],
    chapters: 8,
  },
  { name: 'Isaiah', aliases: ['Isa', 'Is'], chapters: 66 },
  { name: 'Jeremiah', aliases: ['Jer', 'Je', 'Jr'], chapters: 52 },
  { name: 'Lamentations', aliases: ['Lam', 'La'], chapters: 5 },
  { name: 'Ezekiel', aliases: ['Ezek', 'Eze', 'Ezk'], chapters: 48 },
  { name: 'Daniel', aliases: ['Dan', 'Da', 'Dn'], chapters: 12 },
  { name: 'Hosea', aliases: ['Hos', 'Ho'], chapters: 14 },
  { name: 'Joel', aliases: ['Joe', 'Jl'], chapters: 3 },
  { name: 'Amos', aliases: ['Am'], chapters: 9 },
  { name: 'Obadiah', aliases: ['Obad', 'Ob'], chapters: 1 },
  { name: 'Jonah', aliases: ['Jnh', 'Jon'], chapters: 4 },
  { name: 'Michah', aliases: ['Mic', 'Mc'], chapters: 7 },
  { name: 'Nahum', aliases: ['Nah', 'Na'], chapters: 3 },
  { name: 'Habakkuk', aliases: ['Hab', 'Hb'], chapters: 3 },
  { name: 'Zephaniah', aliases: ['Zeph', 'Zep', 'Zp'], chapters: 3 },
  { name: 'Haggai', aliases: ['Hag', 'Hg'], chapters: 2 },
  { name: 'Zechariah', aliases: ['Zech', 'Zec', 'Zc'], chapters: 14 },
  { name: 'Malachi', aliases: ['Mal', 'Ml'], chapters: 4 },
  { name: 'Matthew', aliases: ['Matt', 'Mt'], chapters: 28 },
  { name: 'Mark', aliases: ['Mrk', 'Mar', 'Mk', 'Mr'], chapters: 16 },
  { name: 'Luke', aliases: ['Luk', 'Lk'], chapters: 24 },
  { name: 'John', aliases: ['Jon', 'Jhn', 'Jn'], chapters: 21 },
  { name: 'Acts', aliases: ['Act', 'Ac'], chapters: 28 },
  { name: 'Romans', aliases: ['Rom', 'Ro', 'Rm'], chapters: 16 },
  {
    name: '1 Corinthians',
    aliases: [
      '1 Cor',
      '1 Co',
      'I Co',
      '1Co',
      'I Cor',
      '1Cor',
      'I Corinthians',
      '1Corinthians',
      '1st Cor',
      '1st Corinthians',
      'First Cor',
      'First Corinthians',
    ],
    chapters: 16,
  },
  {
    name: '2 Corinthians',
    aliases: [
      '2 Cor',
      '2 Co',
      'II Cor',
      'II Co',
      '2Cor',
      '2Co',
      'II Corinthians',
      '2Corinthians',
      '2nd Corinthians',
      'Second Corinthians',
    ],
    chapters: 13,
  },
  { name: 'Galatians', aliases: ['Gal', 'Ga'], chapters: 6 },
  { name: 'Ephesians', aliases: ['Ephes', 'Eph'], chapters: 6 },
  { name: 'Philippians', aliases: ['Phil', 'Php', 'Pp'], chapters: 4 },
  { name: 'Colossians', aliases: ['Col', 'Co'], chapters: 4 },
  {
    name: '1 Thessalonians',
    aliases: [
      '1 Thess',
      '1 Thes',
      '1 Th',
      'I Thessalonians',
      'I Thess',
      'I Thes',
      'I Th',
      '1Thessalonians',
      '1Thess',
      '1Thes',
      '1Th',
      '1st Thessalonians',
      '1st Thess',
      'First Thessalonians',
      'First Thess',
    ],
    chapters: 5,
  },
  {
    name: '2 Thessalonians',
    aliases: [
      '2 Thess',
      '2 Thes',
      '2 Th',
      'II Thessalonians',
      'II Thess',
      'II Thes',
      'II Th',
      '2Thessalonians',
      '2Thess',
      '2Thes',
      '2Th',
      '2nd Thessalonians',
      '2nd Thess',
      'Second Thessalonians',
      'Second Thess',
    ],
    chapters: 3,
  },
  {
    name: '1 Timothy',
    aliases: [
      '1 Tim',
      '1 Ti',
      'I Timothy',
      'I Tim',
      'I Ti',
      '1Timothy',
      '1Tim',
      '1Ti',
      '1st Timothy',
      '1st Tim',
      'First Timothy',
      'First Tim',
    ],
    chapters: 6,
  },
  {
    name: '2 Timothy',
    aliases: [
      '2 Tim',
      '2 Ti',
      'II Timothy',
      'II Tim',
      'II Ti',
      '2Timothy',
      '2Tim',
      '2Ti',
      '2nd Timothy',
      '2nd Tim',
      'Second Timothy',
      'Second Tim',
    ],
    chapters: 4,
  },
  { name: 'Titus', aliases: ['Tit', 'Ti'], chapters: 3 },
  { name: 'Philemon', aliases: ['Philem', 'Phm', 'Pm'], chapters: 1 },
  { name: 'Hebrews', aliases: ['Heb'], chapters: 13 },
  { name: 'James', aliases: ['Jas', 'Jm'], chapters: 5 },
  {
    name: '1 Peter',
    aliases: [
      '1 Pet',
      '1 Pe',
      '1 Pt',
      '1 P',
      'I Pet',
      'I Pt',
      'I Pe',
      '1Peter',
      '1Pet',
      '1Pe',
      '1Pt',
      '1P',
      'I Peter',
      '1st Peter',
      'First Peter',
    ],
    chapters: 5,
  },
  {
    name: '2 Peter',
    aliases: [
      '2 Pet',
      '2 Pe',
      '2 Pt',
      '2 P',
      'II Peter',
      'II Pet',
      'II Pt',
      'II Pe',
      '2Peter',
      '2Pet',
      '2Pe',
      '2Pt',
      '2P',
      '2nd Peter',
      'Second Peter',
    ],
    chapters: 3,
  },
  {
    name: '1 John',
    aliases: [
      '1 Jhn',
      '1 Jn',
      '1 J',
      '1John',
      '1Jhn',
      '1Joh',
      '1Jn',
      '1Jo',
      '1J',
      'I John',
      'I Jhn',
      'I Joh',
      'I Jn',
      'I Jo',
      '1st John',
      'First John',
    ],
    chapters: 5,
  },
  {
    name: '2 John',
    aliases: [
      '2 Jhn',
      '2 Jn',
      '2 J',
      '2John',
      '2Jhn',
      '2Joh',
      '2Jn',
      '2Jo',
      '2J',
      'II John',
      'II Jhn',
      'II Joh',
      'II Jn',
      'II Jo',
      '2nd John',
      'Second John',
    ],
    chapters: 1,
  },
  {
    name: '3 John',
    aliases: [
      '3 Jhn',
      '3 Jn',
      '3 J',
      '3John',
      '3Jhn',
      '3Joh',
      '3Jn',
      '3Jo',
      '3J',
      'III John',
      'III Jhn',
      'III Joh',
      'III Jn',
      'III Jo',
      '3rd John',
      'Third John',
    ],
    chapters: 1,
  },
  { name: 'Jude', aliases: ['Jude', 'Jud', 'Jd'], chapters: 1 },
  {
    name: 'Revelation',
    aliases: ['Rev', 'Re', 'The Revelation'],
    chapters: 22,
  },
] as const;

export const aliasesToBook: Record<string, Book> = Object.fromEntries(
  books.flatMap((book) => [
    [book.name.toLocaleLowerCase(), book],
    ...book.aliases.map((alias) => [alias.toLocaleLowerCase(), book]),
  ]),
);

const bookNamePattern = `(?<book>${books.map((book) => book.name).join('|')})`;
const bookNamesAndAliasesPattern = `(?<book>${books
  .flatMap((book) => [book.name, ...book.aliases])
  .join('|')})`;

// The cases (for now) are split out into their own separate regexes,
// putting them all together into a giant regex has proven to be unmaintainable
const regexes = [
  // Only the book (not an alias) (maybe this should only be when the book name is preceeded by "Book of"?)
  new RegExp(bookNamePattern, 'gi'),
  // Chapter followed by optional verse or verse range (e.g., "John 3:16", "John 3.16", or "John 3:16-18")
  new RegExp(
    `${bookNamesAndAliasesPattern}\\s+${
      /(?:chapter\s+)?(?<chapter>\d+)(?:th|nd|rd)?(?:(?:[:.]|\s+verse\s+)(?<verse>\d+)(?:th|nd|rd|(?<verseSuffix>[ab]))?(?:-(?:(?<chapterEnd>\d+)(?:th|nd|rd)?[:.])?(?<verseEnd>\d+))?(?:th|nd|rd|(?<verseEndSuffix>[ab]))?)?/
        .source
    }`,
    'gi',
  ),
  // Chapter followed by a verse or verse range, spoken (e.g., "John 3, 16", "John 3, 16-18", or "John 3, 16 through 18") (commas optional)
  new RegExp(
    `${bookNamesAndAliasesPattern}\\s+${
      /(?:chapter\s+)?(?<chapter>\d+)(?:th|nd|rd)?(?:(?:,?\s*|\s+verse\s+)(?<verse>\d+)(?:th|nd|rd|(?<verseSuffix>[ab]))?,?(?:(?:-|\s+to\s+|\s+through\s+)(?:(?<chapterEnd>\d+)(?:th|nd|rd)?[:.])?(?<verseEnd>\d+))?(?:th|nd|rd|(?<verseEndSuffix>[ab]))?)?/
        .source
    }`,
    'gi',
  ),
  // Chapter range (e.g., John 3-4, etc)
  new RegExp(
    `${bookNamesAndAliasesPattern}\\s+${
      /(?<chapter>\d+)\s*(?:through|to|-)\s*(?<chapterEnd>\d+)/.source
    }`,
    'gi',
  ),
];

export function* getBibleReferences(text: string) {
  let lastIndex = 0;
  let lastMatch: RegExpExecArray | null = null;

  while (lastIndex <= text.length) {
    const res = regexes.map((re) => {
      re.lastIndex = lastIndex;
      return [re, re.exec(text)] as const;
    });

    // Do we have any matches
    if (res.every(([, match]) => match === null)) {
      // No matches, we're doe
      break;
    }

    const sortedRes = orderBy(res, ['1.index', '0.lastIndex'], ['asc', 'desc']);
    const first = sortedRes[0];
    invariant(first);
    lastIndex = first[0].lastIndex;
    lastMatch = first[1];
    invariant(lastMatch);

    // Process the match
    const { groups } = lastMatch;

    if (!groups) {
      continue;
    }

    const { book, verseSuffix, verseEndSuffix } = groups;
    let { chapter, verse, verseEnd, chapterEnd } = groups;

    if (!book) {
      continue;
    }

    const bookInfo = aliasesToBook[book.toLocaleLowerCase()];

    if (!bookInfo) {
      continue;
    }

    if (chapter && !verse && parseInt(chapter) > bookInfo.chapters) {
      // If there are more chapters than the book has, attempt to correct transcription error
      const matchedChapter = chapter;
      let i = 1;

      while (parseInt(matchedChapter.slice(0, i)) <= bookInfo.chapters) {
        i++;
      }

      if (bookInfo.chapters === 1) {
        verse = matchedChapter.slice(0, i);
        verseEnd = matchedChapter.slice(i);
        chapter = undefined;
        chapterEnd = undefined;
      } else {
        chapter = matchedChapter.slice(0, i - 1);
        verse = matchedChapter.slice(i - 1);
        verseEnd = chapterEnd;
        chapterEnd = undefined;
      }
    } else if (bookInfo.chapters === 1) {
      // If this is a single-chapter book, shift chapters to verses
      verse = chapter;
      verseEnd = chapterEnd;
      chapter = undefined;
      chapterEnd = undefined;
    }

    yield {
      match: lastMatch[0].trim(),
      index: lastMatch.index,
      book: bookInfo.name,
      chapter: chapter ? parseInt(chapter) : null,
      chapterEnd: chapterEnd
        ? parseInt(chapterEnd)
        : chapter
        ? parseInt(chapter)
        : null,
      verse: verse ? parseInt(verse) : null,
      verseSuffix: verseSuffix ? verseSuffix : null,
      verseEnd: verseEnd ? parseInt(verseEnd) : verse ? parseInt(verse) : null,
      verseEndSuffix: verseEndSuffix ? verseEndSuffix : null,
    };
  }
}
