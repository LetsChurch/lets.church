// Extracts public-domain verse-keyed commentary modules from a local SWORD
// install into committed JSON seed artifacts (seed/commentaries/<id>.json).
//
// This is a HOST tool (not run in the container): it shells out to `mod2imp`
// from the `sword` package (brew install sword). Run via tsx (the dev dep):
//
//   ./scripts/sword/download-modules.sh                  # -> seed/.sword (gitignored)
//   pnpm exec tsx scripts/sword/extract-commentaries.ts  # -> seed/commentaries/*.json
//
// Each SWORD commentary module (zCom/zCom4) stores one entry per verse, keyed
// "Book C:V" (KJV versification), with OSIS (Calvin/MHC/MHCC) or GBF-ish
// (Geneva/Wesley) markup. We map the book name to a USFM code, flatten the
// markup to clean paragraph text, and emit one artifact per work. The seed
// script (src/db/seed-commentaries.ts) loads these into bible_commentary.
//
// Pass --sample to print a few cleaned entries per work instead of writing.

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

type Work = {
  id: string;
  module: string; // SWORD module name
  name: string;
  author: string;
  year: string;
  tradition: string;
  license: string;
  sourceUrl: string;
  ordinal: number;
};

type Entry = {
  book: string; // USFM code
  chapter: number;
  verse: number;
  body: string;
  verseEnd?: number;
};

const here = dirname(fileURLToPath(import.meta.url));
const PKG = join(here, '..', '..');
const SWORD_PATH = process.env.SWORD_PATH || join(PKG, 'seed', '.sword');
const OUT_DIR = join(PKG, 'seed', 'commentaries');
const SAMPLE = process.argv.includes('--sample');

// The first batch: public-domain Reformers & Puritans. `module` is the SWORD
// module name; `id` is our stable work id (artifact filename + work_id).
const WORKS: Work[] = [
  {
    id: 'calvin',
    module: 'CalvinCommentaries',
    name: "Calvin's Commentaries",
    author: 'John Calvin',
    year: '1540–1564',
    tradition: 'Reformed',
    license: 'Public Domain',
    sourceUrl: 'https://www.ccel.org/ccel/calvin/calcom.html',
    ordinal: 1,
  },
  {
    id: 'mhc',
    module: 'MHC',
    name: "Matthew Henry's Complete Commentary",
    author: 'Matthew Henry',
    year: '1706–1721',
    tradition: 'Puritan',
    license: 'Public Domain',
    sourceUrl: 'https://www.ccel.org/ccel/henry/mhc.html',
    ordinal: 2,
  },
  {
    id: 'mhcc',
    module: 'MHCC',
    name: "Matthew Henry's Concise Commentary",
    author: 'Matthew Henry',
    year: '1706–1721',
    tradition: 'Puritan',
    license: 'Public Domain',
    sourceUrl: 'https://www.ccel.org/ccel/henry/mhcc.html',
    ordinal: 3,
  },
  {
    id: 'geneva',
    module: 'Geneva',
    name: 'Geneva Bible Translation Notes',
    author: 'Geneva Bible (1599)',
    year: '1560–1599',
    tradition: 'Reformed',
    license: 'Public Domain',
    sourceUrl:
      'https://www.crosswire.org/sword/modules/ModInfo.jsp?modName=Geneva',
    ordinal: 4,
  },
  {
    id: 'wesley',
    module: 'Wesley',
    name: "John Wesley's Explanatory Notes",
    author: 'John Wesley',
    year: '1755–1766',
    tradition: 'Methodist',
    license: 'Public Domain',
    sourceUrl:
      'https://www.crosswire.org/sword/modules/ModInfo.jsp?modName=Wesley',
    ordinal: 5,
  },
];

