// Layer 3: Scripture quoted without a citation ("for all have sinned and fall
// short of the glory of God"), found by matching transcript wording against
// public-domain verse text (KJV, WEB, BSB — data/verse-text.tsv.gz, exported
// from lets.bible by `just lb-export-verse-text`).
//
// Word 4-grams seed candidate verses; each candidate is then aligned against
// the transcript window (longest common subsequence, which tolerates
// speech-to-text slips and translation differences) and kept only when the
// match is long, dense, and distinctive. 4-grams that occur in many verses
// ("the LORD your God") never seed a match, and a candidate needs distinctive
// wording or most of the verse, so stock phrases don't become citations.

import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

import logger from '../logger';
import type { FoundRef } from './explicit';
import { parseOsis } from './implied';
import type { Token } from './tokens';
import type { BibleRef } from './versification';

const moduleLogger = logger.child({ module: 'temporal/util/scripture/quotes' });

const GRAM = 4;
// A 4-gram in more verses than this is a stock phrase: never a seed.
const MAX_SEED_VERSES = 40;
// A 4-gram in at most this many verses is distinctive wording.
const DISTINCTIVE_VERSES = 8;
const MIN_MATCHED_WORDS = 5;
// Summed rarity (ln(verses / verses containing the word)) of the matched
// words: "the wages of sin is death" carries ~17, "but I want you to" ~6.
const MIN_INFORMATION = 20;
// Candidates this close in matched words are a tie, broken in favor of
// passages the sermon cites ("the children of Israel cried unto the LORD"
// is in four places in Judges).
const TIE_WORDS = 1;
// Matched words / transcript words spanned: tolerates a few ASR slips or
// interjections, not a loose paraphrase.
const MIN_DENSITY = 0.7;
// Without two distinctive 4-grams, a quote must cover most of its verse.
const MIN_VERSE_COVERAGE = 0.6;
// Words of slack around the seeds when aligning, for partial edge 4-grams.
const WINDOW_SLACK = 6;
// Where a quotation crosses a paragraph break, a sliver ("In", "a steward.")
// on one side isn't worth annotating on its own.
const MIN_SEGMENT_WORDS = 3;

type VerseIndex = {
  refs: BibleRef[];
  vocab: Map<string, number>;
  // Sorted 4-gram hashes and, in parallel, the verse each occurs in.
  hashes: Uint32Array;
  verses: Uint16Array;
  // Word ids of verse v in translation t: ids[offsets[v * T + t] .. offsets[v * T + t + 1]).
  ids: Uint32Array;
  offsets: Uint32Array;
  translations: number;
  // Per word id: ln(verses / verses containing it).
  information: Float32Array;
};

