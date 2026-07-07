// USX 3.x parser. Produces three layers from the enhanced BSB/MSB seed:
//   1. reading blocks (components/passage/types.ts) — the formatted reading view
//   2. word tokens — every <char style="w"> with its Strong's number + overlay
//      (divine name / OT quotation / words of Christ), addressed
//      book.chapter.verse.position (STEPBible-style) for interlinear + word study
//   3. cross-references — <note style="x"> citations (e.g. "Deut 6:16")
// Seed-time only; the DB stores the output.
//
// USX specifics: verse/chapter are milestones (start marker carries `number`,
// the `eid` end marker does not — skip it). Every word is wrapped in
// <char style="w" strong="…">, so reading runs are coalesced. <note style="f">
// is a translator footnote; <note style="x"> is a cross-reference.

import { XMLParser } from 'fast-xml-parser';

import type {
  Block,
  CrossRefRun,
  Footnote,
  FootnoteSegment,
  PoetryLine,
  ProseVerse,
  RefTarget,
  Run,
} from '../../components/passage/types';
import { findBook } from '../../lib/canon';
import { parseReference } from '../../lib/reference';

export type ParsedChapter = {
  number: number;
  blocks: Block[];
  verses: Record<string, string>; // verse number -> plain text
};

export type ParsedToken = {
  chapter: number;
  verse: number;
  position: number; // 0-based word index within the verse
  surface: string;
  strong?: string;
  divineName?: boolean;
  otQuote?: boolean;
  wordsOfJesus?: boolean;
};

export type ParsedCrossRef = {
  fromChapter: number;
  fromVerse: number;
  toBook: string; // canon slug
  toChapter: number;
  toVerse?: number;
};

export type ParsedBook = {
  code: string;
  chapters: Record<string, ParsedChapter>;
  tokens: ParsedToken[];
  crossRefs: ParsedCrossRef[];
};

// Book front matter we don't render in the body.
const FRONT = new Set([
  'h',
  'toc1',
  'toc2',
  'toc3',
  'mt1',
  'mt2',
  'mt3',
  'mte',
  'cl',
  'cp',
  'rem',
  'ide',
  'sts',
]);

const ATTR_PREFIX = '@_';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: ATTR_PREFIX,
  preserveOrder: true,
  trimValues: false,
  processEntities: true,
});

type Attrs = Record<string, string>;
type XmlNode = Record<string, unknown>;

function tagOf(node: XmlNode): string | undefined {
  return Object.keys(node).find((k) => k !== ':@' && k !== '#text');
}
function childrenOf(node: XmlNode, tag: string): XmlNode[] {
  return (node[tag] as XmlNode[] | undefined) ?? [];
}
function attrOf(node: XmlNode, name: string): string | undefined {
  return (node[':@'] as Attrs | undefined)?.[ATTR_PREFIX + name];
}
function isText(node: XmlNode): boolean {
  return Object.hasOwn(node, '#text');
}
function textValue(node: XmlNode): string {
  const t = node['#text'];
  return typeof t === 'string' ? t : String(t ?? '');
}

// The enhanced USX zero-pads Strong's numbers (G02316); normalize to the
// conventional unpadded form (G2316) so they match lexicons / STEPBible dStrong.
function normalizeStrong(strong: string | undefined): string | undefined {
  if (!strong) {
    return undefined;
  }
  return strong.replace(/^([GH])0+(\d)/, '$1$2');
}

// Does any descendant <char> carry this style? (e.g. an `nd` nested inside a `w`)
function containsCharStyle(nodes: XmlNode[], style: string): boolean {
  for (const node of nodes) {
    if (tagOf(node) === 'char') {
      if (attrOf(node, 'style') === style) {
        return true;
      }
      if (containsCharStyle(childrenOf(node, 'char'), style)) {
        return true;
      }
    }
  }
  return false;
}