// SWORD key book names (incl. Roman-numeral and long forms) -> USFM code.
const BOOK_TO_USFM: Record<string, string> = {
  genesis: 'GEN',
  exodus: 'EXO',
  leviticus: 'LEV',
  numbers: 'NUM',
  deuteronomy: 'DEU',
  joshua: 'JOS',
  judges: 'JDG',
  ruth: 'RUT',
  'i samuel': '1SA',
  'ii samuel': '2SA',
  'i kings': '1KI',
  'ii kings': '2KI',
  'i chronicles': '1CH',
  'ii chronicles': '2CH',
  ezra: 'EZR',
  nehemiah: 'NEH',
  esther: 'EST',
  job: 'JOB',
  psalms: 'PSA',
  proverbs: 'PRO',
  ecclesiastes: 'ECC',
  'song of solomon': 'SNG',
  isaiah: 'ISA',
  jeremiah: 'JER',
  lamentations: 'LAM',
  ezekiel: 'EZK',
  daniel: 'DAN',
  hosea: 'HOS',
  joel: 'JOL',
  amos: 'AMO',
  obadiah: 'OBA',
  jonah: 'JON',
  micah: 'MIC',
  nahum: 'NAM',
  habakkuk: 'HAB',
  zephaniah: 'ZEP',
  haggai: 'HAG',
  zechariah: 'ZEC',
  malachi: 'MAL',
  matthew: 'MAT',
  mark: 'MRK',
  luke: 'LUK',
  john: 'JHN',
  acts: 'ACT',
  romans: 'ROM',
  'i corinthians': '1CO',
  'ii corinthians': '2CO',
  galatians: 'GAL',
  ephesians: 'EPH',
  philippians: 'PHP',
  colossians: 'COL',
  'i thessalonians': '1TH',
  'ii thessalonians': '2TH',
  'i timothy': '1TI',
  'ii timothy': '2TI',
  titus: 'TIT',
  philemon: 'PHM',
  hebrews: 'HEB',
  james: 'JAS',
  'i peter': '1PE',
  'ii peter': '2PE',
  'i john': '1JN',
  'ii john': '2JN',
  'iii john': '3JN',
  jude: 'JUD',
  'revelation of john': 'REV',
  revelation: 'REV',
};

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&nbsp;': ' ',
  '&mdash;': '—',
  '&ndash;': '–',
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) =>
      String.fromCodePoint(Number.parseInt(h, 16)),
    )
    .replace(/&#(\d+);/g, (_, d) =>
      String.fromCodePoint(Number.parseInt(d, 10)),
    )
    .replace(/&[a-zA-Z]+;/g, (m) => ENTITIES[m] ?? m);
}

// Inline scripture-reference marker the reader parses back into a link:
// {{ref:TARGET|DISPLAY}}. TARGET is an OSIS ref (Book.Ch.Vs) or a human ref the
// client's reference parser understands; DISPLAY is the visible text. We strip
// any chars that would break the marker so the regex stays simple.
function refMarker(target: string, displayRaw: string): string {
  const display = displayRaw
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[{}|]/g, '')
    .trim();
  const t = target.replace(/[{}|]/g, '').trim();
  return display && t ? `{{ref:${t}|${display}}}` : display;
}

// Flatten OSIS/GBF markup to plain text with blank-line paragraph breaks.
function clean(raw: string): string {
  let s = raw;
  // Drop footnote/cross-note content entirely (translator/editor apparatus).
  s = s.replace(/<note\b[^>]*>[\s\S]*?<\/note>/gi, '');
  // Preserve scripture references as link markers (before the generic tag strip):
  // OSIS uses osisRef; GBF <scripRef> carries the ref as its text.
  s = s.replace(
    /<reference\b[^>]*\bosisRef="([^"]*)"[^>]*>([\s\S]*?)<\/reference>/gi,
    (_, ref, inner) => refMarker(ref, inner),
  );
  s = s.replace(/<scripRef\b[^>]*>([\s\S]*?)<\/scripRef>/gi, (_, inner) => {
    const text = inner
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return refMarker(text, text);
  });
  // Tables -> rows on their own lines, cells space-separated.
  s = s.replace(/<\/cell>/gi, '   ').replace(/<\/row>/gi, '\n');
  // Headings.
  s = s.replace(/<title\b[^>]*>/gi, '\n\n').replace(/<\/title>/gi, '\n');
  // Explicit line breaks.
  s = s.replace(/<(?:lb|br)\b[^>]*\/?>/gi, '\n');
  // Paragraph-ish blocks (OSIS x-p divs, p, list items, poetry lines).
  s = s.replace(/<div\b[^>]*type="x-p"[^>]*>/gi, '\n\n');
  s = s.replace(/<\/?(?:p|item|l|lg)\b[^>]*>/gi, '\n');
  s = s.replace(/<\/div>/gi, '\n');
  // Everything else (hi, foreign, reference, scripRef, a, name, div sID/eID,
  // milestone, table/row/cell openers, b, q, seg, w, …): drop the tag, keep text.
  s = s.replace(/<[^>]+>/g, '');
  s = decodeEntities(s);
  // Whitespace normalization.
  s = s.replace(/\r/g, '');
  s = s.replace(/\u00a0/g, ' '); // nbsp (from <lb/> runs) -> space, so blank lines collapse
  s = s.replace(/[ \t]*\n[ \t]*/g, '\n'); // trim around newlines
  s = s.replace(/[ \t]{2,}/g, ' '); // collapse runs of spaces (keep nbsp)
  s = s.replace(/\n{3,}/g, '\n\n'); // max one blank line
  return s.trim();
}

