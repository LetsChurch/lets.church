// Build-time generator for the client-side search + reading assets, one set per
// translation. Reads the **committed USX seed** (the same source `seed-bible.ts`
// ingests) and parses it with `parseUsxBook` — it does NOT touch Postgres, so it
// runs during the Docker image build (`pnpm build` → this, then `vite build`,
// which copies `public/` into `.output/public/`). Run standalone for dev via
// `pnpm flex:build` / `just lets-bible-flex`.
//
// Writes to public/ (git-ignored — regenerated from the seed):
//   search/<id>.index.json   — exported FlexSearch verse index (forward · LatinAdvanced)
//   search/<id>.verses.json  — id-aligned [ref, text][] for re-ranking + display
//   search/structure.json    — { [translationId]: { [usfm]: versesPerChapter[] } }
//                              for the book-jump widget's chapter/verse grids
//   reading/<id>/<slug>.json — per-book { [chapter]: BookChapter } the reader
//                              renders (replaces the tRPC bible.chapter/DB path,
//                              SW-cached for offline; see local/chapter-cache.ts)
//
// The forward tokenizer powers type-ahead (partial last word); LatinAdvanced is
// the smallest useful encoder. The client re-ranks the candidates to match ES
// quality (see flex-client.ts).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Charset, Index } from 'flexsearch';
import { CANON } from '../lib/canon';
import { parseUsxBook } from '../server/usx/parse';

const here = dirname(fileURLToPath(import.meta.url));
const seedDir = join(here, '..', '..', 'seed');
const OUT = join(here, '..', '..', 'public', 'search');
const READING_OUT = join(here, '..', '..', 'public', 'reading');

// Translations to build, each mapped to its USX_1 directory — mirrors the
// `lets-bible-seed-*` recipes. Add a translation here when one is added to the seed.
const TRANSLATIONS: { id: string; usxDir: string }[] = [
  { id: 'BSB', usxDir: join(seedDir, 'bsb', 'USX_1') },
  { id: 'MSB', usxDir: join(seedDir, 'msb', 'USX_1') },
];

mkdirSync(OUT, { recursive: true });
mkdirSync(READING_OUT, { recursive: true });

function newIndex() {
  // fastupdate:false → smaller, read-only index (we never mutate at runtime).
  return new Index({
    tokenize: 'forward',
    encoder: Charset.LatinAdvanced,
    fastupdate: false,
  });
}

// Collect all export parts into one { key: data } object (FlexSearch's export is
// synchronous in 0.8 and emits string parts: reg, cfg, map, …).
function exportIndex(index: ReturnType<typeof newIndex>) {
  const parts: Record<string, string> = {};
  index.export((key: string, data: unknown) => {
    if (data != null) {
      parts[key] = typeof data === 'string' ? data : JSON.stringify(data);
    }
  });
  return parts;
}

const structure: Record<string, Record<string, number[]>> = {};

for (const { id, usxDir } of TRANSLATIONS) {
  // Verses in canonical order (CANON → chapter → verse), matching seed-bible's
  // ordinal order so the index ids line up with verses.json.
  const verses: [string, string][] = []; // [ref, text]
  const perBook: Record<string, number[]> = {};

  // Per-translation reading dir: one file per book (keyed by url slug).
  const readingDir = join(READING_OUT, id);
  mkdirSync(readingDir, { recursive: true });

  for (const book of CANON) {
    const xml = readFileSync(join(usxDir, `${book.code}.usx`), 'utf8');
    const parsed = parseUsxBook(xml);

    // Reading asset: the chapters map the reader renders (matches the
    // bibleBook.content JSONB that bible.book/bible.chapter used to slice).
    writeFileSync(
      join(readingDir, `${book.slug}.json`),
      JSON.stringify(parsed.chapters),
    );

    const chapterKeys = Object.keys(parsed.chapters)
      .map(Number)
      .sort((a, b) => a - b);
    const versesPerChapter: number[] = [];
    for (const ch of chapterKeys) {
      const vmap = parsed.chapters[String(ch)].verses;
      const verseNums = Object.keys(vmap)
        .map(Number)
        .sort((a, b) => a - b);
      for (const v of verseNums) {
        verses.push([`${book.code}.${ch}.${v}`, vmap[String(v)]]);
      }
      versesPerChapter[ch - 1] = verseNums[verseNums.length - 1] ?? 0;
    }
    perBook[book.code] = versesPerChapter;
  }

  const index = newIndex();
  for (let i = 0; i < verses.length; i++) {
    index.add(i, verses[i][1]);
  }
  const parts = exportIndex(index);

  // Round-trip self-check: a fresh index importing these parts must search.
  const probe = newIndex();
  for (const [key, data] of Object.entries(parts)) {
    probe.import(key, data);
  }
  const hits = probe.search('beginning', { limit: 1 });
  if (!Array.isArray(hits) || hits.length === 0) {
    throw new Error(
      `[${id}] export/import round-trip failed — no hits for "beginning"`,
    );
  }

  writeFileSync(`${OUT}/${id}.index.json`, JSON.stringify(parts));
  writeFileSync(`${OUT}/${id}.verses.json`, JSON.stringify(verses));
  structure[id] = perBook;

  console.log(`[${id}] ${verses.length} verses → index + verses + structure`);
}

writeFileSync(`${OUT}/structure.json`, JSON.stringify(structure));
console.log(`Wrote ${TRANSLATIONS.length} translation index set(s) to ${OUT}`);
process.exit(0);