// Parse a USX `loc` ("COL 1:1-2", "PHM 1-3", "LUK 24:36-49") into a link target.
function parseLoc(loc: string, label: string): RefTarget | undefined {
  const m = loc.trim().match(/^(\S+)\s+(.+)$/);
  if (!m) {
    return undefined;
  }
  const book = findBook(m[1]);
  if (!book) {
    return undefined;
  }
  const rest = m[2];
  let chapter: number;
  let verse: number | undefined;
  if (rest.includes(':')) {
    chapter = Number.parseInt(rest, 10);
    verse = Number.parseInt(rest.split(':')[1] ?? '', 10);
  } else if (book.chapterCount === 1) {
    chapter = 1;
    verse = Number.parseInt(rest, 10);
  } else {
    chapter = Number.parseInt(rest, 10);
  }
  if (Number.isNaN(chapter)) {
    return undefined;
  }
  return {
    book: book.slug,
    chapter,
    verse: Number.isNaN(verse) ? undefined : verse,
    label,
  };
}

type InlineFlags = {
  redletter?: boolean;
  nd?: boolean;
  qt?: boolean;
  strong?: string; // Strong's of the enclosing wordlist token
};
type TokenEvent = {
  t: 'token';
  surface: string;
  strong?: string;
  nd?: boolean;
  qt?: boolean;
  wj?: boolean;
};
type InlineEvent =
  | ({ t: 'text'; text: string } & InlineFlags)
  | { t: 'verse'; num: number }
  | { t: 'note'; note: Footnote }
  | { t: 'ref'; text: string; ref?: RefTarget }
  | { t: 'xref'; refs: RefTarget[] }
  | TokenEvent;

function textOf(nodes: XmlNode[]): string {
  let out = '';
  for (const ev of flattenInline(nodes, {})) {
    if (ev.t === 'text' || ev.t === 'ref') {
      out += ev.text;
    }
  }
  return out;
}

function parseNote(node: XmlNode): Footnote {
  const segments: FootnoteSegment[] = [];
  let origin: string | undefined;
  for (const child of childrenOf(node, 'note')) {
    if (isText(child)) {
      const text = textValue(child);
      if (text.trim()) {
        segments.push({ text });
      }
      continue;
    }
    if (tagOf(child) !== 'char') {
      continue;
    }
    const style = attrOf(child, 'style');
    const inner = childrenOf(child, 'char');
    if (style === 'fr') {
      origin = textOf(inner).trim();
      continue;
    }
    for (const ev of flattenInline(inner, {})) {
      if (ev.t === 'text') {
        segments.push({ text: ev.text, italic: style === 'fqa' });
      } else if (ev.t === 'ref') {
        segments.push({ text: ev.text, ref: ev.ref });
      }
    }
  }
  return { origin, segments };
}

// A cross-reference note (<note style="x">): the xt text holds human refs like
// "Deut 6:16; Matt 4:7" — split and resolve each against the canon.
function parseXref(node: XmlNode): RefTarget[] {
  let text = '';
  for (const child of childrenOf(node, 'note')) {
    if (isText(child)) {
      text += textValue(child);
    } else if (tagOf(child) === 'char') {
      text += textOf(childrenOf(child, 'char'));
    }
  }
  const refs: RefTarget[] = [];
  for (const part of text.split(/[;]/)) {
    const trimmed = part.trim();
    const parsed = parseReference(trimmed);
    if (parsed) {
      refs.push({ ...parsed, label: trimmed });
    }
  }
  return refs;
}

function flattenInline(nodes: XmlNode[], flags: InlineFlags): InlineEvent[] {
  const out: InlineEvent[] = [];
  for (const node of nodes) {
    if (isText(node)) {
      out.push({ t: 'text', text: textValue(node), ...flags });
      continue;
    }
    const tag = tagOf(node);
    if (tag === 'verse') {
      const num = attrOf(node, 'number');
      if (num) {
        out.push({ t: 'verse', num: Number(num) });
      }
    } else if (tag === 'char') {
      const style = attrOf(node, 'style');
      const kids = childrenOf(node, 'char');
      const next: InlineFlags = { ...flags };
      if (style === 'wj') {
        next.redletter = true;
      }
      if (style === 'nd') {
        next.nd = true;
      }
      if (style === 'qt') {
        next.qt = true;
      }
      // A wordlist span is one token (surface + Strong's). Tag its text runs
      // with the Strong's (so each word is clickable) and emit the token for
      // the tokens table.
      if (style === 'w') {
        const strong = normalizeStrong(attrOf(node, 'strong'));
        next.strong = strong;
        out.push({
          t: 'token',
          surface: textOf(kids),
          strong,
          nd: flags.nd || containsCharStyle(kids, 'nd'),
          qt: flags.qt || containsCharStyle(kids, 'qt'),
          wj: flags.redletter,
        });
      }
      out.push(...flattenInline(kids, next));
    } else if (tag === 'note') {
      const style = attrOf(node, 'style');
      if (style === 'f') {
        out.push({ t: 'note', note: parseNote(node) });
      } else if (style === 'x') {
        out.push({ t: 'xref', refs: parseXref(node) });
      }
    } else if (tag === 'ref') {
      const text = textOf(childrenOf(node, 'ref'));
      out.push({
        t: 'ref',
        text,
        ref: parseLoc(attrOf(node, 'loc') ?? '', text),
      });
    } else if (tag) {
      out.push(...flattenInline(childrenOf(node, tag), flags));
    }
  }
  return out;
}