const KEY_RE = /^(.+?) (\d+):(\d+)$/;

function parseImp(imp: string): Entry[] {
  const out: Entry[] = [];
  // Records are "$$$<key>\n<body>" at line starts.
  const parts = imp.split(/(?:^|\n)\$\$\$/);
  for (const part of parts) {
    if (!part.trim()) continue;
    const nl = part.indexOf('\n');
    const key = (nl >= 0 ? part.slice(0, nl) : part).trim();
    const body = nl >= 0 ? part.slice(nl + 1) : '';
    const m = KEY_RE.exec(key);
    if (!m) continue; // skip "[ Testament N Heading ]" etc.
    const usfm = BOOK_TO_USFM[m[1].toLowerCase()];
    if (!usfm) {
      throw new Error(`Unmapped book name in key: "${key}"`);
    }
    const text = clean(body);
    if (!text) continue;
    out.push({
      book: usfm,
      chapter: Number(m[2]),
      verse: Number(m[3]),
      body: text,
    });
  }
  return out;
}

function dumpModule(module: string): string {
  return execFileSync('mod2imp', [module], {
    env: { ...process.env, SWORD_PATH },
    maxBuffer: 512 * 1024 * 1024,
    encoding: 'utf8',
  });
}

// A verse-keyed commentary entry addresses verses from its own verse until the
// next entry begins — that's how these works read (a note at v.N covers N until
// the next note). Some works (Matthew Henry) key whole sections at the opening
// verse, leaving later verses with no entry of their own; others (Calvin) are
// per-verse but skip verses they fold into the previous note. Both are handled
// the same way: each entry's `verseEnd` is the verse before the next entry in
// the same chapter (the last entry runs to the chapter's final commented verse,
// approximated by the max verse any work has for that book+chapter). We store
// `verseEnd` only when it actually spans beyond the entry's own verse.
function assignRanges(entries: Entry[], chapterMax: Map<string, number>): void {
  const groups = new Map<string, Entry[]>(); // "BOOK chapter" -> entries[]
  for (const e of entries) {
    const key = `${e.book} ${e.chapter}`;
    let group = groups.get(key);
    if (!group) {
      group = [];
      groups.set(key, group);
    }
    group.push(e);
  }
  for (const [key, group] of groups) {
    group.sort((a, b) => a.verse - b.verse);
    for (let i = 0; i < group.length; i++) {
      const end =
        i < group.length - 1
          ? group[i + 1].verse - 1
          : (chapterMax.get(key) ?? group[i].verse);
      if (end > group[i].verse) group[i].verseEnd = end;
    }
  }
}

function main(): void {
  // Pass 1: parse every module.
  const parsed = WORKS.map((work) => ({
    work,
    entries: parseImp(dumpModule(work.module)),
  }));

  // The max verse any work commented on per book+chapter — used to extend each
  // chapter's final entry to its end (so a section's last note covers its tail).
  const chapterMax = new Map<string, number>();
  for (const { entries } of parsed) {
    for (const e of entries) {
      const key = `${e.book} ${e.chapter}`;
      chapterMax.set(key, Math.max(chapterMax.get(key) ?? 0, e.verse));
    }
  }

  // Pass 2: assign verse ranges within each work, then emit.
  if (SAMPLE) {
    for (const { work, entries } of parsed) {
      assignRanges(entries, chapterMax);
      console.log(
        `\n===== ${work.id} (${work.module}) — ${entries.length} entries =====`,
      );
      for (const ref of ['GEN.1.1', 'JHN.3.16', 'ROM.8.28', 'PSA.23.1']) {
        const [b, c, v] = ref.split('.');
        const e = entries.find(
          (x) =>
            x.book === b && x.chapter === Number(c) && x.verse === Number(v),
        );
        if (e) {
          console.log(`\n--- ${ref}${e.verseEnd ? `-${e.verseEnd}` : ''} ---`);
          console.log(
            `${e.body.slice(0, 600)}${e.body.length > 600 ? ' …' : ''}`,
          );
        }
      }
    }
    return;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  for (const { work, entries } of parsed) {
    assignRanges(entries, chapterMax);
    const { module: _m, ...meta } = work;
    const artifact = { work: { ...meta, sourceModule: _m }, entries };
    const path = join(OUT_DIR, `${work.id}.json`);
    writeFileSync(path, `${JSON.stringify(artifact)}\n`);
    const ranged = entries.filter((e) => e.verseEnd).length;
    const bytes = Buffer.byteLength(JSON.stringify(artifact));
    console.log(
      `${work.id}: ${entries.length} entries (${ranged} multi-verse) -> ${path} (${(bytes / 1024 / 1024).toFixed(1)} MB)`,
    );
  }
}

main();
