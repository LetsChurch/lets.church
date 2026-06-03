import { z } from 'zod';

// OSIS book id → BibleHub URL slug + human display name. The 66-book
// Protestant canon; matches the OSIS abbreviations the LLM emits in
// `annotate-transcript.ts`. Slugs follow BibleHub's URL convention
// (lowercase, underscores for separated words, ordinal-prefixed books
// keep the digit) — `https://biblehub.com/<slug>/<chapter>-<verse>.htm`
// shows a parallel view across translations rather than locking to one.
const BOOKS: Record<string, { slug: string; name: string }> = {
  Gen: { slug: 'genesis', name: 'Genesis' },
  Exod: { slug: 'exodus', name: 'Exodus' },
  Lev: { slug: 'leviticus', name: 'Leviticus' },
  Num: { slug: 'numbers', name: 'Numbers' },
  Deut: { slug: 'deuteronomy', name: 'Deuteronomy' },
  Josh: { slug: 'joshua', name: 'Joshua' },
  Judg: { slug: 'judges', name: 'Judges' },
  Ruth: { slug: 'ruth', name: 'Ruth' },
  '1Sam': { slug: '1_samuel', name: '1 Samuel' },
  '2Sam': { slug: '2_samuel', name: '2 Samuel' },
  '1Kgs': { slug: '1_kings', name: '1 Kings' },
  '2Kgs': { slug: '2_kings', name: '2 Kings' },
  '1Chr': { slug: '1_chronicles', name: '1 Chronicles' },
  '2Chr': { slug: '2_chronicles', name: '2 Chronicles' },
  Ezra: { slug: 'ezra', name: 'Ezra' },
  Neh: { slug: 'nehemiah', name: 'Nehemiah' },
  Esth: { slug: 'esther', name: 'Esther' },
  Job: { slug: 'job', name: 'Job' },
  Ps: { slug: 'psalms', name: 'Psalm' },
  Prov: { slug: 'proverbs', name: 'Proverbs' },
  Eccl: { slug: 'ecclesiastes', name: 'Ecclesiastes' },
  Song: { slug: 'songs', name: 'Song of Solomon' },
  Isa: { slug: 'isaiah', name: 'Isaiah' },
  Jer: { slug: 'jeremiah', name: 'Jeremiah' },
  Lam: { slug: 'lamentations', name: 'Lamentations' },
  Ezek: { slug: 'ezekiel', name: 'Ezekiel' },
  Dan: { slug: 'daniel', name: 'Daniel' },
  Hos: { slug: 'hosea', name: 'Hosea' },
  Joel: { slug: 'joel', name: 'Joel' },
  Amos: { slug: 'amos', name: 'Amos' },
  Obad: { slug: 'obadiah', name: 'Obadiah' },
  Jonah: { slug: 'jonah', name: 'Jonah' },
  Mic: { slug: 'micah', name: 'Micah' },
  Nah: { slug: 'nahum', name: 'Nahum' },
  Hab: { slug: 'habakkuk', name: 'Habakkuk' },
  Zeph: { slug: 'zephaniah', name: 'Zephaniah' },
  Hag: { slug: 'haggai', name: 'Haggai' },
  Zech: { slug: 'zechariah', name: 'Zechariah' },
  Mal: { slug: 'malachi', name: 'Malachi' },
  Matt: { slug: 'matthew', name: 'Matthew' },
  Mark: { slug: 'mark', name: 'Mark' },
  Luke: { slug: 'luke', name: 'Luke' },
  John: { slug: 'john', name: 'John' },
  Acts: { slug: 'acts', name: 'Acts' },
  Rom: { slug: 'romans', name: 'Romans' },
  '1Cor': { slug: '1_corinthians', name: '1 Corinthians' },
  '2Cor': { slug: '2_corinthians', name: '2 Corinthians' },
  Gal: { slug: 'galatians', name: 'Galatians' },
  Eph: { slug: 'ephesians', name: 'Ephesians' },
  Phil: { slug: 'philippians', name: 'Philippians' },
  Col: { slug: 'colossians', name: 'Colossians' },
  '1Thess': { slug: '1_thessalonians', name: '1 Thessalonians' },
  '2Thess': { slug: '2_thessalonians', name: '2 Thessalonians' },
  '1Tim': { slug: '1_timothy', name: '1 Timothy' },
  '2Tim': { slug: '2_timothy', name: '2 Timothy' },
  Titus: { slug: 'titus', name: 'Titus' },
  Phlm: { slug: 'philemon', name: 'Philemon' },
  Heb: { slug: 'hebrews', name: 'Hebrews' },
  Jas: { slug: 'james', name: 'James' },
  '1Pet': { slug: '1_peter', name: '1 Peter' },
  '2Pet': { slug: '2_peter', name: '2 Peter' },
  '1John': { slug: '1_john', name: '1 John' },
  '2John': { slug: '2_john', name: '2 John' },
  '3John': { slug: '3_john', name: '3 John' },
  Jude: { slug: 'jude', name: 'Jude' },
  Rev: { slug: 'revelation', name: 'Revelation' },
};

