import { Popover } from '@base-ui/react/popover';
import { PreviewCard } from '@base-ui/react/preview-card';
import {
  createContext,
  type ReactElement,
  type ReactNode,
  useContext,
  useMemo,
  useRef,
} from 'react';
import { highlightVarStyle } from '@/lib/highlight-colors';
import { passageHref } from '@/lib/reference';
import type {
  Block,
  Footnote,
  FootnoteSegment,
  PoetryLine,
  ProseVerse,
  Run,
  Tone,
} from './types';

// How the divine name (YHWH) is rendered. Mirrors server/preferences.ts (which
// can't be imported into the client bundle — it pulls in the DB).
export type DivineName = 'lord' | 'yhwh' | 'yahweh';

// Reading preferences read by the renderers (so they don't have to thread
// through every block/run). Set once by Passage.
type ReadingPrefs = {
  redLetter: boolean;
  verseNumbers: boolean;
  textSize: number; // px; the prose reading size (poetry is 1px smaller)
  divineName: DivineName;
  sourceOverlay: boolean; // show dotted-underline + tooltip source-text hints
};
const ReadingPrefsContext = createContext<ReadingPrefs>({
  redLetter: true,
  verseNumbers: true,
  textSize: 21,
  divineName: 'lord',
  sourceOverlay: true,
});

// A clickable word in the reading: its verse + 0-based word index (for the
// highlight), the Strong's number (for the study lookup), its surface text, and
// any source-text overlay flags (so the study panel can explain them).
export type WordRef = {
  verse: number;
  position: number;
  strong: string;
  surface: string;
  divineName?: boolean;
  otQuote?: boolean;
  morph?: string; // parsing code (from the true interlinear), e.g. 'V-AAI-3S'
  language?: string; // 'greek' | 'hebrew' — how to decode `morph`
};

// Word-selection wiring, read by the word runs. `selectedVerse` lets a word
// know whether its verse is already selected (so a click selects the word
// instead of re-selecting the verse). `studyOpen` is true while the study panel
// is showing — in that mode a single click on ANY word switches the study to
// it, so the panel stays open as you read across verses. Null when word
// selection is disabled.
type WordSelection = {
  selectedVerse: number | null;
  selected: { verse: number; position: number } | null;
  studyOpen: boolean;
  onSelectWord: (word: WordRef) => void;
};
const WordSelectionContext = createContext<WordSelection | null>(null);

// Per-user library marks for the current chapter: verse → highlight color, and
// the set of verses that have a note. Read by the verse renderers.
type Marks = { highlights: Record<number, string>; noted: Set<number> };
const MarksContext = createContext<Marks>({
  highlights: {},
  noted: new Set(),
});

// Cross-references for the chapter, by verse number — used to show the source
// passage in OT-quotation tooltips. Keyed by verse (string).
export type CrossRef = {
  label: string;
  slug: string;
  chapter: number;
  verse: number | null;
};
const EMPTY_CROSSREFS: Record<string, CrossRef[]> = {};
const CrossRefsContext =
  createContext<Record<string, CrossRef[]>>(EMPTY_CROSSREFS);

// The verse to flash transiently (arrived at via a direct ?v= reference). Verse
// spans add the `verse-flash` animation class while they match; null disables.
const FlashVerseContext = createContext<number | null>(null);

// Per-chapter footnote labels (a, b, c, …) keyed by note identity, so each
// marker renders its sequential letter (print-Bible style) instead of a bare `*`.
const FootnoteLabelsContext = createContext<Map<Footnote, string>>(new Map());

