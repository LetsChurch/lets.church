// Source-text overlay projection — reusable across translations.
//
// BSB/MSB carry the source-text overlays natively in their USX: words of Jesus
// (`<char style="wj">`), Old-Testament quotations (`qt`), and the divine name
// (`nd`), which the parser turns into the `wordsOfJesus` / `otQuote` / `divineName`
// token flags. Translations whose source lacks that markup (e.g. the KJV+ JSON)
// get these overlays *projected* onto their tokens from a reference translation
// that has them. Both sides carry Strong's numbers, so we align by **Strong's
// sequence** (an LCS) rather than surface wording — robust to translation
// differences (BSB critical vs KJV TR/Byzantine, word order, function-word
// granularity).
//
//   buildOverlayReference(usxDir) → a translation-independent, Strong's-keyed
//     per-verse reference (the three flags per token), from a USX translation.
//   projectOverlays(refTokens, targetTokens) → { red, otQuote, divineName } flag
//     arrays aligned to ANY translation's Strong's-tagged verse tokens.
//
// `red` / `otQuote` are SPAN overlays (contiguous runs of words) — projected with
// gap-fill + function-word boundary extension + a guarded whole-verse fast path.
// `divineName` is a POINT overlay (a single word, YHWH) — a plain per-token copy.
//
// This is the consumer side of what `source-text-overlay` will eventually own as
// translation-independent Layer-1 annotations; keeping the reference Strong's-keyed
// (not text-keyed) keeps it portable to that tool.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CANON } from '../../lib/canon';
import { parseUsxBook } from '../usx/parse';

// One reference token: its Strong's number (if any) + the source-text overlay flags.
export type RefToken = {
  strong?: string;
  red: boolean;
  otQuote: boolean;
  divineName: boolean;
};
// Keyed by canonical ref ("MAT.3.15"); only verses with at least one flag are kept.
export type OverlayReference = Map<string, RefToken[]>;
export type OverlayFlags = {
  red: boolean[];
  otQuote: boolean[];
  divineName: boolean[];
};

// The reference translation whose native overlays we project from. MSB (Byzantine/
// Majority text) is chosen over BSB (critical text) because it is textually closer
// to the Textus-Receptus-based KJV: its Strong's sequences align better, and it
// carries Byzantine/Majority readings the KJV shares but the critical text omits
// (e.g. Luke 4:8 "Get behind Me, Satan"; the John 7:53–8:11 pericope). The DB seed
// and the static asset build MUST use the same reference (or the study panel and
// the reader would disagree), so resolve it from one place.
export const OVERLAY_REFERENCE = 'msb';
export function referenceUsxDir(seedDir: string): string {
  return join(seedDir, OVERLAY_REFERENCE, 'USX_1');
}

// Build the overlay reference from a USX translation. Parses every book (divine
// name is OT-heavy; words of Jesus / OT quotations are NT) and records, per verse
// that carries any overlay, the token sequence with Strong's + flags.
export function buildOverlayReference(usxDir: string): OverlayReference {
  const ref: OverlayReference = new Map();
  for (const book of CANON) {
    const parsed = parseUsxBook(
      readFileSync(join(usxDir, `${book.code}.usx`), 'utf8'),
    );
    const byVerse = new Map<string, RefToken[]>();
    for (const t of parsed.tokens) {
      const key = `${book.code}.${t.chapter}.${t.verse}`;
      let list = byVerse.get(key);
      if (!list) {
        list = [];
        byVerse.set(key, list);
      }
      list.push({
        strong: t.strong,
        red: !!t.wordsOfJesus,
        otQuote: !!t.otQuote,
        divineName: !!t.divineName,
      });
    }
    for (const [key, tokens] of byVerse) {
      if (tokens.some((t) => t.red || t.otQuote || t.divineName)) {
        ref.set(key, tokens);
      }
    }
  }
  return ref;
}

export type ProjectedCrossRef = {
  fromBook: string; // USFM code
  fromChapter: number;
  fromVerse: number;
  toBook: string; // canon slug
  toChapter: number;
  toVerse?: number;
};

// Cross-references for a translation, from the committed self-contained artifact
// (seed/overlays/cross-references.json — extracted from the baked USX before the
// overlay/cross-ref strip; the current seed USX is overlay-pure and carries no
// `<note style="x">`). Powers the OT-quotation hover-card source links + the study
// panel's cross-references; the KJV (no markup of its own) projects the reference
// translation's set (`loadCrossRefs('MSB')`).
const crossRefArtifact = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'seed',
  'overlays',
  'cross-references.json',
);

export function loadCrossRefs(translationId: string): ProjectedCrossRef[] {
  const all = JSON.parse(readFileSync(crossRefArtifact, 'utf8')) as Record<
    string,
    ProjectedCrossRef[]
  >;
  return all[translationId] ?? [];
}