type Ctx = {
  setVerse: (n: number) => void;
  addText: (t: string) => void;
  boundary: () => void;
  addToken: (ev: TokenEvent) => void;
  addXref: (refs: RefTarget[]) => void;
  // Position of the most recently emitted token, so a word's text run can carry
  // its 0-based verse word index (for word selection). -1 before the first word.
  wordPos: () => number;
  // The verse currently in effect (carried across block boundaries) so a block
  // that continues a verse from a previous block can still attribute its runs.
  currentVerse: () => number | null;
};

function runFromText(ev: InlineEvent & { t: 'text' }): Run {
  // `nd` (divine name → YHWH) and `qt` (OT quotation) both render in small caps,
  // but carry distinct source-text meaning for the overlay/study panel, so keep
  // them as separate flags.
  return {
    text: ev.text,
    ...(ev.redletter ? { redletter: true } : {}),
    ...(ev.nd ? { divineName: true } : {}),
    ...(ev.qt ? { otQuote: true } : {}),
    ...(ev.nd || ev.qt ? { smallcaps: true } : {}),
    ...(ev.strong ? { strong: ev.strong } : {}),
  };
}

// Merge adjacent plain-text runs with identical styling. The enhanced USX wraps
// every word in <char style="w">, so without this the output is one run/word.
function coalesceRuns(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const r of runs) {
    const prev = out[out.length - 1];
    if (
      prev &&
      !prev.note &&
      !r.note &&
      prev.strong === r.strong &&
      prev.position === r.position &&
      !!prev.redletter === !!r.redletter &&
      !!prev.smallcaps === !!r.smallcaps &&
      !!prev.divineName === !!r.divineName &&
      !!prev.otQuote === !!r.otQuote &&
      !!prev.mark === !!r.mark
    ) {
      prev.text += r.text;
    } else {
      out.push({ ...r });
    }
  }
  return out;
}

// Forward the non-text events (tokens, cross-refs) that carry verse context.
function sideEffects(ev: InlineEvent, ctx: Ctx): void {
  if (ev.t === 'token') {
    ctx.addToken(ev);
  } else if (ev.t === 'xref') {
    ctx.addXref(ev.refs);
  }
}

function buildVerses(events: InlineEvent[], ctx: Ctx): ProseVerse[] {
  ctx.boundary();
  const verses: ProseVerse[] = [];
  // A block can begin mid-verse (e.g. a quotation block after the verse marker);
  // carry the current verse so its runs are still attributed to it. The carried
  // segment gets `verse` (for selection/lookup) but no `num`, so it doesn't
  // print a duplicate verse-number badge — only a real verse marker sets `num`.
  const carried = ctx.currentVerse();
  let cur: ProseVerse =
    carried != null ? { verse: carried, runs: [] } : { runs: [] };
  const flush = () => {
    const meaningful = cur.runs.some(
      (r) => r.note || (r.text && r.text.trim() !== ''),
    );
    if (meaningful) {
      cur.runs = coalesceRuns(cur.runs);
      verses.push(cur);
    }
  };
  for (const ev of events) {
    if (ev.t === 'verse') {
      flush();
      ctx.setVerse(ev.num);
      cur = { num: ev.num, verse: ev.num, runs: [] };
    } else if (ev.t === 'text') {
      const run = runFromText(ev);
      if (ev.strong) {
        run.position = ctx.wordPos();
      }
      cur.runs.push(run);
      ctx.addText(ev.text);
    } else if (ev.t === 'note') {
      cur.runs.push({ text: '', note: ev.note });
    } else if (ev.t === 'ref') {
      cur.runs.push({ text: ev.text });
      ctx.addText(ev.text);
    } else {
      sideEffects(ev, ctx);
    }
  }
  flush();
  return verses;
}

