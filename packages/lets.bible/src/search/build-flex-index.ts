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
import { deriveVerses } from '../lib/derive-verses';
import {
  KJV_SOURCE_PATH,
  loadKjvSource,
  parseKjvStrongs,
} from '../server/kjv-strongs/parse';
import { buildOverlayReference, referenceUsxDir } from '../server/overlays';
import { type ParsedChapter, parseUsxBook } from '../server/usx/parse';

const here = dirname(fileURLToPath(import.meta.url));
const seedDir = join(here, '..', '..', 'seed');
const OUT = join(here, '..', '..', 'public', 'search');
const READING_OUT = join(here, '..', '..', 'public', 'reading');
const PUBLIC = join(here, '..', '..', 'public');

// Common Crawl appearance count per USFM ref (distilled, non-existent verses
// dropped). Translation-independent. Emitted per translation as an id-aligned
// array so the client can fold popularity into its re-rank (flex-client score()).
const popularity: Record<string, number> = JSON.parse(
  readFileSync(join(seedDir, 'popularity.json'), 'utf8'),
);

// Translations to build. Each loads a USFM book code → parsed chapters map,
// mirroring the `lets-bible-seed-*` recipes. USX-sourced translations (BSB/MSB)
// read one file per book; the KJV reads its committed JSON once. Add a
// translation here when one is added to the seed.
type ChaptersByBook = Map<string, Record<string, ParsedChapter>>;

function usxChapters(usxDir: string): ChaptersByBook {
  const out: ChaptersByBook = new Map();
  for (const book of CANON) {
    const xml = readFileSync(join(usxDir, `${book.code}.usx`), 'utf8');
    out.set(book.code, parseUsxBook(xml).chapters);
  }
  return out;
}

function kjvChapters(): ChaptersByBook {
  // Red-letter only (`overlays`); the source-text overlays (divine name / OT
  // quotation / notes) are applied at render time from the index, so the KJV
  // reading assets stay overlay-pure like BSB/MSB.
  const overlays = buildOverlayReference(referenceUsxDir(seedDir));
  const out: ChaptersByBook = new Map();
  for (const b of parseKjvStrongs(loadKjvSource(KJV_SOURCE_PATH), overlays)) {
    out.set(b.book.code, b.chapters);
  }
  return out;
}

const TRANSLATIONS: { id: string; load: () => ChaptersByBook }[] = [
  { id: 'BSB', load: () => usxChapters(join(seedDir, 'bsb', 'USX_1')) },
  { id: 'MSB', load: () => usxChapters(join(seedDir, 'msb', 'USX_1')) },
  { id: 'KJV', load: kjvChapters },
  { id: 'WEB', load: () => usxChapters(join(seedDir, 'web', 'USX_1')) },
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

for (const { id, load } of TRANSLATIONS) {
  // Verses in canonical order (CANON → chapter → verse), matching seed-bible's
  // ordinal order so the index ids line up with verses.json.
  const verses: [string, string][] = []; // [ref, text]
  const perBook: Record<string, number[]> = {};
  const chaptersByBook = load();

  // Per-translation reading dir: one file per book (keyed by url slug).
  const readingDir = join(READING_OUT, id);
  mkdirSync(readingDir, { recursive: true });

  for (const book of CANON) {
    const chapters = chaptersByBook.get(book.code);
    if (!chapters) {
      throw new Error(`[${id}] missing book ${book.code}`);
    }

    // Reading asset: the chapters map the reader renders. We drop each chapter's
    // `verses` map (verseNum → plain text) — it duplicates the entire text, which
    // the client rebuilds from the block runs (chapter-cache.ts via deriveVerses).
    // A handful of verses don't reconstruct exactly (boundary run-attribution), so
    // ship ONLY those as `verses` exceptions for the client to merge over. Keep
    // `chapters` intact: the search index + structure below read `[..].verses`.
    const readingChapters = Object.fromEntries(
      Object.entries(chapters).map(([k, c]) => {
        const derived = deriveVerses(c.blocks);
        const exceptions: Record<string, string> = {};
        for (const [v, text] of Object.entries(c.verses)) {
          if (derived[v] !== text) exceptions[v] = text;
        }
        return [k, { number: c.number, blocks: c.blocks, verses: exceptions }];
      }),
    );
    writeFileSync(
      join(readingDir, `${book.slug}.json`),
      JSON.stringify(readingChapters),
    );

    const chapterKeys = Object.keys(chapters)
      .map(Number)
      .sort((a, b) => a - b);
    const versesPerChapter: number[] = [];
    for (const ch of chapterKeys) {
      const vmap = chapters[String(ch)].verses;
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
  // Id-aligned popularity (0 for verses with no data), consumed by the client
  // re-rank in flex-client.ts.
  writeFileSync(
    `${OUT}/${id}.popularity.json`,
    JSON.stringify(verses.map(([ref]) => popularity[ref] ?? 0)),
  );
  structure[id] = perBook;

  console.log(`[${id}] ${verses.length} verses → index + verses + structure`);
}

writeFileSync(`${OUT}/structure.json`, JSON.stringify(structure));
console.log(`Wrote ${TRANSLATIONS.length} translation index set(s) to ${OUT}`);

// Publish the committed, translation-independent source-text-overlay index so the
// reader can fetch it and apply overlays at render time (lib/apply-overlays.ts).
const overlayIndex = join(seedDir, 'overlays', 'index.json');
const overlayOut = join(PUBLIC, 'overlays', 'index.json');
mkdirSync(dirname(overlayOut), { recursive: true });
writeFileSync(overlayOut, readFileSync(overlayIndex, 'utf8'));
console.log(`Wrote overlay index → ${overlayOut}`);
process.exit(0);
