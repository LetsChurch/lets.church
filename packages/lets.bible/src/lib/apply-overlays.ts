// Apply the translation-independent source-text-overlay index to a chapter's
// reading runs at RENDER time (no baking). The index is the authoritative committed
// source (seed/overlays/index.json) — it anchors each annotation by (Strong's,
// ordinal), the n-th occurrence of that Strong's in the verse, which resolves to the
// right word in any Strong's-tagged translation. This runs in the chapter loader (so
// the reader + study panel see overlays) and is reused server-side for the interlinear.

import type {
  Block,
  Footnote,
  PoetryLine,
  ProseVerse,
  Run,
} from '@/components/passage/types';
import type { BookChapter } from '@/db';
import { parseReference } from '@/lib/reference';

export type IndexedDivineName = {
  strong: string;
  ordinal: number;
  surface: string;
};
export type IndexedNote = { strong: string; ordinal: number; text: string };
export type VerseOverlays = {
  divineName?: IndexedDivineName[];
  otQuote?: [string, number][];
  notes?: IndexedNote[];
};
export type OverlayIndex = Record<string, VerseOverlays>;

// Link the trailing cross-reference of a divine-name note ("…cf. Is 40:3"); fall
// back to plain text when it doesn't parse.
export function buildDivineNameNote(note: string): Footnote {
  const m = note.match(/^(.*\bcf\.\s*)(\S.*)$/);
  if (m) {
    const parsed = parseReference(m[2]);
    if (parsed) {
      return {
        segments: [
          { text: m[1] },
          { text: m[2], ref: { ...parsed, label: m[2] } },
        ],
      };
    }
  }
  return { segments: [{ text: note }] };
}

type Resolved = {
  otQuote: Set<number>;
  divine: Map<number, string>; // position → surface to small-cap
  notes: Map<number, string[]>; // position → note bodies
};

// Resolve a verse's index anchors to token positions, using the verse's own runs
// (each carries `strong` + `position`) to map (strong, ordinal) → position.
function resolve(runs: Run[], entry: VerseOverlays): Resolved {
  const posOf = new Map<string, number>(); // `${strong}#${ordinal}` → position
  const counts = new Map<string, number>();
  const seen = new Set<number>();
  for (const r of runs) {
    if (r.position == null || !r.strong || seen.has(r.position)) continue;
    seen.add(r.position);
    const n = (counts.get(r.strong) ?? 0) + 1;
    counts.set(r.strong, n);
    posOf.set(`${r.strong}#${n}`, r.position);
  }
  const at = (strong: string, ord: number) => posOf.get(`${strong}#${ord}`);

  // Underline the quotation continuously from its first to its last anchored
  // Strong's word, covering supplied/unanchored words in between (a translation
  // renders the quote's connective words differently, so only some tokens carry an
  // indexed Strong's — but the underline should still be one unbroken span).
  const otQuote = new Set<number>();
  const quotePositions: number[] = [];
  for (const [strong, ord] of entry.otQuote ?? []) {
    const p = at(strong, ord);
    if (p != null) quotePositions.push(p);
  }
  if (quotePositions.length) {
    const lo = Math.min(...quotePositions);
    const hi = Math.max(...quotePositions);
    for (let p = lo; p <= hi; p++) otQuote.add(p);
  }
  const divine = new Map<number, string>();
  for (const d of entry.divineName ?? []) {
    const p = at(d.strong, d.ordinal);
    if (p != null) divine.set(p, d.surface);
  }
  const notes = new Map<number, string[]>();
  for (const note of entry.notes ?? []) {
    const p = at(note.strong, note.ordinal);
    if (p == null) continue;
    const list = notes.get(p);
    if (list) list.push(note.text);
    else notes.set(p, [note.text]);
  }
  return { otQuote, divine, notes };
}

function markQuote(r: Run): Run {
  return { ...r, otQuote: true, smallcaps: true };
}

