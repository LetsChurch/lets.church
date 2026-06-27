// Regenerates src/lib/canon.ts from the BSB USX seed
// (seed/bsb/bsb_usx/*.usx). Run with: pnpm exec tsx scripts/gen-canon.ts
//
// The canon registry (book codes, slugs, names, chapter counts, aliases) is
// derived from the seed translation so names/chapter counts stay authoritative.
// Aliases beyond name/abbr/code are curated below for the reference parser.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const USX_DIR = join(here, '..', 'seed', 'bsb', 'USX_1');
const OUT = join(here, '..', 'src', 'lib', 'canon.ts');

// Canonical 66-book Protestant order by USFM code.
const ORDER: string[] = [
  'GEN',
  'EXO',
  'LEV',
  'NUM',
  'DEU',
  'JOS',
  'JDG',
  'RUT',
  '1SA',
  '2SA',
  '1KI',
  '2KI',
  '1CH',
  '2CH',
  'EZR',
  'NEH',
  'EST',
  'JOB',
  'PSA',
  'PRO',
  'ECC',
  'SNG',
  'ISA',
  'JER',
  'LAM',
  'EZK',
  'DAN',
  'HOS',
  'JOL',
  'AMO',
  'OBA',
  'JON',
  'MIC',
  'NAM',
  'HAB',
  'ZEP',
  'HAG',
  'ZEC',
  'MAL',
  'MAT',
  'MRK',
  'LUK',
  'JHN',
  'ACT',
  'ROM',
  '1CO',
  '2CO',
  'GAL',
  'EPH',
  'PHP',
  'COL',
  '1TH',
  '2TH',
  '1TI',
  '2TI',
  'TIT',
  'PHM',
  'HEB',
  'JAS',
  '1PE',
  '2PE',
  '1JN',
  '2JN',
  '3JN',
  'JUD',
  'REV',
];

// Curated extra aliases (lowercase, punctuation-stripped) beyond name/abbr/code.
const ALIASES: Record<string, string[]> = {
  GEN: ['gn'],
  EXO: ['ex', 'exod'],
  LEV: ['lv', 'lev'],
  NUM: ['nm', 'nb'],
  DEU: ['dt', 'deut'],
  JOS: ['jsh', 'josh'],
  JDG: ['jdg', 'judg'],
  RUT: ['rth', 'ru'],
  '1SA': ['1sam', '1sm'],
  '2SA': ['2sam', '2sm'],
  '1KI': ['1kgs', '1kg'],
  '2KI': ['2kgs', '2kg'],
  '1CH': ['1chr', '1chron'],
  '2CH': ['2chr', '2chron'],
  EZR: ['ezr'],
  NEH: ['ne'],
  EST: ['est', 'esth'],
  JOB: ['jb'],
  PSA: ['ps', 'psa', 'psalm', 'psalms', 'pss'],
  PRO: ['pr', 'prov', 'prv'],
  ECC: ['ec', 'eccl', 'qoh'],
  SNG: ['song', 'songs', 'sos', 'sng', 'canticles'],
  ISA: ['is', 'isa'],
  JER: ['je', 'jer'],
  LAM: ['la', 'lam'],
  EZK: ['ezek', 'eze'],
  DAN: ['da', 'dan', 'dn'],
  HOS: ['ho', 'hos'],
  JOL: ['joel', 'jl'],
  AMO: ['am', 'amos'],
  OBA: ['ob', 'obad'],
  JON: ['jnh', 'jon'],
  MIC: ['mc', 'mic'],
  NAM: ['na', 'nah'],
  HAB: ['hab', 'hb'],
  ZEP: ['zep', 'zeph'],
  HAG: ['hag', 'hg'],
  ZEC: ['zec', 'zech'],
  MAL: ['mal', 'ml'],
  MAT: ['mt', 'matt'],
  MRK: ['mk', 'mark', 'mar'],
  LUK: ['lk', 'luke'],
  JHN: ['jn', 'john', 'jhn'],
  ACT: ['ac', 'acts'],
  ROM: ['ro', 'rom', 'rm'],
  '1CO': ['1cor'],
  '2CO': ['2cor'],
  GAL: ['ga', 'gal'],
  EPH: ['eph', 'ephes'],
  PHP: ['php', 'phil', 'pp'],
  COL: ['col'],
  '1TH': ['1thess', '1thes'],
  '2TH': ['2thess', '2thes'],
  '1TI': ['1tim'],
  '2TI': ['2tim'],
  TIT: ['tit', 'ti'],
  PHM: ['phm', 'philem', 'phlm'],
  HEB: ['heb'],
  JAS: ['jas', 'jms', 'james'],
  '1PE': ['1pet', '1pt'],
  '2PE': ['2pet', '2pt'],
  '1JN': ['1jn', '1john', '1jhn'],
  '2JN': ['2jn', '2john'],
  '3JN': ['3jn', '3john'],
  JUD: ['jud', 'jude'],
  REV: ['rev', 'rv', 'apoc', 'apocalypse'],
};