function buildLine(
  events: InlineEvent[],
  indent: 0 | 1,
  right: boolean,
  ctx: Ctx,
): PoetryLine {
  ctx.boundary();
  const runs: Run[] = [];
  // `num` is the verse-number badge — printed only where a verse *starts* on this
  // line. `verse` is the effective verse the line belongs to, carried across
  // block boundaries (e.g. a poetry stanza continuing a verse, or an
  // OT-quotation stanza) so word/verse selection and cross-ref lookup still work
  // on continuation lines without printing a duplicate number.
  let num: number | undefined;
  let verse: number | undefined = ctx.currentVerse() ?? undefined;
  for (const ev of events) {
    if (ev.t === 'verse') {
      ctx.setVerse(ev.num);
      verse = ev.num;
      // A verse marker before any meaningful text starts this line's verse, so it
      // gets the badge. Leading whitespace runs (the indentation between <para>
      // and <verse>) don't count as text having started, so an OT-quotation
      // stanza like Matthew 1:23 (`<para q1> <verse 23> "Behold…`) prints the 23.
      if (runs.every((r) => !r.text || r.text.trim() === '')) {
        num = ev.num;
      }
    } else if (ev.t === 'text') {
      const run = runFromText(ev);
      if (ev.strong) {
        run.position = ctx.wordPos();
      }
      runs.push(run);
      ctx.addText(ev.text);
    } else if (ev.t === 'note') {
      runs.push({ text: '', note: ev.note });
    } else if (ev.t === 'ref') {
      runs.push({ text: ev.text });
      ctx.addText(ev.text);
    } else {
      sideEffects(ev, ctx);
    }
  }
  return {
    num,
    ...(verse != null ? { verse } : {}),
    indent,
    runs: coalesceRuns(runs),
    ...(right ? { right: true } : {}),
  };
}

function buildCrossref(events: InlineEvent[]): CrossRefRun[] {
  const runs: CrossRefRun[] = [];
  for (const ev of events) {
    if (ev.t === 'text') {
      runs.push({ text: ev.text });
    } else if (ev.t === 'ref') {
      runs.push({ text: ev.text, ref: ev.ref });
    }
  }
  return runs;
}