export function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .split(/[\s\-–—]+/)
    .map((word) => word.replace(/'/g, '').replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((word) => word.length > 0);
}

function mix(h: number, k: number): number {
  return Math.imul(h ^ k, 0x01000193);
}
function gramHash(ids: ArrayLike<number>, at: number): number {
  let h = 0x811c9dc5;
  for (let k = 0; k < GRAM; k++) h = mix(h, ids[at + k] as number);
  // fmix32 avalanche so nearby id tuples spread across the hash space.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function buildIndex(tsv: string): VerseIndex {
  const lines = tsv.split('\n').filter((line) => line.length > 0);
  const translations = (lines[0]?.split('\t').length ?? 1) - 1;
  const refs: BibleRef[] = [];
  const vocab = new Map<string, number>();
  const idList: number[] = [];
  const offsets = new Uint32Array(lines.length * translations + 1);
  const keys: number[] = [];

  for (const line of lines) {
    const [osis, ...texts] = line.split('\t');
    const ref = osis ? parseOsis(osis) : null;
    if (!ref) continue;
    const v = refs.length;
    refs.push(ref);
    for (let t = 0; t < translations; t++) {
      const start = idList.length;
      offsets[v * translations + t] = start;
      for (const word of normalizeWords(texts[t] ?? '')) {
        let id = vocab.get(word);
        if (id === undefined) {
          id = vocab.size;
          vocab.set(word, id);
        }
        idList.push(id);
      }
      for (let k = start; k + GRAM <= idList.length; k++) {
        // hash * 2^16 + verse stays an exact integer in a double.
        keys.push(gramHash(idList, k) * 65536 + v);
      }
    }
  }
  offsets[refs.length * translations] = idList.length;

  const containing = new Uint32Array(vocab.size);
  const seen = new Int32Array(vocab.size).fill(-1);
  for (let v = 0; v < refs.length; v++) {
    for (
      let k = offsets[v * translations] as number;
      k < (offsets[(v + 1) * translations] as number);
      k++
    ) {
      const id = idList[k] as number;
      if (seen[id] === v) continue;
      seen[id] = v;
      containing[id] = (containing[id] as number) + 1;
    }
  }
  const information = Float32Array.from(containing, (n) =>
    Math.log(refs.length / Math.max(1, n)),
  );

  const sorted = Float64Array.from(keys).sort();
  const hashes: number[] = [];
  const verses: number[] = [];
  let last = -1;
  for (const key of sorted) {
    if (key === last) continue; // same 4-gram twice in one verse
    last = key;
    hashes.push(Math.floor(key / 65536));
    verses.push(key % 65536);
  }
  return {
    refs,
    vocab,
    hashes: Uint32Array.from(hashes),
    verses: Uint16Array.from(verses),
    ids: Uint32Array.from(idList),
    offsets: offsets.slice(0, refs.length * translations + 1),
    translations,
    information,
  };
}

let index: VerseIndex | null | undefined;
function verseIndex(): VerseIndex | null {
  if (index !== undefined) return index;
  try {
    const gz = readFileSync(
      new URL('./data/verse-text.tsv.gz', import.meta.url),
    );
    index = buildIndex(gunzipSync(gz).toString('utf8'));
  } catch (err) {
    // A bundle that didn't ship the data file (e.g. the web SSR build running
    // an admin eval) degrades to no quote matching rather than failing.
    moduleLogger.warn(
      { context: { error: err instanceof Error ? err.message : String(err) } },
      'Verse text unavailable; skipping quote matching',
    );
    index = null;
  }
  return index;
}

function lowerBound(sorted: Uint32Array, value: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((sorted[mid] as number) < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** [position in `a`, position in `b`] pairs matched by a longest common
 * subsequence. */
function lcsMatches(
  a: ArrayLike<number>,
  aStart: number,
  aEnd: number,
  b: ArrayLike<number>,
  bStart: number,
  bEnd: number,
): Array<[number, number]> {
  const n = aEnd - aStart;
  const m = bEnd - bStart;
  const table = new Uint16Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * (m + 1) + j] =
        a[aStart + i] === b[bStart + j]
          ? (table[(i + 1) * (m + 1) + j + 1] as number) + 1
          : Math.max(
              table[(i + 1) * (m + 1) + j] as number,
              table[i * (m + 1) + j + 1] as number,
            );
    }
  }
  const matched: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[aStart + i] === b[bStart + j]) {
      matched.push([aStart + i, bStart + j]);
      i += 1;
      j += 1;
    } else if (
      (table[(i + 1) * (m + 1) + j] as number) >=
      (table[i * (m + 1) + j + 1] as number)
    ) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return matched;
}

type Quote = { verse: number; first: number; last: number; matched: number };

/**
 * Uncited quotations, per paragraph. `paragraphs` are each paragraph's
 * tokens; spans are token ranges within a paragraph (a quote that runs across
 * a paragraph break is reported in each paragraph it touches).
 */
