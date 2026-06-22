// Candidate "lB" monogram treatments, built from the real Begum Bold glyph
// outlines (the l and the b from logo.svg). In the full wordmark the l's tall
// ascender reads naturally, but isolated next to the b it looks unbalanced, so
// these treatments adjust the vertical relationship. Single-color (currentColor)
// like the in-app icon / favicon.
//
// Geometry constants come from measuring the glyph bounding boxes:
//   l: x 26.71, top 147.80, baseline 230.68  (h 82.88)
//   b: x 249.46, top 157.07, baseline 230.67 (h 73.60)

const L_PATH =
  'M50.08 216.15c0 7.53 2.95 11.14 5.35 12.89v1.64H26.71v-1.64c2.73-1.75 5.35-5.35 5.35-12.89v-50.88c0-6.77-4.81-8.95-4.81-8.95v-1.64l22.82-6.88v68.35z';
const B_PATH =
  'M282.22 157.08c16.05 0 25.55 6.99 25.55 18.34s-9.39 16.71-17.58 17.69c9.06.87 20.2 5.24 20.2 17.36s-7.86 20.2-28.61 20.2h-32.32v-1.64c2.73-1.75 4.81-5.35 4.81-12.89V170.5c0-6.66-2.29-10.15-4.81-11.79v-1.64h32.76zm-8.85 3.71v30.68l3.49-.33c6.22-.65 10.05-5.13 10.05-14.74 0-13.1-5.13-15.61-11.58-15.61zm7.43 66.17c5.13 0 8.63-3.49 8.63-16.49 0-9.94-3.49-15.18-12.01-15.83l-4.04-.32v23.15c0 6.66 3.06 9.5 7.32 9.5h.11z';

const BASELINE = 230.68;
const L_LEFT = 26.71;
const B_LEFT = 249.46;
const B_DX = -178.03; // shifts the b to sit a 16-unit gap after the l
const DY_CENTER = -4.63; // shifts the b up so the two glyph centers align
const K_B = 1.126; // scale the b up to the l's height
const K_L = 0.888; // scale the l down to the b's height

// Scale by `k` about the point (ax, BASELINE) so the glyph grows/shrinks from
// the baseline (keeps it sitting on the baseline).
const scaleAboutBaseline = (k: number, ax: number) =>
  `translate(${ax} ${BASELINE}) scale(${k}) translate(${-ax} ${-BASELINE})`;

export type LbTreatment = 'baseline' | 'centered' | 'b-up' | 'l-down';

const TREATMENTS: Record<
  LbTreatment,
  { viewBox: string; l: string; b: string }
> = {
  // current: shared baseline, l towers over the b
  baseline: {
    viewBox: '23.71 144.8 111.65 88.88',
    l: '',
    b: `translate(${B_DX} 0)`,
  },
  // both glyphs at native size, centered on a shared midline
  centered: {
    viewBox: '23.71 144.8 111.65 88.88',
    l: '',
    b: `translate(${B_DX} ${DY_CENTER})`,
  },
  // b enlarged to the l's height (equal height, bolder/b-dominant)
  'b-up': {
    viewBox: '23.71 144.8 119.32 88.88',
    l: '',
    b: `translate(${B_DX} 0) ${scaleAboutBaseline(K_B, B_LEFT)}`,
  },
  // l shortened to the b's height (equal height, b stays native size)
  'l-down': {
    viewBox: '23.71 154.07 111.65 79.61',
    l: scaleAboutBaseline(K_L, L_LEFT),
    b: `translate(${B_DX} 0)`,
  },
};

export function LbMark({
  treatment = 'b-up',
  className = 'text-ink-strong',
}: {
  treatment?: LbTreatment;
  className?: string;
}) {
  const t = TREATMENTS[treatment];
  return (
    <svg viewBox={t.viewBox} className={className} role="img">
      <title>lets.bible</title>
      <path className="fill-current" transform={t.l || undefined} d={L_PATH} />
      <path className="fill-current" transform={t.b} d={B_PATH} />
    </svg>
  );
}
