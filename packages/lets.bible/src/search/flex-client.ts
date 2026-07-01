// Client-side verse search over the build-time FlexSearch assets (one set per
// translation, see build-flex-index.ts). Loaded lazily on first focus and cached
// in memory; once loaded, queries are synchronous and fast enough that the input
// needs no debounce. Candidate generation unions an AND pass (precision) with a
// suggest/OR pass (recall), then a phrase/proximity re-rank mirrors the ES
// relevance tiers — this matches Elasticsearch ranking on realistic queries.
import { Charset, Index } from 'flexsearch';
import { findBook } from '@/lib/canon';

export type VerseSuggestion = {
  id: string;
  ref: string;
  slug: string;
  name: string;
  chapter: number;
  verse: number;
  text: string;
};

// Per-chapter verse counts per translation: structure[id][usfm] = versesPerChapter.
export type Structure = Record<string, Record<string, number[]>>;

type Loaded = {
  index: Index;
  refs: string[];
  texts: string[];
  vNorm: string[];
  vWords: string[][];
  byRef: Map<string, number>;
  pop: number[]; // id-aligned Common Crawl popularity (0 when absent)
};

// Weight of the popularity tie-breaker in score(). Applied as
// `log10(1 + count) * POP_WEIGHT` (≈0..47), small vs the phrase/coverage tiers
// (1000/150) so it reorders near-ties toward more-quoted verses without lifting
// a weak match over a strong one.
const POP_WEIGHT = 8;

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Must match build-flex-index.ts exactly or import() produces a broken index.
function newIndex() {
  return new Index({
    tokenize: 'forward',
    encoder: Charset.LatinAdvanced,
    fastupdate: false,
  });
}

const cache = new Map<string, Loaded>();
const inflight = new Map<string, Promise<Loaded>>();

async function loadTranslation(id: string): Promise<Loaded> {
  const [partsRes, versesRes, popRes] = await Promise.all([
    fetch(`/search/${id}.index.json`),
    fetch(`/search/${id}.verses.json`),
    // Tolerate a missing popularity asset (older deploy) — fall back to zeros.
    fetch(`/search/${id}.popularity.json`).catch(() => null),
  ]);
  if (!partsRes.ok || !versesRes.ok) {
    throw new Error(`Failed to load search assets for ${id}`);
  }
  const parts = (await partsRes.json()) as Record<string, string>;
  const pairs = (await versesRes.json()) as [string, string][];
  const pop: number[] = popRes?.ok
    ? ((await popRes.json()) as number[])
    : pairs.map(() => 0);

  const index = newIndex();
  for (const [key, data] of Object.entries(parts)) {
    index.import(key, data);
  }

  const refs: string[] = [];
  const texts: string[] = [];
  const vNorm: string[] = [];
  const vWords: string[][] = [];
  const byRef = new Map<string, number>();
  for (let i = 0; i < pairs.length; i++) {
    const [ref, text] = pairs[i];
    refs.push(ref);
    texts.push(text);
    const n = norm(text);
    vNorm.push(n);
    vWords.push(n.split(' '));
    byRef.set(ref, i);
  }

  const loaded = { index, refs, texts, vNorm, vWords, byRef, pop };
  cache.set(id, loaded);
  inflight.delete(id);
  return loaded;
}

// Kick off (or reuse) the load for a translation. Call on focus so the assets
// are ready by the time the user types.
export function prefetchTranslation(id: string): Promise<Loaded> {
  const hit = cache.get(id);
  if (hit) {
    return Promise.resolve(hit);
  }
  let p = inflight.get(id);
  if (!p) {
    p = loadTranslation(id).catch((err) => {
      inflight.delete(id);
      throw err;
    });
    inflight.set(id, p);
  }
  return p;
}

export function isLoaded(id: string): boolean {
  return cache.has(id);
}

function refParts(ref: string) {
  const [code, ch, v] = ref.split('.');
  const book = findBook(code);
  return {
    slug: book?.slug ?? code.toLowerCase(),
    name: book?.name ?? code,
    chapter: Number(ch),
    verse: Number(v),
  };
}