const slugify = (s: string): string =>
  s.trim().toLowerCase().replace(/\s+/g, '-');
const pick = (xml: string, style: string): string => {
  const m = xml.match(new RegExp(`<para style="${style}">([^<]*)</para>`));
  return m ? m[1].trim() : '';
};

const byCode: Record<string, string> = Object.fromEntries(
  readdirSync(USX_DIR)
    .filter((f) => f.endsWith('.usx'))
    .map((f) => [f.replace('.usx', ''), f]),
);

type CanonBookOut = {
  code: string;
  slug: string;
  name: string;
  longName: string;
  testament: 'OT' | 'NT';
  ordinal: number;
  chapterCount: number;
  aliases: string[];
};

const books: CanonBookOut[] = [];
ORDER.forEach((code, i) => {
  const f = byCode[code];
  if (!f) throw new Error(`Missing USX for ${code}`);
  const xml = readFileSync(join(USX_DIR, f), 'utf8');
  const name = pick(xml, 'toc2') || pick(xml, 'h');
  const longName = pick(xml, 'toc1') || name;
  const abbr = pick(xml, 'toc3');
  // Count chapter START milestones only (enhanced USX also has <chapter eid/>).
  const chapterCount = (xml.match(/<chapter [^>]*number=/g) || []).length;
  const aliases = [
    ...new Set(
      [
        abbr.toLowerCase().replace(/[^a-z0-9]/g, ''),
        code.toLowerCase(),
        ...(ALIASES[code] || []),
      ].filter(Boolean),
    ),
  ];
  books.push({
    code,
    slug: slugify(name),
    name,
    longName,
    testament: i < 39 ? 'OT' : 'NT',
    ordinal: i + 1,
    chapterCount,
    aliases,
  });
});

const ts = `// AUTO-GENERATED from the BSB USX seed (scripts/gen-canon.ts). The 66-book
// canon registry: USFM codes, url slugs, display names, chapter counts, and
// reference-lookup aliases. Used by the reference parser (client) and the reader
// navigation. Regenerate if the seed translation changes.

export type CanonBook = {
  code: string; // USFM code, e.g. "PHP"
  slug: string; // url slug, e.g. "philippians"
  name: string; // display name, e.g. "Philippians"
  longName: string;
  testament: 'OT' | 'NT';
  ordinal: number; // 1..66
  chapterCount: number;
  aliases: string[]; // lowercased, punctuation-stripped lookup keys
};

export const CANON: CanonBook[] = ${JSON.stringify(books, null, 2)};

const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]/g, '');

const BY_SLUG = new Map(CANON.map((b) => [b.slug, b]));
const BY_KEY = new Map<string, CanonBook>();
for (const b of CANON) {
  BY_KEY.set(norm(b.slug), b);
  BY_KEY.set(norm(b.name), b);
  for (const a of b.aliases) {
    BY_KEY.set(norm(a), b);
  }
}

export function bookBySlug(slug: string): CanonBook | undefined {
  return BY_SLUG.get(slug);
}

// Resolve a book by slug, name, abbreviation, or USFM code (case/space/punct
// insensitive). Returns undefined when nothing matches.
export function findBook(query: string): CanonBook | undefined {
  return BY_KEY.get(norm(query));
}

export const OLD_TESTAMENT = CANON.filter((b) => b.testament === 'OT');
export const NEW_TESTAMENT = CANON.filter((b) => b.testament === 'NT');

// The reader's default landing passage.
export const DEFAULT_BOOK = 'john';
export const DEFAULT_CHAPTER = 1;
`;

writeFileSync(OUT, ts);
console.log(
  `wrote ${OUT} — ${books.length} books, ${books.reduce((a, b) => a + b.chapterCount, 0)} chapters`,
);
