// Scripture references in transcripts, in layers:
//   1. explicit spoken citations ("Romans 8:28")            ./explicit.ts
//   2. book-implied mentions ("in verse 17")                 ./implied.ts
//   3. uncited quotations matched against verse text         ./quotes.ts
//   4. the LLM annotator's links (allusions especially)      annotate-transcript
//   5. versification checks over all of them                 ./versification.ts
//
// The deterministic layers are exact and cover every mention; the LLM covers
// what only it can (paraphrase and allusion). Where layers overlap on the same
// words we keep one annotation: compatible references (same passage, or one
// containing the other) merge into the more specific one; conflicting ones go
// to the more trustworthy layer — explicit, then LLM, then implied, then
// quote.

import type {
  EvalParagraph,
  ResolvedAnnotation,
} from '../../activities/background/annotate-transcript';
import { findExplicitRefs, type FoundRef } from './explicit';
import { findImpliedRefs, primaryPassage } from './implied';
import { findQuotedRefs } from './quotes';
import { tokenize, type Token } from './tokens';
import { validateBibleRef, type BibleRef } from './versification';

export { validateBibleRef, type BibleRef } from './versification';

export type ScriptureLayer = 'explicit' | 'llm' | 'implied' | 'quote';
const PRIORITY: Record<ScriptureLayer, number> = {
  explicit: 4,
  llm: 3,
  implied: 2,
  quote: 1,
};

export const ALL_LAYERS: ReadonlySet<ScriptureLayer> = new Set(
  Object.keys(PRIORITY) as ScriptureLayer[],
);

type Candidate = FoundRef & {
  layer: ScriptureLayer;
  fromLlm?: boolean;
  // The LLM's verbatim span, kept while the annotation keeps its words.
  rawSpan?: string | null;
};
type Merged = FoundRef & { rawSpan?: string | null; fromLlm?: boolean };

// Stored on BIBLE rows no LLM link contributed to. A later run (the backfill)
// drops these and re-derives them, so a tightened rule can remove its own
// earlier false positives instead of inheriting them as the LLM's.
export const DETECTED_SOURCE = 'detected';

export type ScriptureCounts = Record<ScriptureLayer, number> & {
  // LLM references dropped for naming a chapter/verse that doesn't exist.
  invalid: number;
  // BIBLE annotations after merging.
  total: number;
};

export type AugmentResult = {
  annotations: ResolvedAnnotation[];
  counts: ScriptureCounts;
  // The LLM's BIBLE annotations that failed versification.
  invalid: ResolvedAnnotation[];
};

/**
 * Replace the BIBLE annotations in `annotations` (the LLM's) with the merged
 * result of every layer. Other kinds pass through untouched.
 */
export function augmentBibleAnnotations(
  paragraphs: readonly EvalParagraph[],
  metadata: { title?: string | null; description?: string | null },
  annotations: readonly ResolvedAnnotation[],
  // Evals switch layers off to measure each one; production runs them all.
  layers: ReadonlySet<ScriptureLayer> = ALL_LAYERS,
): AugmentResult {
  const tokens = paragraphs.map((p) => tokenize(p.text));
  const explicit = tokens.map((t) => findExplicitRefs(t));
  const primary = primaryPassage(metadata.title, metadata.description);
  const implied = findImpliedRefs(
    tokens.map((t, i) => ({ tokens: t, explicit: explicit[i] ?? [] })),
    primary,
  );
  // Chapters the sermon names, to break ties between verses a quotation
  // matches equally well.
  const cited = new Set<string>();
  for (const { ref } of [
    ...(primary ? [{ ref: primary }] : []),
    ...explicit.flat(),
    ...implied.flat(),
  ]) {
    if (ref.chapter !== undefined) cited.add(`${ref.book}.${ref.chapter}`);
  }
  const quoted = findQuotedRefs(tokens, cited);

  const index = new Map(paragraphs.map((p, i) => [p.id, i]));
  const llm: Candidate[][] = paragraphs.map(() => []);
  const invalid: ResolvedAnnotation[] = [];
  const passthrough: ResolvedAnnotation[] = [];
  for (const annotation of annotations) {
    const p = index.get(annotation.paragraphId);
    if (
      annotation.kind !== 'BIBLE' ||
      p === undefined ||
      annotation.startWord === null ||
      annotation.endWord === null
    ) {
      // Spanless or orphaned BIBLE rows can't be merged by position; keep
      // them rather than lose them, but still canonicalized and validated.
      if (annotation.kind === 'BIBLE') {
        const ref = validateBibleRef(annotation.metadata);
        if (!ref) {
          invalid.push(annotation);
          continue;
        }
        passthrough.push({ ...annotation, metadata: { ...ref } });
      } else {
        passthrough.push(annotation);
      }
      continue;
    }
    if (!layers.has('llm')) continue;
    // Our own earlier output: re-derived below, not inherited.
    if (annotation.metadata.source === DETECTED_SOURCE) continue;
    const ref = validateBibleRef(annotation.metadata);
    if (!ref) {
      invalid.push(annotation);
      continue;
    }
    llm[p]?.push({
      start: annotation.startWord,
      end: annotation.endWord,
      ref,
      layer: 'llm',
      rawSpan: annotation.rawSpan,
    });
  }

  const counts: ScriptureCounts = {
    explicit: 0,
    llm: 0,
    implied: 0,
    quote: 0,
    invalid: invalid.length,
    total: 0,
  };
  const bible: ResolvedAnnotation[] = [];
  paragraphs.forEach((paragraph, p) => {
    const candidates: Candidate[] = [
      ...(explicit[p] ?? []).map((f) => ({ ...f, layer: 'explicit' as const })),
      ...(llm[p] ?? []),
      ...(implied[p] ?? []).map((f) => ({ ...f, layer: 'implied' as const })),
      ...(quoted[p] ?? []).map((f) => ({ ...f, layer: 'quote' as const })),
    ].filter((c) => layers.has(c.layer));
    for (const c of candidates) counts[c.layer] += 1;
    const words = tokens[p] ?? [];
    for (const merged of mergeCandidates(candidates, words)) {
      bible.push({
        paragraphId: paragraph.id,
        kind: 'BIBLE',
        startWord: merged.start,
        endWord: merged.end,
        rawSpan:
          merged.rawSpan ??
          words
            .slice(merged.start, merged.end)
            .map((w) => w.raw)
            .join(' '),
        metadata: merged.fromLlm
          ? { ...merged.ref }
          : { ...merged.ref, source: DETECTED_SOURCE },
      });
    }
  });
  counts.total =
    bible.length + passthrough.filter((a) => a.kind === 'BIBLE').length;
  return { annotations: [...passthrough, ...bible], counts, invalid };
}