export function findQuotedRefs(
  paragraphs: ReadonlyArray<readonly Token[]>,
  // Chapters the sermon cites ("Rom.12"), preferred when verses tie.
  cited: ReadonlySet<string> = new Set(),
): FoundRef[][] {
  const out: FoundRef[][] = paragraphs.map(() => []);
  const idx = verseIndex();
  if (!idx) return out;

  // Flatten the transcript into normalized words, remembering where each
  // came from. Unknown words get an id no verse has.
  const ids: number[] = [];
  const origin: Array<{ paragraph: number; token: number }> = [];
  paragraphs.forEach((tokens, paragraph) => {
    tokens.forEach((token, t) => {
      for (const word of normalizeWords(token.raw)) {
        ids.push(idx.vocab.get(word) ?? 0xffffffff);
        origin.push({ paragraph, token: t });
      }
    });
  });

  // Seed: verse → [position, distinctive?] for each shared 4-gram.
  const seeds = new Map<number, Array<{ pos: number; distinctive: boolean }>>();
  for (let p = 0; p + GRAM <= ids.length; p++) {
    const h = gramHash(ids, p);
    const from = lowerBound(idx.hashes, h);
    let to = from;
    while (to < idx.hashes.length && idx.hashes[to] === h) to++;
    const count = to - from;
    if (count === 0 || count > MAX_SEED_VERSES) continue;
    for (let k = from; k < to; k++) {
      const verse = idx.verses[k] as number;
      let list = seeds.get(verse);
      if (!list) {
        list = [];
        seeds.set(verse, list);
      }
      list.push({ pos: p, distinctive: count <= DISTINCTIVE_VERSES });
    }
  }

  const candidates: Quote[] = [];
  for (const [verse, hits] of seeds) {
    const length = Math.max(
      ...Array.from({ length: idx.translations }, (_, t) => {
        const o = verse * idx.translations + t;
        return (idx.offsets[o + 1] as number) - (idx.offsets[o] as number);
      }),
    );
    // Split repeated quotations of the same verse into separate clusters.
    let cluster: typeof hits = [];
    const flush = () => {
      const quote = alignCluster(idx, ids, verse, cluster);
      if (quote) candidates.push(quote);
      cluster = [];
    };
    for (const hit of hits) {
      const prev = cluster[cluster.length - 1];
      if (prev && hit.pos - prev.pos > length + WINDOW_SLACK) flush();
      cluster.push(hit);
    }
    flush();
  }

  // Overlapping candidates are parallel passages or near-duplicate verses:
  // keep the strongest. Adjacent verses don't overlap and are kept together.
  const isCited = (q: Quote) => {
    const ref = idx.refs[q.verse] as BibleRef;
    return cited.has(`${ref.book}.${ref.chapter}`);
  };
  candidates.sort((a, b) => b.matched - a.matched || a.verse - b.verse);
  const accepted: Quote[] = [];
  for (const quote of candidates) {
    if (accepted.some((q) => q.first <= quote.last && quote.first <= q.last)) {
      continue;
    }
    // Among near-ties for these words, a cited chapter wins.
    const rival = isCited(quote)
      ? undefined
      : candidates.find(
          (q) =>
            q !== quote &&
            isCited(q) &&
            quote.matched - q.matched <= TIE_WORDS &&
            q.first <= quote.last &&
            quote.first <= q.last,
        );
    const free = (q: Quote) =>
      !accepted.some((a) => a.first <= q.last && q.first <= a.last);
    // The rival may itself collide with an accepted quote; the quotation is
    // still real, so fall back to it.
    accepted.push(rival && free(rival) ? rival : quote);
  }
  accepted.sort((a, b) => a.first - b.first);

  // Consecutive verses quoted back to back become one range.
  const merged: Array<{ ref: BibleRef; first: number; last: number }> = [];
  for (const quote of accepted) {
    const ref = idx.refs[quote.verse] as BibleRef;
    const prev = merged[merged.length - 1];
    const prevEnd = prev ? (prev.ref.endVerse ?? prev.ref.verse) : undefined;
    if (
      prev &&
      prev.ref.book === ref.book &&
      prev.ref.chapter === ref.chapter &&
      prev.ref.endChapter === undefined &&
      prevEnd !== undefined &&
      ref.verse === prevEnd + 1 &&
      quote.first - prev.last <= WINDOW_SLACK
    ) {
      prev.ref = { ...prev.ref, endVerse: ref.verse };
      prev.last = quote.last;
      continue;
    }
    merged.push({ ref: { ...ref }, first: quote.first, last: quote.last });
  }

  const emit = (
    segment: { paragraph: number; start: number; end: number },
    ref: BibleRef,
  ) => {
    if (segment.end - segment.start < MIN_SEGMENT_WORDS) return;
    out[segment.paragraph]?.push({
      start: segment.start,
      end: segment.end,
      ref,
    });
  };
  for (const { ref, first, last } of merged) {
    let segment: { paragraph: number; start: number; end: number } | null =
      null;
    for (let p = first; p <= last; p++) {
      const o = origin[p] as { paragraph: number; token: number };
      if (segment && segment.paragraph === o.paragraph) {
        segment.end = o.token + 1;
        continue;
      }
      if (segment) emit(segment, ref);
      segment = { paragraph: o.paragraph, start: o.token, end: o.token + 1 };
    }
    if (segment) emit(segment, ref);
  }
  for (const found of out) found.sort((a, b) => a.start - b.start);
  return out;
}