// Mirrors `bibleMetadataSchema` in the temporal annotate-transcript
// activity, narrowed to what the renderer uses. Annotations land in the
// DB as `Record<string, unknown>`; we parse defensively here so a
// malformed row degrades to "no link" instead of throwing.
const bibleMetadataSchema = z
  .object({
    book: z.string().min(1),
    chapter: z.coerce.number().int().positive().optional().nullable(),
    verse: z.coerce.number().int().positive().optional().nullable(),
    endChapter: z.coerce.number().int().positive().optional().nullable(),
    endVerse: z.coerce.number().int().positive().optional().nullable(),
  })
  .passthrough();

export type BibleMetadata = z.infer<typeof bibleMetadataSchema>;

export function parseBibleMetadata(
  metadata: Record<string, unknown>,
): BibleMetadata | null {
  const result = bibleMetadataSchema.safeParse(metadata);
  return result.success ? result.data : null;
}

export function buildBibleHubUrl(meta: BibleMetadata): string | null {
  // The annotate prompt enumerates the 66 OSIS abbreviations and the
  // canonical-only rule maps apocryphal works to `#keyword`, so the
  // book should always be in the table. Returning null on a miss
  // rather than throwing keeps a single bogus row from crashing the
  // whole transcript render — the caller renders the words unannotated.
  const entry = BOOKS[meta.book];
  if (!entry) return null;
  const base = `https://biblehub.com/${entry.slug}`;
  if (meta.chapter == null) return `${base}/`;
  if (meta.verse == null) return `${base}/${meta.chapter}.htm`;
  // BibleHub has no native range URL; link to the start verse.
  return `${base}/${meta.chapter}-${meta.verse}.htm`;
}

// Canonical (Genesis → Revelation) sort index for an OSIS book id.
// `BOOKS` is declared in canonical order, so its key order is the
// ordering we want; books absent from the table sort last (stable
// fallback for the same bogus-row case `buildBibleHubUrl` guards).
const BOOK_ORDER: Record<string, number> = Object.fromEntries(
  Object.keys(BOOKS).map((book, i) => [book, i]),
);

export function bibleBookOrder(book: string): number {
  return BOOK_ORDER[book] ?? Number.MAX_SAFE_INTEGER;
}

export function formatBibleRef(meta: BibleMetadata): string {
  const name = BOOKS[meta.book]?.name ?? meta.book;
  if (meta.chapter == null) return name;
  if (meta.verse == null) return `${name} ${meta.chapter}`;
  if (meta.endChapter != null && meta.endVerse != null) {
    return `${name} ${meta.chapter}:${meta.verse}-${meta.endChapter}:${meta.endVerse}`;
  }
  if (meta.endVerse != null) {
    return `${name} ${meta.chapter}:${meta.verse}-${meta.endVerse}`;
  }
  return `${name} ${meta.chapter}:${meta.verse}`;
}