// Longest-common-subsequence alignment over two Strong's-bearing token sequences.
// Returns matched [targetIndex, refIndex] pairs (only tokens that carry a Strong's
// participate; null-Strong's function words are handled by the gap/boundary fill).
function lcsAlign(
  target: (string | undefined)[],
  reference: (string | undefined)[],
): [number, number][] {
  const a = target.map((s, i) => [s, i] as const).filter(([s]) => s);
  const b = reference.map((s, i) => [s, i] as const).filter(([s]) => s);
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        a[i][0] === b[j][0]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i][0] === b[j][0]) {
      pairs.push([a[i][1], b[j][1]]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return pairs;
}

// Project a SPAN overlay (red-letter / OT quotation): a contiguous run of words.
function projectSpanFlag(
  refTokens: RefToken[],
  targetTokens: { strong?: string }[],
  pairs: [number, number][],
  pick: (t: RefToken) => boolean,
): boolean[] {
  const flag = new Array<boolean>(targetTokens.length).fill(false);
  // 1. Copy across Strong's-aligned content words.
  for (const [ti, ri] of pairs) {
    flag[ti] = pick(refTokens[ri]);
  }
  // Fast path: when the WHOLE reference verse carries the flag AND most of the
  // target's content words aligned (the two verses are essentially the same text),
  // flag the whole target verse — eliminating leading/trailing boundary slips. The
  // coverage guard matters because the KJV (TR) can carry a long insertion the
  // Byzantine reference lacks (e.g. Acts 9:6 "And he trembling and astonished
  // said…"): there the reference verse is fully flagged but only part of the KJV
  // verse aligns, so we must NOT blanket-flag the rest.
  if (refTokens.every(pick)) {
    const targetStrong = targetTokens.filter((t) => t.strong).length;
    if (targetStrong === 0 || pairs.length / targetStrong >= 0.6) {
      return flag.fill(true);
    }
  }
  // 2. Fill any token strictly between two flagged tokens (covers null-Strong's
  //    articles/conjunctions and word-order-dropped words inside a run).
  let last = -1;
  for (let k = 0; k < flag.length; k++) {
    if (flag[k]) {
      if (last >= 0) {
        for (let g = last + 1; g < k; g++) {
          flag[g] = true;
        }
      }
      last = k;
    }
  }
  // 3. Extend each run outward over immediately-adjacent null-Strong's tokens
  //    (leading/trailing function words, e.g. "It is" in "It is written"). Safe:
  //    a quote's intro verb carries a Strong's, so this never swallows narration.
  const isFunc = (k: number) => !targetTokens[k]?.strong;
  for (let k = 0; k < flag.length; k++) {
    if (!flag[k]) {
      continue;
    }
    for (let g = k - 1; g >= 0 && isFunc(g) && !flag[g]; g--) {
      flag[g] = true;
    }
    for (let g = k + 1; g < flag.length && isFunc(g) && !flag[g]; g++) {
      flag[g] = true;
    }
  }
  return flag;
}

// Project a POINT overlay (divine name): a single word (YHWH). A plain per-token
// copy — no span fill/extend, which would wrongly pull in the article ("the LORD").
function projectPointFlag(
  refTokens: RefToken[],
  targetTokens: { strong?: string }[],
  pairs: [number, number][],
  pick: (t: RefToken) => boolean,
): boolean[] {
  const flag = new Array<boolean>(targetTokens.length).fill(false);
  for (const [ti, ri] of pairs) {
    flag[ti] = pick(refTokens[ri]);
  }
  return flag;
}

// Project all three overlays from the reference verse onto a target verse's tokens.
export function projectOverlays(
  refTokens: RefToken[] | undefined,
  targetTokens: { strong?: string }[],
): OverlayFlags {
  const empty = () => new Array<boolean>(targetTokens.length).fill(false);
  if (!refTokens) {
    return { red: empty(), otQuote: empty(), divineName: empty() };
  }
  const pairs = lcsAlign(
    targetTokens.map((t) => t.strong),
    refTokens.map((t) => t.strong),
  );
  return {
    red: projectSpanFlag(refTokens, targetTokens, pairs, (t) => t.red),
    otQuote: projectSpanFlag(refTokens, targetTokens, pairs, (t) => t.otQuote),
    divineName: projectPointFlag(
      refTokens,
      targetTokens,
      pairs,
      (t) => t.divineName,
    ),
  };
}

// Curated red-letter for KJV (Textus Receptus) words of Jesus that the Byzantine/
// Majority reference (MSB) lacks entirely, so projection has nothing to align to.
// These are the only pure-TR red-letter gaps — every other classic "omitted verse"
// (Matt 17:21/18:11/23:14, Mark 7:16/9:44/9:46/11:26, the Lord's Prayer doxology…)
// is still in the Byzantine text, so it projects fine. Keyed by canonical ref; the
// value is `'all'` (the whole verse is spoken) or a list of phrases matched against
// consecutive token surfaces (letters only, case-insensitive).
const MANUAL_RED: Record<string, 'all' | string[]> = {
  // "it is hard for thee to kick against the pricks" — the Lord's words to Saul, a
  // TR reading harmonized from Acts 26:14; absent from the Byzantine text. (Acts
  // 9:6's TR insertion is narration + Saul, not Jesus, so nothing to add there.)
  'ACT.9.5': ['it is hard for thee to kick against the pricks'],
  // "Two men shall be in the field; the one shall be taken, and the other left." —
  // entirely the Lord's words (Luke 17:34–37 discourse), a TR/Western verse the
  // Majority text drops, so MSB has no entry for it.
  'LUK.17.36': 'all',
};

const lettersOnly = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

// Apply the curated TR-only red-letter for a verse (mutates `red`). No-op unless
// the ref has an entry. `'all'` reddens every token; otherwise each phrase is
// matched as a consecutive run of token surfaces.
export function applyManualRedLetter(
  ref: string,
  tokens: { surface: string }[],
  red: boolean[],
): void {
  const entry = MANUAL_RED[ref];
  if (!entry) {
    return;
  }
  if (entry === 'all') {
    red.fill(true);
    return;
  }
  const surfaces = tokens.map((t) => lettersOnly(t.surface));
  for (const phrase of entry) {
    const words = phrase.split(/\s+/).map(lettersOnly).filter(Boolean);
    for (let i = 0; i + words.length <= surfaces.length; i++) {
      let match = true;
      for (let j = 0; j < words.length; j++) {
        if (surfaces[i + j] !== words[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        for (let j = 0; j < words.length; j++) {
          red[i + j] = true;
        }
        break;
      }
    }
  }
}