// Sequential footnote label: 0→a, 25→z, 26→aa, … (bijective base-26).
function footnoteLabel(index: number): string {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(97 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// All footnotes in render (reading) order, each with the verse it belongs to, so
// labels match the markers' order and can be filtered per verse.
function collectFootnotes(
  blocks: Block[],
): { verse: number | undefined; note: Footnote }[] {
  const out: { verse: number | undefined; note: Footnote }[] = [];
  const fromRuns = (verse: number | undefined, runs: Run[]) => {
    for (const r of runs) {
      if (r.note) {
        out.push({ verse, note: r.note });
      }
    }
  };
  for (const b of blocks) {
    if (b.kind === 'prose' || b.kind === 'descriptive') {
      for (const v of b.verses) {
        fromRuns(v.verse ?? v.num, v.runs);
      }
    } else if (b.kind === 'poetry') {
      for (const l of b.lines) {
        fromRuns(l.verse ?? l.num, l.runs);
      }
    } else if (b.kind === 'focusVerse') {
      fromRuns(b.verse.verse ?? b.verse.num, b.verse.runs);
    }
  }
  return out;
}

// The footnotes for one verse, each with its chapter-sequential label (a, b, c…)
// — the same letters the inline markers show, so the study panel matches.
export function footnotesForVerse(
  blocks: Block[],
  verse: number,
): { label: string; note: Footnote }[] {
  return collectFootnotes(blocks)
    .map((f, i) => ({ ...f, label: footnoteLabel(i) }))
    .filter((f) => f.verse === verse)
    .map(({ label, note }) => ({ label, note }));
}

// Source-text overlays present in a verse's runs — for the study panel's
// "Source text" list. Keyed by the same flags the inline overlays use.
export function overlaysInVerse(runs: Run[]): {
  divineNames: string[];
  hasOtQuote: boolean;
  hallelujahs: string[];
} {
  const divineNames: string[] = [];
  const hallelujahs: string[] = [];
  let hasOtQuote = false;
  for (const r of runs) {
    if (r.divineName) {
      divineNames.push(r.text.trim());
    }
    if (r.otQuote) {
      hasOtQuote = true;
    }
    if (HALLELUJAH_RE.test(r.text.trim())) {
      hallelujahs.push(r.text.trim());
    }
  }
  return { divineNames, hasOtQuote, hallelujahs };
}

type Size = 'reading' | 'base';

// Line-height per genre; the reading font size comes from the textSize pref
// (applied inline), the 'base' size (Storybook) stays fixed.
const PROSE_LEADING = {
  reading: 'leading-[1.85]',
  base: 'text-[18px] leading-[1.72]',
} as const;
const POETRY_LEADING = {
  reading: 'leading-[1.55]',
  base: 'text-[18px] leading-[1.5]',
} as const;

function toneText(tone: Tone | undefined, redletter?: boolean): string {
  if (tone === 'faded') {
    return 'text-context';
  }
  return redletter ? 'text-redletter' : 'text-ink';
}

function numClass(tone: Tone | undefined): string {
  if (tone === 'focus') {
    return 'text-gold-soft';
  }
  return 'text-verse-num';
}

function VerseNum({ n, tone }: { n: number; tone?: Tone }) {
  const { verseNumbers } = useContext(ReadingPrefsContext);
  if (!verseNumbers) {
    return null;
  }
  return (
    <sup
      className={`mr-[3px] align-[0.5em] font-bold font-sans text-[11px] ${numClass(tone)}`}
    >
      {n}
    </sup>
  );
}

// A footnote marker that opens a popover with the note body. Rendered as a
// superscript sequential letter (a, b, c, … per chapter), the conventional
// print-Bible cue. Cross-references inside the note link into the reader.
function FootnoteMarker({ note }: { note: Footnote }) {
  const labels = useContext(FootnoteLabelsContext);
  const label = labels.get(note) ?? '*';
  return (
    <Popover.Root>
      <Popover.Trigger
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        className="ml-px cursor-pointer rounded-[2px] align-[0.45em] font-sans text-[11px] text-gold italic outline-none hover:underline focus-visible:ring-2 focus-visible:ring-gold/40"
      >
        <span className="select-none">{label}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} className="z-40">
          <Popover.Popup className="max-w-[320px] rounded-xl border border-line-strong bg-paper-raised px-3.5 py-2.5 text-[13px] text-muted leading-relaxed shadow-[0_26px_50px_-28px_rgba(40,34,18,0.45)]">
            {note.origin ? (
              <span className="mr-1 font-semibold text-faint">
                {note.origin}
              </span>
            ) : null}
            <FootnoteSegments segments={note.segments} />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

// The body of a footnote — its text segments, with embedded references linking
// into the reader. Shared by the inline footnote popover and the study panel's
// footnote list.
export function FootnoteSegments({
  segments,
}: {
  segments: FootnoteSegment[];
}) {
  return (
    <>
      {segments.map((s, i) =>
        s.ref ? (
          <a
            key={`k${i}`}
            href={passageHref(s.ref)}
            className="text-gold hover:underline"
          >
            {s.text || s.ref.label}
          </a>
        ) : (
          <span key={`k${i}`} className={s.italic ? 'italic' : undefined}>
            {s.text}
          </span>
        ),
      )}
    </>
  );
}

const HALLELUJAH_RE = /^hallelujah[.,;:!?’"”)]*$/i;

type Overlay = 'divine' | 'otquote' | 'hallelujah';

// Tooltip body per overlay kind. Divine-name copy depends on how it's rendered;
// the OT-quotation body links to the source passage(s) from cross-references.
function overlayTooltip(
  kind: Overlay,
  mode: DivineName,
  refs: CrossRef[],
): ReactNode {
  if (kind === 'divine') {
    return mode === 'lord'
      ? 'Literally YHWH — the divine name (Tetragrammaton).'
      : 'The divine name YHWH, traditionally rendered “the LORD”.';
  }
  if (kind === 'hallelujah') {
    return '“Praise Yah” — hallĕlû (praise) + Yah (a short form of YHWH).';
  }
  // OT quotation: link to the source(s) when we know them, else a plain note.
  if (refs.length === 0) {
    return 'Old Testament quotation.';
  }
  return (
    <span>
      Quoting{' '}
      {refs.map((r, i) => (
        <span key={r.label}>
          {i > 0 ? ', ' : ''}
          <a
            href={passageHref({
              book: r.slug,
              chapter: r.chapter,
              verse: r.verse ?? undefined,
            })}
            className="font-semibold text-gold-soft underline underline-offset-2 hover:text-gold"
          >
            {r.label}
          </a>
        </span>
      ))}
    </span>
  );
}

// A dotted-underline span with a hover card, used for source-text overlays.
// `trigger` is the (already styled / clickable) word span it wraps. Built on
// Base UI PreviewCard (not Tooltip) so the popup is *hoverable* — the reader can
// move the pointer into it and click the OT-quotation source link.
function OverlayTip({
  body,
  trigger,
}: {
  body: ReactNode;
  trigger: ReactElement<Record<string, unknown>>;
}) {
  return (
    <PreviewCard.Root>
      <PreviewCard.Trigger render={trigger} />
      <PreviewCard.Portal>
        <PreviewCard.Positioner sideOffset={6} className="z-40">
          <PreviewCard.Popup className="max-w-[260px] rounded-lg bg-[#26251f] px-3 py-1.5 text-[#f3efe6] text-[12.5px] leading-snug shadow-[0_14px_34px_-12px_rgba(20,16,8,0.55)]">
            {body}
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  );
}

// When rendering the divine name as YHWH/Yahweh, the preceding English article
// ("the LORD" → "Yahweh") reads wrong, so drop a "the" immediately before a
// divine-name run. The article may be its own run ("the") or the tail of the
// previous run (BSB groups supplied words with the Hebrew word, e.g. the run
// "that the " shares the YHWH Strong's with "LORD"). Returns the runs to omit
// outright plus text overrides for runs whose trailing "the" is trimmed.
function divineArticleEdits(
  runs: Run[],
  mode: DivineName,
): { omit: Set<number>; override: Map<number, string> } {
  const omit = new Set<number>();
  const override = new Map<number, string>();
  if (mode === 'lord') {
    return { omit, override };
  }
  runs.forEach((r, i) => {
    if (!r.divineName) {
      return;
    }
    let j = i - 1;
    while (j >= 0 && runs[j].text.trim() === '' && !runs[j].note) {
      j -= 1;
    }
    if (j < 0 || runs[j].note) {
      return;
    }
    const prev = override.get(j) ?? runs[j].text;
    if (!/(^|\s)the\s*$/i.test(prev)) {
      return;
    }
    const dropBetween = () => {
      for (let k = j + 1; k < i; k += 1) {
        if (runs[k].text.trim() === '') {
          omit.add(k);
        }
      }
    };
    if (prev.trim().toLowerCase() === 'the') {
      omit.add(j); // a standalone "the" run
      dropBetween();
    } else {
      override.set(j, prev.replace(/\s*the\s*$/i, ' ')); // trailing "the"
      dropBetween();
    }
  });
  return { omit, override };
}

const LONG_PRESS_MS = 450;
const LONG_PRESS_MOVE_TOLERANCE = 10; // px of finger drift before we cancel

function Runs({ runs, verse }: { runs: Run[]; verse?: number }) {
  const { redLetter, divineName, sourceOverlay } =
    useContext(ReadingPrefsContext);
  const ws = useContext(WordSelectionContext);
  const crossRefs = useContext(CrossRefsContext);
  const verseRefs = verse != null ? (crossRefs[String(verse)] ?? []) : [];
  const { omit, override } = divineArticleEdits(runs, divineName);
  // Long-press (touch) state. Only one finger presses at a time, so a single set
  // of refs for the whole paragraph is enough — keeping each word a plain <span>
  // so the Base UI overlay tooltip can still use it as a render target.
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lpStart = useRef<{ x: number; y: number } | null>(null);
  const lpFired = useRef(false);
  const cancelLongPress = () => {
    if (lpTimer.current) {
      clearTimeout(lpTimer.current);
      lpTimer.current = null;
    }
    lpStart.current = null;
  };
  // Footnote markers immediately following a word are rendered *with* that word
  // (in a `whitespace-nowrap` wrapper, below) so they never orphan onto the next
  // line; those run indices are recorded here and skipped when the map reaches them.
  const consumedNotes = new Set<number>();
  // Render runs into `out`, grouping consecutive OT-quotation runs under ONE
  // dotted-underline wrapper so the decoration is drawn once (continuous) rather
  // than restarting per word/space (which reads as a segmented, broken underline).
  const out: ReactNode[] = [];
  let quoteBuf: ReactNode[] = [];
  let quoteKey = 0;
  const flushQuote = () => {
    if (!quoteBuf.length) return;
    const buf = quoteBuf;
    const key = quoteKey;
    quoteBuf = [];
    out.push(
      <OverlayTip
        key={`q${key}`}
        body={overlayTooltip('otquote', divineName, verseRefs)}
        trigger={
          <span className="cursor-help underline decoration-muted-2/80 decoration-dotted underline-offset-[3px]">
            {buf}
          </span>
        }
      />,
    );
  };
  runs.forEach((r, i) => {
    {
      if (consumedNotes.has(i)) {
        return;
      }
      if (r.note) {
        flushQuote();
        out.push(<FootnoteMarker key={`k${i}`} note={r.note} />);
        return;
      }
      if (omit.has(i)) {
        return;
      }
      const showRed = !!r.redletter && redLetter;
      const isWord = !!ws && verse != null && !!r.strong && r.position != null;
      // Only show the word-hover affordance when a click would actually open
      // word study — i.e. the verse is already selected or the study panel is
      // open. Otherwise a click just selects the verse, so the word shouldn't
      // look individually clickable. (Touch long-press still works regardless.)
      const wordStudyable =
        isWord && !!ws && (ws.studyOpen || ws.selectedVerse === verse);
      const isSelectedWord =
        isWord &&
        ws?.selected?.verse === verse &&
        ws?.selected?.position === r.position;

      const overlay: Overlay | null = !sourceOverlay
        ? null
        : r.divineName
          ? 'divine'
          : r.otQuote
            ? 'otquote'
            : HALLELUJAH_RE.test(r.text.trim())
              ? 'hallelujah'
              : null;
      // Divine name / Hallelujah are POINT overlays (one word) → underline +
      // hover per run. OT quotations are SPAN overlays → the underline + hover go
      // on a wrapper around the whole contiguous quote (below), so the dotted
      // decoration is drawn once instead of restarting per word.
      const pointOverlay = overlay === 'divine' || overlay === 'hallelujah';

      // Divine name renders per the user's preference; in YHWH/Yahweh mode it
      // is no longer small-capped, and a neighboring article may be trimmed.
      const renderedAsName = r.divineName && divineName !== 'lord';
      const text = renderedAsName
        ? divineName === 'yhwh'
          ? 'YHWH'
          : 'Yahweh'
        : (override.get(i) ?? r.text);

      const cls = [
        // Small caps for the divine name only (rendered as "LORD"). OT
        // quotations keep just the dotted-underline overlay, not small caps.
        r.divineName && !renderedAsName
          ? '[font-variant:small-caps] tracking-[0.03em]'
          : '',
        r.mark ? 'scripture-mark' : '',
        showRed ? 'text-redletter' : '',
        pointOverlay
          ? // Longhand decoration utilities (NOT the `[text-decoration:…]`
            // shorthand, which resets text-decoration-color to currentColor —
            // that made the underline follow the text color and vanish on
            // faded/low-contrast text in dark mode). `muted-2` is a deliberate,
            // theme-aware gray that stays visible in both light and dark.
            // (OT quotations underline via their group wrapper, not per word.)
            'underline decoration-muted-2/80 decoration-dotted underline-offset-[3px]'
          : '',
        wordStudyable
          ? 'cursor-pointer rounded-[2px] transition-colors hover:bg-[rgba(154,123,63,0.1)]'
          : pointOverlay
            ? 'cursor-help'
            : '',
        isSelectedWord
          ? 'bg-[rgba(154,123,63,0.24)] shadow-[0_0_0_2px_rgba(154,123,63,0.24)]'
          : '',
      ]
        .filter(Boolean)
        .join(' ');

      let node: ReactElement<Record<string, unknown>>;
      if (isWord && ws && verse != null) {
        const wordVerse = verse;
        const select = () =>
          ws.onSelectWord({
            verse: wordVerse,
            position: r.position as number,
            strong: r.strong as string,
            surface: text,
            divineName: r.divineName,
            otQuote: r.otQuote,
          });
        node = (
          // biome-ignore lint/a11y/useKeyWithClickEvents: words are a pointer-only enhancement; keyboard users select the verse and open Study
          // biome-ignore lint/a11y/noStaticElementInteractions: same — the verse span is the keyboard target
          <span
            key={`k${i}`}
            data-strong={r.strong}
            className={cls || undefined}
            // Touch: press-and-hold opens word study directly (the desktop
            // double-click isn't reachable once the modal sheet covers the
            // text). A short tap still bubbles to select the verse.
            onPointerDown={(e) => {
              if (e.pointerType !== 'touch') {
                return;
              }
              lpFired.current = false;
              lpStart.current = { x: e.clientX, y: e.clientY };
              cancelLongPress();
              lpTimer.current = setTimeout(() => {
                lpFired.current = true;
                select();
              }, LONG_PRESS_MS);
            }}
            onPointerMove={(e) => {
              if (e.pointerType !== 'touch' || !lpStart.current) {
                return;
              }
              const moved = Math.hypot(
                e.clientX - lpStart.current.x,
                e.clientY - lpStart.current.y,
              );
              if (moved > LONG_PRESS_MOVE_TOLERANCE) {
                cancelLongPress();
              }
            }}
            onPointerUp={(e) => {
              if (e.pointerType === 'touch') {
                cancelLongPress();
              }
            }}
            onPointerCancel={cancelLongPress}
            onContextMenu={(e) => {
              if (lpFired.current) {
                e.preventDefault();
              }
            }}
            onClick={(e) => {
              // Swallow the click that follows a long-press so it doesn't also
              // select the verse.
              if (lpFired.current) {
                e.preventDefault();
                e.stopPropagation();
                lpFired.current = false;
                return;
              }
              // First click selects the verse (let it bubble); a second click
              // (verse already selected, or the panel already open) selects the
              // word. Two deliberate clicks — no double-click gesture, which
              // would double-fire and double-highlight.
              if (ws.studyOpen || ws.selectedVerse === wordVerse) {
                e.stopPropagation();
                select();
              }
            }}
          >
            {text}
          </span>
        );
      } else {
        node = (
          <span key={`k${i}`} className={cls || undefined}>
            {text}
          </span>
        );
      }

      const el =
        pointOverlay && overlay ? (
          <OverlayTip
            key={`k${i}`}
            body={overlayTooltip(overlay, divineName, verseRefs)}
            trigger={node}
          />
        ) : (
          node
        );

      // Pull any footnote marker(s) that immediately follow this word into a
      // `whitespace-nowrap` wrapper so the marker can't wrap onto the next line
      // away from its word (a bare/inline/word-joined marker doesn't hold — a
      // button is treated atomically; only a nowrap context reliably glues it).
      const notes: Footnote[] = [];
      for (let j = i + 1; j < runs.length && runs[j].note; j += 1) {
        notes.push(runs[j].note as Footnote);
        consumedNotes.add(j);
      }
      let composite: ReactNode = el;
      if (notes.length) {
        composite = (
          <span key={`k${i}`} className="whitespace-nowrap">
            {el}
            {/* `no-underline` keeps the marker out of a quote group's underline */}
            <span className="no-underline">
              {notes.map((note, k) => (
                <FootnoteMarker key={`n${i}-${k}`} note={note} />
              ))}
            </span>
          </span>
        );
      }
      if (overlay === 'otquote') {
        if (!quoteBuf.length) {
          quoteKey = i;
        }
        quoteBuf.push(composite);
      } else {
        flushQuote();
        out.push(composite);
      }
    }
  });
  flushQuote();
  return <>{out}</>;
}

function ProseParagraph({
  verses,
  size,
  selectedVerse,
  onSelectVerse,
}: {
  verses: ProseVerse[];
  size: Size;
  selectedVerse?: number | null;
  onSelectVerse?: (num: number | null) => void;
}) {
  const { textSize } = useContext(ReadingPrefsContext);
  const marks = useContext(MarksContext);
  const flashVerse = useContext(FlashVerseContext);
  const style = size === 'reading' ? { fontSize: `${textSize}px` } : undefined;
  return (
    <p className={`mb-[22px] font-serif ${PROSE_LEADING[size]}`} style={style}>
      {verses.map((v, i) => {
        // `num` prints the badge (only where a verse starts); `vnum` is the
        // effective verse — carried into continuation segments — that drives
        // selection, highlighting, notes, and word lookup.
        const vnum = v.verse ?? v.num;
        const isNoted = vnum != null && marks.noted.has(vnum);
        const inner = (
          <>
            {v.num != null ? <VerseNum n={v.num} tone={v.tone} /> : null}
            <Runs runs={v.runs} verse={vnum} />
            {isNoted ? (
              <span
                className="ml-[2px] select-none align-[0.4em] text-[10px] text-gold"
                title="Has a note"
              >
                ✎
              </span>
            ) : null}
          </>
        );
        const key = `v${i}`;
        const selectable = !!onSelectVerse && vnum != null;
        if (selectable && vnum != null) {
          const num = vnum;
          const isSel = selectedVerse != null && vnum === selectedVerse;
          const hl = marks.highlights[num];
          // A span (not <button>) so inline footnote buttons can nest validly:
          // a <button> can't contain another <button>. The toolbar popover
          // anchors to the verse with [data-verse-selected] = "true".
          return (
            // biome-ignore lint/a11y/useSemanticElements: must stay a span so inline footnote buttons can nest
            <span
              key={key}
              role="button"
              tabIndex={0}
              data-verse={num}
              data-verse-selected={isSel ? 'true' : undefined}
              // Highlight (color fill / dark text tint) and selection (gold
              // underline) are on different CSS properties, so both show at once
              // when a verse is highlighted AND selected.
              style={hl ? highlightVarStyle(hl) : undefined}
              className={`cursor-pointer rounded-[3px] text-ink ${
                hl ? 'verse-highlight' : ''
              } ${isSel ? 'verse-selected' : ''} ${
                flashVerse === num ? 'verse-flash' : ''
              }`}
              onClick={() => onSelectVerse(num)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectVerse(num);
                }
              }}
            >
              {inner}{' '}
            </span>
          );
        }
        return (
          <span key={key} className={toneText(v.tone, v.redletter)}>
            {inner}{' '}
          </span>
        );
      })}
    </p>
  );
}

function PoetryStanza({
  lines,
  hymn,
  size,
  selectedVerse,
  onSelectVerse,
}: {
  lines: PoetryLine[];
  hymn?: boolean;
  size: Size;
  selectedVerse?: number | null;
  onSelectVerse?: (num: number | null) => void;
}) {
  const { textSize } = useContext(ReadingPrefsContext);
  const marks = useContext(MarksContext);
  const flashVerse = useContext(FlashVerseContext);
  const style =
    size === 'reading' ? { fontSize: `${textSize - 1}px` } : undefined;
  // A poetry line is tap-selectable as its verse — just like a prose verse — so
  // word selection, highlighting, and the verse toolbar work inside stanzas and
  // OT-quotation blocks. A verse spanning several lines makes each line
  // selectable for the same verse (so highlighting covers the whole verse). Tone
  // colour stays on the outer line; this span only adds the selection affordance.
  const selectableLine = (
    verse: number | undefined,
    inner: ReactNode,
  ): ReactNode => {
    if (!onSelectVerse || verse == null) {
      return inner;
    }
    const isSel = selectedVerse != null && verse === selectedVerse;
    const hl = marks.highlights[verse];
    return (
      // biome-ignore lint/a11y/useSemanticElements: must stay a span so inline footnote buttons can nest
      <span
        role="button"
        tabIndex={0}
        data-verse={verse}
        data-verse-selected={isSel ? 'true' : undefined}
        style={hl ? highlightVarStyle(hl) : undefined}
        className={`cursor-pointer rounded-[3px] ${
          hl ? 'verse-highlight' : ''
        } ${isSel ? 'verse-selected' : ''} ${
          flashVerse === verse ? 'verse-flash' : ''
        }`}
        onClick={() => onSelectVerse(verse)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelectVerse(verse);
          }
        }}
      >
        {inner}
      </span>
    );
  };
  const body = (
    <div className={`font-serif ${POETRY_LEADING[size]}`} style={style}>
      {lines.map((l, i) => {
        // `num` prints the verse badge (only where a verse starts); `verse` is the
        // effective verse — carried into continuation lines by the parser — so
        // word selection and cross-ref lookup work on every line.
        const key = `l${i}`;
        const verse = l.verse ?? l.num;
        const inner = (
          <>
            {l.num != null ? <VerseNum n={l.num} tone={l.tone} /> : null}
            <Runs runs={l.runs} verse={verse} />
          </>
        );
        if (l.tone === 'focus') {
          return (
            <div
              key={key}
              className="-ml-5 my-[6px] border-scripture-edge border-l-2 pl-[42px] text-ink [text-indent:-22px]"
            >
              {selectableLine(verse, inner)}
            </div>
          );
        }
        if (l.right) {
          return (
            <div
              key={key}
              className={`text-right italic ${toneText(l.tone, l.redletter)}`}
            >
              {selectableLine(verse, inner)}
            </div>
          );
        }
        const indentCls =
          l.indent === 1
            ? 'pl-12 [text-indent:-24px]'
            : 'pl-6 [text-indent:-24px]';
        return (
          <div
            key={key}
            className={`${indentCls} ${toneText(l.tone, l.redletter)}`}
          >
            {selectableLine(verse, inner)}
          </div>
        );
      })}
    </div>
  );
  if (hymn) {
    return (
      <div className="mb-[22px] ml-1.5 border-gold-soft/40 border-l-2 pl-4">
        {body}
      </div>
    );
  }
  return <div className="mb-[22px]">{body}</div>;
}