// Apply the resolved overlays to one run segment: split divine-name runs at their
// surface, flag OT-quotation runs, splice in divine-name-note footnotes, then make
// span underlines continuous by bridging the separator runs between flagged words.
function applyToRuns(runs: Run[], resolved: Resolved): Run[] {
  const out: Run[] = [];
  for (const r of runs) {
    const pos = r.position;
    if (pos == null) {
      out.push(r);
      continue;
    }
    const surface = resolved.divine.get(pos);
    if (surface) {
      // Split "that the LORD" → "that the " + "LORD"(divine). The supplied words
      // keep their flags; only the divine name gets small caps.
      const idx = r.text.toLowerCase().lastIndexOf(surface.toLowerCase());
      if (idx >= 0) {
        const before = r.text.slice(0, idx);
        const name = r.text.slice(idx, idx + surface.length);
        const after = r.text.slice(idx + surface.length);
        if (before) out.push({ ...r, text: before });
        out.push({ ...r, text: name, divineName: true, smallcaps: true });
        if (after) out.push({ ...r, text: after });
      } else {
        out.push(resolved.otQuote.has(pos) ? markQuote(r) : r);
      }
    } else {
      out.push(resolved.otQuote.has(pos) ? markQuote(r) : r);
    }
    for (const text of resolved.notes.get(pos) ?? []) {
      out.push({ text: '', note: buildDivineNameNote(text) });
    }
  }
  bridgeSeparators(out);
  return out;
}

// A separator run between two OT-quotation words inherits the flag so the dotted
// underline runs continuously (matches the USX `qt` span). Mirrors the KJV parser.
function bridgeSeparators(runs: Run[]): void {
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    if (run.position !== undefined || run.note) continue;
    let p = i - 1;
    while (p >= 0 && runs[p].position === undefined && !runs[p].note) p -= 1;
    let n = i + 1;
    while (n < runs.length && runs[n].position === undefined && !runs[n].note) {
      n += 1;
    }
    const prev = p >= 0 ? runs[p] : undefined;
    const next = n < runs.length ? runs[n] : undefined;
    if (prev?.position === undefined || next?.position === undefined) continue;
    if (prev.otQuote && next.otQuote) {
      run.otQuote = true;
      run.smallcaps = true;
    }
  }
}

function segmentsOf(block: Block): (ProseVerse | PoetryLine)[] {
  if (block.kind === 'prose' || block.kind === 'descriptive')
    return block.verses;
  if (block.kind === 'poetry') return block.lines;
  return [];
}

// Apply the overlay index to one chapter, returning a NEW chapter (the cached
// reading asset is never mutated). Verses with no index entry are untouched.
export function applyOverlays(
  book: string,
  chapterNum: number,
  chapter: BookChapter,
  index: OverlayIndex,
): BookChapter {
  // Gather each verse's run segments (a verse can span blocks) so positions resolve
  // verse-globally, while we rebuild each segment's runs in place.
  const segs = new Map<number, (ProseVerse | PoetryLine)[]>();
  const blocks: Block[] = chapter.blocks.map((b) => {
    const copy = segmentsOf(b).map((s) => {
      const verse = s.verse ?? s.num;
      const clone = { ...s };
      if (verse != null) {
        const list = segs.get(verse);
        if (list) list.push(clone);
        else segs.set(verse, [clone]);
      }
      return clone;
    });
    if (b.kind === 'prose' || b.kind === 'descriptive') {
      return { ...b, verses: copy as ProseVerse[] };
    }
    if (b.kind === 'poetry') return { ...b, lines: copy as PoetryLine[] };
    return b;
  });

  for (const [verse, list] of segs) {
    const entry = index[`${book}.${chapterNum}.${verse}`];
    if (!entry) continue;
    const resolved = resolve(
      list.flatMap((s) => s.runs),
      entry,
    );
    for (const s of list) {
      s.runs = applyToRuns(s.runs, resolved);
    }
  }
  return { ...chapter, blocks };
}
