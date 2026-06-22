// A small USFM-ish model for rendering scripture. The renderer (passage.tsx)
// turns these blocks into the design's typographic genres — prose, Hebrew
// poetry, hymn, OT quotation, red-letter, acrostic — and the faded-context
// treatment is just a per-verse `tone`, not a separate component. The USX
// parser (src/server/usx) produces these blocks from the BSB seed.

// A target for an inline scripture cross-reference link.
export type RefTarget = {
  book: string; // canon slug, e.g. "colossians"
  chapter: number;
  verse?: number;
  label: string; // human display, e.g. "Colossians 1:1–2"
};

// One segment of a footnote body. `italic` marks alternate-reading text (USX
// `fqa`); `ref` turns an embedded reference into a link.
export type FootnoteSegment = {
  text: string;
  italic?: boolean;
  ref?: RefTarget;
};

// A translator footnote (USX `<note style="f">`). Rendered as a superscript
// marker that opens a popover with the body.
export type Footnote = {
  origin?: string; // USX `fr`, e.g. "1:3"
  segments: FootnoteSegment[];
};

export type Run = {
  text: string;
  smallcaps?: boolean; // divine name (Lord) or OT-quotation text (styling)
  divineName?: boolean; // USX `nd` — the divine name (YHWH)
  otQuote?: boolean; // USX `qt` — Old Testament quotation
  mark?: boolean; // inline highlight on a matched phrase
  redletter?: boolean; // words of Christ (partial within a verse)
  note?: Footnote; // footnote marker; rendered after `text` (often empty text)
  strong?: string; // Strong's number for this word (one run per wordlist token)
  position?: number; // 0-based word index within the verse (for word selection)
};

// Emphasis within the faded-context reading mode.
export type Tone = 'normal' | 'faded' | 'focus';

export type ProseVerse = {
  num?: number; // verse number to print as a badge (only where a verse starts)
  verse?: number; // effective verse this segment belongs to (carried continuations)
  runs: Run[];
  redletter?: boolean; // whole verse is words of Christ
  tone?: Tone;
};

export type PoetryLine = {
  num?: number; // verse number to print as a badge (only where a verse starts)
  verse?: number; // effective verse this line belongs to (carried continuations)
  indent?: 0 | 1; // parallel cola get indent level 1
  runs: Run[];
  redletter?: boolean;
  tone?: Tone;
  right?: boolean; // right-aligned (USX `qr` — Selah/refrains)
};

// A run within a cross-reference line; `ref` makes it a link.
export type CrossRefRun = { text: string; ref?: RefTarget };

export type Block =
  | { kind: 'heading'; text: string }
  | { kind: 'acrostic'; letter: string; name: string }
  | {
      kind: 'chip';
      text: string;
      variant?: 'gold' | 'red' | 'neutral';
      dot?: boolean;
    }
  | { kind: 'crossref'; runs: CrossRefRun[] } // USX `r` — parallel passages
  | { kind: 'descriptive'; verses: ProseVerse[] } // USX `d` — Psalm superscription
  | { kind: 'prose'; verses: ProseVerse[] }
  | { kind: 'poetry'; lines: PoetryLine[]; hymn?: boolean }
  | { kind: 'focusVerse'; verse: ProseVerse }
  | { kind: 'selah'; text?: string };

export type Passage = Block[];
