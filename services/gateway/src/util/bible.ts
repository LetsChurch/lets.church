type Book = {
  name: string;
  aliases: ReadonlyArray<string>;
  singleChapter?: boolean;
};

export const books: ReadonlyArray<Book> = [
  { name: 'Genesis', aliases: ['Gen', 'Ge', 'Gn'] },
  { name: 'Exodus', aliases: ['Exod', 'Exo', 'Ex'] },
  { name: 'Leviticus', aliases: ['Lev', 'Le', 'Lv'] },
  { name: 'Numbers', aliases: ['Num', 'Nu', 'Nm', 'Nb'] },
  { name: 'Deuteronomy', aliases: ['Deut', 'De', 'Dt'] },
  { name: 'Joshua', aliases: ['Josh', 'Jos', 'Jsh'] },
  { name: 'Judges', aliases: ['Judg', 'Jdg', 'Jg', 'Jdgs'] },
  { name: 'Ruth', aliases: ['Rth', 'Ru'] },
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
  },
  { name: 'Ezra', aliases: ['Ezr', 'Ez'] },
  { name: 'Nehemiah', aliases: ['Neh', 'Ne'] },
  { name: 'Esther', aliases: ['Esth', 'Es'] },
  { name: 'Job', aliases: ['Jb'] },
  { name: 'Psalms', aliases: ['Psalm', 'Pslm', 'Ps', 'Psa', 'Psm', 'Pss'] },
  { name: 'Proverbs', aliases: ['Prov', 'Pro', 'Pr', 'Prv'] },
  { name: 'Ecclsiastes', aliases: ['Eccles', 'Eccle', 'Ecc', 'Ec', 'Qoh'] },
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
  },
  { name: 'Isaiah', aliases: ['Isa', 'Is'] },
  { name: 'Jeremiah', aliases: ['Jer', 'Je', 'Jr'] },
  { name: 'Lamentations', aliases: ['Lam', 'La'] },
  { name: 'Ezekiel', aliases: ['Ezek', 'Eze', 'Ezk'] },
  { name: 'Daniel', aliases: ['Dan', 'Da', 'Dn'] },
  { name: 'Hosea', aliases: ['Hos', 'Ho'] },
  { name: 'Joel', aliases: ['Joe', 'Jl'] },
  { name: 'Amos', aliases: ['Am'] },
  { name: 'Obadiah', aliases: ['Obad', 'Ob'], singleChapter: true },
  { name: 'Jonah', aliases: ['Jnh', 'Jon'] },
  { name: 'Michah', aliases: ['Mic', 'Mc'] },
  { name: 'Nahum', aliases: ['Nah', 'Na'] },
  { name: 'Habakkuk', aliases: ['Hab', 'Hb'] },
  { name: 'Zephaniah', aliases: ['Zeph', 'Zep', 'Zp'] },
  { name: 'Haggai', aliases: ['Hag', 'Hg'] },
  { name: 'Zechariah', aliases: ['Zech', 'Zec', 'Zc'] },
  { name: 'Malachi', aliases: ['Mal', 'Ml'] },
  { name: 'Matthew', aliases: ['Matt', 'Mt'] },
  { name: 'Mark', aliases: ['Mrk', 'Mar', 'Mk', 'Mr'] },
  { name: 'Luke', aliases: ['Luk', 'Lk'] },
  { name: 'John', aliases: ['Jon', 'Jhn', 'Jn'] },
  { name: 'Acts', aliases: ['Act', 'Ac'] },
  { name: 'Romans', aliases: ['Rom', 'Ro', 'Rm'] },
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
  },
  { name: 'Galatians', aliases: ['Gal', 'Ga'] },
  { name: 'Ephesians', aliases: ['Ephes', 'Eph'] },
  { name: 'Philippians', aliases: ['Phil', 'Php', 'Pp'] },
  { name: 'Colossians', aliases: ['Col', 'Co'] },
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
  },
  { name: 'Titus', aliases: ['Tit', 'Ti'] },
  { name: 'Philemon', aliases: ['Philem', 'Phm', 'Pm'], singleChapter: true },
  { name: 'Hebrews', aliases: ['Heb'] },
  { name: 'James', aliases: ['Jas', 'Jm'] },
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
    singleChapter: true,
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
    singleChapter: true,
  },
  { name: 'Jude', aliases: ['Jude', 'Jud', 'Jd'], singleChapter: true },
  { name: 'Revelation', aliases: ['Rev', 'Re', 'The Revelation'] },
] as const;

export const aliasesToBookName = Object.fromEntries(
  books.flatMap((book) => [
    [book.name.toLocaleLowerCase(), book.name],
    ...book.aliases.map((alias) => [alias.toLocaleLowerCase(), book.name]),
  ]),
);

export function getBibleRegex() {
  const booksRegex = books
    .flatMap((book) => [book.name, ...book.aliases])
    .join('|');

  const regex = new RegExp(
    `(?:\\b)(?<book>${booksRegex})\\s*(?:chapter)?\\s*(?:(?<chapter>\\d+)(?:\\s*:?(?:verse)?\\s*(?<verse>\\d+))?)?(?:\\b)`,
    'gi',
  );

  return regex;
}

const bookNamesSet = new Set(books.map((book) => book.name));

export function* getBibleReferences(text: string) {
  const regex = getBibleRegex();

  let match: RegExpExecArray | null;

  while ((match = regex.exec(text))) {
    const { groups } = match;

    if (!groups) {
      continue;
    }

    const { book, chapter, verse } = groups;

    if (!book) {
      continue;
    }

    // If there is no chapter and we matched an alias, don't yield any results
    // (aliases must be followed by at least a chapter)
    if (!chapter && !bookNamesSet.has(book)) {
      continue;
    }

    yield {
      match: match[0].trim(),
      index: match.index,
      book: book ? aliasesToBookName[book.toLocaleLowerCase()] : undefined,
      chapter: chapter ? parseInt(chapter) : undefined,
      verse: verse ? parseInt(verse) : undefined,
    };
  }
}
