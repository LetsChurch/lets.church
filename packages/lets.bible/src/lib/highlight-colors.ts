import type { CSSProperties } from 'react';

// The user highlight palette — the SINGLE source of truth for the highlight
// color keys. Server validation (trpc/procedures/library.ts), the persisted
// type (local/types.ts), the picker swatches (study-panel.tsx + library.tsx),
// and the reading renderer (passage/passage.tsx) all derive from this list.
//
// Adding a color is two steps:
//   1. add a `--color-<key>` token (light + both dark blocks) in app.css
//   2. add the key here
// No per-color CSS classes are needed — highlights render from the token via
// `color-mix`, so the palette is data-driven.
export const HIGHLIGHT_COLORS = [
  'gold',
  'sage',
  'slate',
  'rose',
  'sky',
  'plum',
] as const;

export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];

export function isHighlightColor(value: string): value is HighlightColor {
  return (HIGHLIGHT_COLORS as readonly string[]).includes(value);
}

// A solid swatch of the color (the picker dot, the library list marker).
export function highlightDotStyle(color: string): CSSProperties {
  return { backgroundColor: `var(--color-${color})` };
}

// The reading highlight. Exposes the chosen color as the `--hl` custom property;
// the `.verse-highlight` class (app.css) turns it into a translucent background
// fill in light mode and a text tint in dark mode (no background box). Fill/tint
// only — the underline is reserved for the *selection* indicator (gold), so a
// verse can be highlighted and selected at once and you see both. See
// `.verse-highlight` + `verse-selected` in app.css.
export function highlightVarStyle(color: string): CSSProperties {
  return { '--hl': `var(--color-${color})` } as CSSProperties;
}
