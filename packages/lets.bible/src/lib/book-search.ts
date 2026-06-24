// Client-side FlexSearch index over the 66-book canon, so the first keystroke
// can instantly offer a book jump ("J" → John). Tiny (66 docs) — built once at
// module load, no async, no server round-trip. FlexSearch finds the candidates;
// a deterministic re-rank orders them (exact name → name prefix → alias/code →
// substring, then canonical order) so the top match is stable as the user types.
import { Charset, Index } from 'flexsearch';
import { CANON, type CanonBook } from './canon';

const norm = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

// id = index into CANON. Searchable text = name + slug + USFM code + aliases.
const index = new Index({ tokenize: 'forward', encoder: Charset.Default });
CANON.forEach((b, i) => {
  index.add(i, [b.name, b.slug, b.code, ...b.aliases].join(' '));
});

function bookScore(qn: string, b: CanonBook): number {
  const name = norm(b.name);
  const slug = norm(b.slug);
  if (name === qn || slug === qn || b.aliases.some((a) => norm(a) === qn)) {
    return 0;
  }
  if (name.startsWith(qn) || slug.startsWith(qn)) {
    return 1;
  }
  if (
    norm(b.code).startsWith(qn) ||
    b.aliases.some((a) => norm(a).startsWith(qn))
  ) {
    return 2;
  }
  return 3;
}

// Best-matching books for a (possibly partial) book name, best first.
export function matchBooks(query: string, limit = 5): CanonBook[] {
  const qn = norm(query);
  if (!qn) {
    return [];
  }
  const ids = index.search(query, { limit: 24 }) as number[];
  const seen = new Set<number>();
  const books: CanonBook[] = [];
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      books.push(CANON[id]);
    }
  }
  return books
    .map((b) => ({ b, score: bookScore(qn, b) + b.ordinal * 0.0001 }))
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((s) => s.b);
}

// A short, recognizable glyph for a book — the title-cased USFM code, keeping a
// leading numeral's letter capitalized: JHN → "Jhn", 1CO → "1Co", 3JN → "3Jn".
export function bookGlyph(b: CanonBook): string {
  return b.code.replace(
    /^(\d?)([A-Z])([A-Z]*)$/,
    (_, digit, first, rest) => digit + first + rest.toLowerCase(),
  );
}