export function parseUsxBook(input: string): ParsedBook {
  // Normalize to Unix line endings so no CRLF/CR leaks into the stored text.
  const xml = input.replace(/\r\n?/g, '\n');
  const root = parser.parse(xml) as XmlNode[];
  const usxNode = root.find((n) => tagOf(n) === 'usx');
  const nodes = usxNode ? childrenOf(usxNode, 'usx') : [];

  let code = '';
  const chapters: Record<string, ParsedChapter> = {};
  const tokens: ParsedToken[] = [];
  const crossRefs: ParsedCrossRef[] = [];
  let chap: ParsedChapter | undefined;
  let currentVerse: number | null = null;
  let position = 0;
  let lastWordPos = -1;
  const ctx: Ctx = {
    setVerse: (n) => {
      currentVerse = n;
      position = 0;
      lastWordPos = -1;
    },
    wordPos: () => lastWordPos,
    currentVerse: () => currentVerse,
    addText: (t) => {
      if (chap && currentVerse != null) {
        const key = String(currentVerse);
        chap.verses[key] = (chap.verses[key] ?? '') + t;
      }
    },
    boundary: () => {
      // Separate text joined across paragraph/poetry-line breaks with a space.
      if (chap && currentVerse != null) {
        const key = String(currentVerse);
        if (chap.verses[key]) {
          chap.verses[key] += ' ';
        }
      }
    },
    addToken: (ev) => {
      if (!chap || currentVerse == null || !ev.surface.trim()) {
        return;
      }
      lastWordPos = position;
      tokens.push({
        chapter: chap.number,
        verse: currentVerse,
        position: position++,
        surface: ev.surface.replace(/\s+/g, ' ').trim(),
        ...(ev.strong ? { strong: ev.strong } : {}),
        ...(ev.nd ? { divineName: true } : {}),
        ...(ev.qt ? { otQuote: true } : {}),
        ...(ev.wj ? { wordsOfJesus: true } : {}),
      });
    },
    addXref: (refs) => {
      if (!chap || currentVerse == null) {
        return;
      }
      for (const ref of refs) {
        crossRefs.push({
          fromChapter: chap.number,
          fromVerse: currentVerse,
          toBook: ref.book,
          toChapter: ref.chapter,
          ...(ref.verse != null ? { toVerse: ref.verse } : {}),
        });
      }
    },
  };

  // Buffered blocks that accumulate across consecutive paragraphs.
  let poetry: PoetryLine[] | null = null;
  let acrosticLetter: string | null = null;
  const flushPoetry = () => {
    if (poetry?.length && chap) {
      chap.blocks.push({ kind: 'poetry', lines: poetry });
    }
    poetry = null;
  };
  const flushAcrostic = () => {
    if (acrosticLetter != null && chap) {
      chap.blocks.push({ kind: 'acrostic', letter: acrosticLetter, name: '' });
    }
    acrosticLetter = null;
  };
  const pushBlock = (block: Block) => {
    flushPoetry();
    flushAcrostic();
    chap?.blocks.push(block);
  };

  for (const node of nodes) {
    const tag = tagOf(node);
    if (tag === 'book') {
      code = attrOf(node, 'code') ?? '';
      continue;
    }
    if (tag === 'chapter') {
      // Skip chapter end milestones (eid only, no number).
      const number = attrOf(node, 'number');
      if (!number) {
        continue;
      }
      flushPoetry();
      flushAcrostic();
      chap = { number: Number(number), blocks: [], verses: {} };
      chapters[number] = chap;
      currentVerse = null;
      continue;
    }
    if (tag !== 'para' || !chap) {
      continue;
    }
    const style = attrOf(node, 'style') ?? 'p';
    if (FRONT.has(style)) {
      continue;
    }
    const kids = childrenOf(node, 'para');

    if (style === 'b') {
      flushPoetry(); // blank line = stanza break
      continue;
    }
    if (style === 'q1' || style === 'q2' || style === 'qr') {
      flushAcrostic();
      if (!poetry) {
        poetry = [];
      }
      poetry.push(
        buildLine(
          flattenInline(kids, {}),
          style === 'q2' ? 1 : 0,
          style === 'qr',
          ctx,
        ),
      );
      continue;
    }
    if (style === 'qa') {
      flushPoetry();
      const text = textOf(kids).trim();
      // The Hebrew letter line is non-ASCII; the transliteration ("ALEPH") is ASCII.
      const isHebrew = [...text].some((c) => c.charCodeAt(0) > 0x7f);
      if (isHebrew) {
        flushAcrostic();
        acrosticLetter = text;
      } else if (acrosticLetter != null) {
        chap.blocks.push({
          kind: 'acrostic',
          letter: acrosticLetter,
          name: text,
        });
        acrosticLetter = null;
      } else {
        chap.blocks.push({ kind: 'acrostic', letter: '', name: text });
      }
      continue;
    }
    if (
      style === 's1' ||
      style === 's2' ||
      style === 's3' ||
      style === 'ms' ||
      style === 'ms1' ||
      style === 'mr' ||
      style === 'sp'
    ) {
      pushBlock({ kind: 'heading', text: textOf(kids).trim() });
      continue;
    }
    if (style === 'r') {
      pushBlock({
        kind: 'crossref',
        runs: buildCrossref(flattenInline(kids, {})),
      });
      continue;
    }
    if (style === 'd') {
      pushBlock({
        kind: 'descriptive',
        verses: buildVerses(flattenInline(kids, {}), ctx),
      });
      continue;
    }
    // p, m, pmo, pc, pi, nb, li1, li2, and anything else → prose paragraph.
    const verses = buildVerses(flattenInline(kids, {}), ctx);
    if (verses.length) {
      pushBlock({ kind: 'prose', verses });
    }
  }
  flushPoetry();
  flushAcrostic();

  for (const c of Object.values(chapters)) {
    for (const key of Object.keys(c.verses)) {
      c.verses[key] = c.verses[key].replace(/\s+/g, ' ').trim();
    }
  }

  return { code, chapters, tokens, crossRefs };
}