// Phrase/proximity re-rank, mirroring ES tiers: exact phrase >> partial phrase
// >> term coverage + proximity. Higher is better.
function score(qN: string, qT: string[], t: Loaded, i: number): number {
  const text = t.vNorm[i];
  const w = t.vWords[i];
  let s = 0;
  if (text.includes(qN)) {
    s += 1000;
  }
  let run = 0;
  for (let win = qT.length; win >= 2 && !run; win--) {
    for (let a = 0; a + win <= qT.length; a++) {
      if (text.includes(qT.slice(a, a + win).join(' '))) {
        run = win;
        break;
      }
    }
  }
  s += run * 50;
  const wset = new Set(w);
  let matched = 0;
  const pos: number[] = [];
  for (const term of qT) {
    let p = -1;
    if (wset.has(term)) {
      p = w.indexOf(term);
    } else if (term.length >= 3) {
      p = w.findIndex((x) => x.startsWith(term));
    }
    if (p >= 0) {
      matched++;
      pos.push(p);
    }
  }
  s += (matched / qT.length) * 150;
  if (matched === qT.length && pos.length) {
    const win = Math.max(...pos) - Math.min(...pos) + 1;
    s += Math.max(0, 120 - 15 * (win - qT.length));
  }
  s += matched * 2 - 0.02 * w.length;
  // Popularity tie-breaker: nudge more-quoted verses up among similar matches.
  s += Math.log10(1 + (t.pop[i] ?? 0)) * POP_WEIGHT;
  return s;
}

// Synchronous verse search — returns [] until the translation is loaded.
export function searchVersesSync(
  id: string,
  query: string,
  limit = 5,
): VerseSuggestion[] {
  const t = cache.get(id);
  const qN = norm(query);
  if (!t || !qN) {
    return [];
  }
  const qT = qN.split(' ').filter(Boolean);
  const ids = new Set<number>(
    t.index.search(query, { limit: 200 }) as number[],
  );
  for (const v of t.index.search(query, {
    suggest: true,
    limit: 200,
  }) as number[]) {
    ids.add(v);
  }
  return [...ids]
    .map((i) => ({ i, s: score(qN, qT, t, i) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(({ i }) => {
      const ref = t.refs[i];
      const p = refParts(ref);
      return {
        id: `v:${ref}`,
        ref,
        text: t.texts[i],
        slug: p.slug,
        name: p.name,
        chapter: p.chapter,
        verse: p.verse,
      };
    });
}

// Count of verses containing the query as an exact (normalized) phrase — powers
// the autocomplete's "Exact phrase" entry. Returns 0 until loaded.
export function countExactPhraseSync(id: string, query: string): number {
  const t = cache.get(id);
  const qN = norm(query);
  if (!t || !qN) {
    return 0;
  }
  let count = 0;
  for (const v of t.vNorm) {
    if (v.includes(qN)) {
      count++;
    }
  }
  return count;
}

// Verse text for a canonical ref (e.g. "JHN.3.16") — null until loaded / unknown.
export function getVerseTextSync(id: string, ref: string): string | null {
  const t = cache.get(id);
  if (!t) {
    return null;
  }
  const i = t.byRef.get(ref);
  return i == null ? null : t.texts[i];
}

let structure: Structure | null = null;
let structureInflight: Promise<Structure> | null = null;

// Eagerly fetch the small versification table (per-chapter verse counts) used by
// the book-jump widget's verse grid.
export function prefetchStructure(): Promise<Structure> {
  if (structure) {
    return Promise.resolve(structure);
  }
  if (!structureInflight) {
    structureInflight = fetch('/search/structure.json')
      .then((r) => {
        if (!r.ok) {
          throw new Error('Failed to load structure.json');
        }
        return r.json() as Promise<Structure>;
      })
      .then((s) => {
        structure = s;
        return s;
      })
      .catch((err) => {
        structureInflight = null;
        throw err;
      });
  }
  return structureInflight;
}

export function getStructureSync(): Structure | null {
  return structure;
}
