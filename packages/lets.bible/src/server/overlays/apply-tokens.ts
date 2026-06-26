// Server-side application of the translation-independent source-text-overlay
// index to flat word *tokens* (the interlinear / tokens tRPC layers), parallel to
// the run-based lib/apply-overlays.ts used by the reader. Reading assets and
// bible_token are overlay-pure; these layers read bible_token directly, so the
// divine-name / OT-quotation flags are resolved here from the index by
// (Strong's, ordinal) — the n-th occurrence of that Strong's in the verse.

import type { OverlayIndex } from '@/lib/apply-overlays';

// The index is published as a static asset (public/overlays/index.json) by
// build-flex-index.ts. Fetch it from the app's own static handler — the same
// pattern local/chapter-cache.ts uses for reading assets — and cache it.
let cached: Promise<OverlayIndex> | null = null;
export function loadOverlayIndex(): Promise<OverlayIndex> {
  if (!cached) {
    const base = `http://localhost:${process.env.PORT ?? 3000}`;
    cached = fetch(`${base}/overlays/index.json`)
      .then((r) => (r.ok ? (r.json() as Promise<OverlayIndex>) : {}))
      .catch(() => ({}) as OverlayIndex);
  }
  return cached;
}

type OverlayToken = {
  verse: number;
  position: number;
  strong: string | null;
  divineName: boolean;
  otQuote: boolean;
};

// Set divineName / otQuote on each token from the index. OT quotations flag the
// whole span from the first to the last anchored Strong's word (matching the
// reader's continuous underline); divine names flag the single anchored word.
export function applyOverlaysToTokens<T extends OverlayToken>(
  book: string,
  chapter: number,
  rows: T[],
  index: OverlayIndex,
): T[] {
  const byVerse = new Map<number, T[]>();
  for (const r of rows) {
    const list = byVerse.get(r.verse);
    if (list) list.push(r);
    else byVerse.set(r.verse, [r]);
  }

  for (const [verse, toks] of byVerse) {
    const entry = index[`${book}.${chapter}.${verse}`];
    if (!entry) continue;

    // (strong, ordinal) → token, by per-Strong's running count in position order.
    const ordered = [...toks].sort((a, b) => a.position - b.position);
    const counts = new Map<string, number>();
    const at = new Map<string, T>();
    for (const t of ordered) {
      if (!t.strong) continue;
      const n = (counts.get(t.strong) ?? 0) + 1;
      counts.set(t.strong, n);
      at.set(`${t.strong}#${n}`, t);
    }

    for (const d of entry.divineName ?? []) {
      const t = at.get(`${d.strong}#${d.ordinal}`);
      if (t) t.divineName = true;
    }

    const quotePos: number[] = [];
    for (const [strong, ord] of entry.otQuote ?? []) {
      const t = at.get(`${strong}#${ord}`);
      if (t) quotePos.push(t.position);
    }
    if (quotePos.length) {
      const lo = Math.min(...quotePos);
      const hi = Math.max(...quotePos);
      for (const t of toks) {
        if (t.position >= lo && t.position <= hi) t.otQuote = true;
      }
    }
  }
  return rows;
}