// Matched words further apart than this (in the transcript, or skipping
// this many words of the verse) aren't one quotation: a common word from the
// rest of the verse ("…that is in Christ Jesus") turning up in the next
// sentence ("In verse 31…").
const MAX_TRANSCRIPT_GAP = 3;
const MAX_VERSE_SKIP = 2;

/** Transcript positions of the largest run of matches with no gap over the
 * limits on either side. */
function densestRun(matched: ReadonlyArray<[number, number]>): number[] {
  let best: number[] = [];
  let run: number[] = [];
  let prev: [number, number] | undefined;
  for (const pair of matched) {
    if (
      prev &&
      (pair[0] - prev[0] > MAX_TRANSCRIPT_GAP ||
        pair[1] - prev[1] > MAX_VERSE_SKIP + 1)
    ) {
      run = [];
    }
    run.push(pair[0]);
    prev = pair;
    if (run.length > best.length) best = run;
  }
  return best;
}

function alignCluster(
  idx: VerseIndex,
  ids: readonly number[],
  verse: number,
  cluster: ReadonlyArray<{ pos: number; distinctive: boolean }>,
): Quote | null {
  const first = cluster[0];
  const last = cluster[cluster.length - 1];
  if (!first || !last) return null;
  const from = Math.max(0, first.pos - WINDOW_SLACK);
  const to = Math.min(ids.length, last.pos + GRAM + WINDOW_SLACK);
  const distinctive = cluster.filter((hit) => hit.distinctive).length;

  let best: Quote | null = null;
  for (let t = 0; t < idx.translations; t++) {
    const o = verse * idx.translations + t;
    const vStart = idx.offsets[o] as number;
    const vEnd = idx.offsets[o + 1] as number;
    if (vEnd - vStart < GRAM) continue;
    const matched = densestRun(
      lcsMatches(ids, from, to, idx.ids, vStart, vEnd),
    );
    if (matched.length < MIN_MATCHED_WORDS) continue;
    const a = matched[0] as number;
    const b = matched[matched.length - 1] as number;
    if (matched.length / (b - a + 1) < MIN_DENSITY) continue;
    const coverage = matched.length / (vEnd - vStart);
    if (distinctive < 2 && coverage < MIN_VERSE_COVERAGE) continue;
    let information = 0;
    for (const p of matched)
      information += idx.information[ids[p] as number] ?? 0;
    if (information < MIN_INFORMATION) continue;
    if (!best || matched.length > best.matched) {
      best = { verse, first: a, last: b, matched: matched.length };
    }
  }
  return best;
}