const CHIP_VARIANT = {
  neutral: 'text-muted border-line',
  gold: 'text-gold border-gold-soft/50',
  red: 'text-redletter border-redletter/40',
} as const;

export function Passage({
  blocks,
  size = 'reading',
  selectedVerse,
  onSelectVerse,
  selectedWord,
  onSelectWord,
  redLetter = true,
  verseNumbers = true,
  textSize = 21,
  divineName = 'lord',
  sourceOverlay = true,
  highlights,
  notedVerses,
  crossRefs,
  flashVerse = null,
}: {
  blocks: Block[];
  size?: Size;
  selectedVerse?: number | null;
  onSelectVerse?: (num: number | null) => void;
  selectedWord?: { verse: number; position: number } | null;
  onSelectWord?: (word: WordRef) => void;
  redLetter?: boolean;
  verseNumbers?: boolean;
  textSize?: number;
  divineName?: DivineName;
  sourceOverlay?: boolean;
  highlights?: Record<string, string>; // verse number → color
  notedVerses?: number[];
  crossRefs?: Record<string, CrossRef[]>; // verse number → source refs (OT quotes)
  flashVerse?: number | null; // verse to flash transiently (direct ?v= visit)
}) {
  const marks = useMemo<Marks>(
    () => ({
      highlights: highlights
        ? Object.fromEntries(
            Object.entries(highlights).map(([k, v]) => [Number(k), v]),
          )
        : {},
      noted: new Set(notedVerses ?? []),
    }),
    [highlights, notedVerses],
  );
  const wordSelection = useMemo<WordSelection | null>(
    () =>
      onSelectWord
        ? {
            selectedVerse: selectedVerse ?? null,
            selected: selectedWord ?? null,
            studyOpen: selectedWord != null,
            onSelectWord,
          }
        : null,
    [onSelectWord, selectedVerse, selectedWord],
  );
  const footnoteLabels = useMemo(() => {
    const map = new Map<Footnote, string>();
    collectFootnotes(blocks).forEach(({ note }, i) => {
      map.set(note, footnoteLabel(i));
    });
    return map;
  }, [blocks]);
  return (
    <ReadingPrefsContext.Provider
      value={{ redLetter, verseNumbers, textSize, divineName, sourceOverlay }}
    >
      <WordSelectionContext.Provider value={wordSelection}>
        <MarksContext.Provider value={marks}>
          <CrossRefsContext.Provider value={crossRefs ?? EMPTY_CROSSREFS}>
            <FlashVerseContext.Provider value={flashVerse}>
              <FootnoteLabelsContext.Provider value={footnoteLabels}>
                <div>
                  {blocks.map((b, i) => {
                    switch (b.kind) {
                      case 'heading':
                        return (
                          <h3
                            key={`k${i}`}
                            className="mt-1 mb-[14px] font-normal font-serif text-[21px] text-gold italic"
                          >
                            {b.text}
                          </h3>
                        );
                      case 'acrostic':
                        return (
                          <div
                            key={`k${i}`}
                            className="mb-[10px] flex items-center gap-3"
                          >
                            <span className="font-hebrew text-[30px] text-gold leading-none">
                              {b.letter}
                            </span>
                            <span className="font-mono text-[11px] text-faint uppercase tracking-[0.08em]">
                              {b.name}
                            </span>
                            <span className="h-px flex-1 bg-line" />
                          </div>
                        );
                      case 'chip':
                        return (
                          <div key={`k${i}`} className="mb-[14px]">
                            <span
                              className={`inline-flex items-center gap-[6px] rounded-full border bg-paper-soft px-[10px] py-[3px] font-semibold text-[11.5px] ${CHIP_VARIANT[b.variant ?? 'neutral']}`}
                            >
                              {b.dot ? (
                                <span className="size-[5px] rounded-full bg-gold" />
                              ) : null}
                              {b.text}
                            </span>
                          </div>
                        );
                      case 'crossref':
                        return (
                          <div
                            key={`k${i}`}
                            className="mb-[14px] text-[13px] text-muted-2"
                          >
                            {b.runs.map((r, j) =>
                              r.ref ? (
                                <a
                                  key={`k${j}`}
                                  href={passageHref(r.ref)}
                                  className="text-gold hover:underline"
                                >
                                  {r.text}
                                </a>
                              ) : (
                                <span key={`k${j}`}>{r.text}</span>
                              ),
                            )}
                          </div>
                        );
                      case 'descriptive':
                        return (
                          <p
                            key={`k${i}`}
                            className={`mb-[14px] font-serif italic ${size === 'reading' ? 'text-[16px]' : 'text-[14px]'} text-muted-2 leading-relaxed`}
                          >
                            {b.verses.map((v, j) => (
                              <span key={`d${j}`}>
                                {v.num != null ? (
                                  <VerseNum n={v.num} tone={v.tone} />
                                ) : null}
                                <Runs
                                  runs={v.runs}
                                  verse={v.verse ?? v.num}
                                />{' '}
                              </span>
                            ))}
                          </p>
                        );
                      case 'prose':
                        return (
                          <ProseParagraph
                            key={`k${i}`}
                            verses={b.verses}
                            size={size}
                            selectedVerse={selectedVerse}
                            onSelectVerse={onSelectVerse}
                          />
                        );
                      case 'poetry':
                        return (
                          <PoetryStanza
                            key={`k${i}`}
                            lines={b.lines}
                            hymn={b.hymn}
                            size={size}
                            selectedVerse={selectedVerse}
                            onSelectVerse={onSelectVerse}
                          />
                        );
                      case 'focusVerse': {
                        const fv = b.verse.verse ?? b.verse.num;
                        return (
                          <div
                            key={`k${i}`}
                            data-verse={fv}
                            className={`-ml-5 border-scripture-edge border-l-2 pl-[18px] ${fv != null && flashVerse === fv ? 'verse-flash' : ''}`}
                          >
                            <p
                              className={`font-serif ${size === 'reading' ? 'text-[21px]' : 'text-[19px]'} leading-[1.7] ${b.verse.redletter ? 'text-redletter' : 'text-ink'}`}
                            >
                              {b.verse.num != null ? (
                                <VerseNum n={b.verse.num} tone="focus" />
                              ) : null}
                              <Runs
                                runs={b.verse.runs}
                                verse={b.verse.verse ?? b.verse.num}
                              />
                            </p>
                          </div>
                        );
                      }
                      case 'selah':
                        return (
                          <div
                            key={`k${i}`}
                            className="mt-1 text-right font-serif text-gold italic"
                          >
                            {b.text ?? 'Selah'}
                          </div>
                        );
                      default:
                        return null;
                    }
                  })}
                </div>
              </FootnoteLabelsContext.Provider>
            </FlashVerseContext.Provider>
          </CrossRefsContext.Provider>
        </MarksContext.Provider>
      </WordSelectionContext.Provider>
    </ReadingPrefsContext.Provider>
  );
}