// Verse-level ordinal span of a reference; book-only covers everything.
export function extent(ref: BibleRef): [number, number] {
  if (ref.chapter === undefined) return [0, Number.MAX_SAFE_INTEGER];
  const start = ref.chapter * 1000 + (ref.verse ?? 0);
  const endChapter = ref.endChapter ?? ref.chapter;
  const end =
    endChapter * 1000 +
    (ref.endVerse ??
      (ref.endChapter === undefined ? ref.verse : undefined) ??
      999);
  return [start, end];
}

export function compatible(a: BibleRef, b: BibleRef): boolean {
  if (a.book !== b.book) return false;
  const [as, ae] = extent(a);
  const [bs, be] = extent(b);
  return as <= be && bs <= ae;
}

function contains(outer: BibleRef, inner: BibleRef): boolean {
  if (outer.book !== inner.book) return false;
  const [os, oe] = extent(outer);
  const [is, ie] = extent(inner);
  return os <= is && ie <= oe;
}

// Book < chapter < verse. Between two verse-level references the
// higher-priority layer's wins: a range said aloud ("Romans 8:28 through 30")
// isn't narrowed to the one verse another layer saw.
function specificity(ref: BibleRef): number {
  if (ref.chapter === undefined) return 0;
  return ref.verse === undefined ? 1 : 2;
}

// Citation text and its immediately following reading are one reference
// event (mirrors annotate-transcript's same-reference merge) — within a
// sentence: "John 3:16 opens. Later John 3:16…" is two.
const ADJACENT_GAP = 2;

function sameRef(a: BibleRef, b: BibleRef): boolean {
  return (
    a.book === b.book &&
    a.chapter === b.chapter &&
    a.verse === b.verse &&
    a.endChapter === b.endChapter &&
    a.endVerse === b.endVerse
  );
}

/** One paragraph's candidates → non-overlapping annotations. */
export function mergeCandidates(
  candidates: readonly Candidate[],
  tokens: readonly Token[] = [],
): Merged[] {
  const ordered = [...candidates].sort(
    (a, b) => PRIORITY[b.layer] - PRIORITY[a.layer] || a.start - b.start,
  );
  const accepted: Candidate[] = [];
  for (const candidate of ordered) {
    const overlapping = accepted.filter(
      (a) => a.start < candidate.end && candidate.start < a.end,
    );
    if (overlapping.some((a) => !compatible(a.ref, candidate.ref))) continue;
    if (overlapping.length === 0) {
      accepted.push({ ...candidate, fromLlm: candidate.layer === 'llm' });
      continue;
    }
    // A candidate spanning two accepted references would fuse distinct
    // mentions ("Romans 8:28 then Romans 8:31") into one; they already cover it.
    if (overlapping.length > 1) continue;
    // Fold the candidate into the annotation it overlaps, keeping the more
    // specific compatible reference.
    const keep = overlapping[0] as Candidate;
    const before = { start: keep.start, end: keep.end };
    keep.fromLlm ||= candidate.layer === 'llm';
    keep.start = Math.min(keep.start, candidate.start);
    keep.end = Math.max(keep.end, candidate.end);
    // The candidate's reference wins when it is more specific, or when its
    // words are the ones being kept: a quotation of 8:28-29 absorbing the
    // "verse 29" inside it stays 8:28-29.
    const widened =
      candidate.start <= before.start &&
      candidate.end >= before.end &&
      (candidate.start < before.start || candidate.end > before.end);
    if (
      specificity(candidate.ref) > specificity(keep.ref) ||
      (specificity(candidate.ref) === specificity(keep.ref) &&
        widened &&
        contains(candidate.ref, keep.ref))
    ) {
      keep.ref = candidate.ref;
    }
    if (keep.start === candidate.start && keep.end === candidate.end) {
      keep.rawSpan ??= candidate.rawSpan;
    } else if (keep.start !== before.start || keep.end !== before.end) {
      keep.rawSpan = undefined;
    }
  }

  accepted.sort((a, b) => a.start - b.start);
  const out: Merged[] = [];
  for (const { start, end, ref, rawSpan, fromLlm } of accepted) {
    const prev = out[out.length - 1];
    if (
      prev &&
      sameRef(prev.ref, ref) &&
      start <= prev.end + ADJACENT_GAP &&
      !tokens.slice(prev.end, start).some((t) => /[.?!]/.test(t.trail))
    ) {
      prev.end = Math.max(prev.end, end);
      prev.rawSpan = undefined;
      prev.fromLlm ||= fromLlm;
      continue;
    }
    out.push({ start, end, ref, rawSpan, fromLlm });
  }
  return out;
}
