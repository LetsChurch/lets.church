// HOST-only build step: convert the eBible.org World English Bible (WEB) USFM into
// the USX 3.0 our `parseUsxBook` consumes, writing one file per canon book to
// `seed/web/USX_1/<CODE>.usx` (committed, like the BSB/MSB seed).
//
// Why convert: eBible ships WEB as USFM only (no per-book USX), and its `\w …|
// strong="…"` tags are badly misaligned (Gen 1:1 "earth" → H8064 *heavens*; John
// 3:16 "loved" untagged) — unusable for word study. So we STRIP Strong's to bare
// words (WEB gets reading + search + compare + footnotes + red-letter + the
// original-language interlinear from STEPBible, but no English word-study). We
// keep `\wj` (red-letter) and `\f` (translator footnotes), and DROP `\x` inline
// cross-refs because cross-references are projected from MSB (seed-cross-references).
//
// Run: `just lets-bible-build-web-usx` (downloads the zip + converts). Input dir
// override: WEB_USFM_DIR=/abs/path/to/usfm (one *.usfm per book, eBible naming).

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CANON } from '../../src/lib/canon';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, '..', '..');
const usfmDir = process.env.WEB_USFM_DIR ?? join(pkgRoot, 'seed', '.web-usfm');
const outDir = join(pkgRoot, 'seed', 'web', 'USX_1');

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s: string): string {
  return escapeXml(s).replace(/"/g, '&quot;');
}

// A USFM token stream: markers ("\w", "\w*", "\+w", "\f*", …) and plain text.
type Tok = { kind: 'open' | 'close' | 'text'; v: string };

function tokenize(usfm: string): Tok[] {
  const toks: Tok[] = [];
  // Marker = backslash, optional nested "+", marker letters/digits, optional "*"
  // close. Everything else is text.
  const re = /\\(\+?[a-z][a-z0-9]*)(\*)?/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex scan
  while ((m = re.exec(usfm)) !== null) {
    if (m.index > last) {
      toks.push({ kind: 'text', v: usfm.slice(last, m.index) });
    }
    const name = m[1].replace(/^\+/, ''); // nested markers behave like their base
    toks.push({ kind: m[2] ? 'close' : 'open', v: name });
    last = re.lastIndex;
  }
  if (last < usfm.length) {
    toks.push({ kind: 'text', v: usfm.slice(last) });
  }
  return toks;
}

// Character-style markers with an explicit `\x*` close that we care about inline.
const INLINE_WORD = new Set(['w', 'wh', 'wg', 'wa']); // wordlist → strip to surface
const NOTE_SUB = new Set(['fr', 'ft', 'fk', 'fq', 'fqa', 'fl', 'fv', 'fp']);

// Strip a `\w surface|lemma="…" strong="…"\w*` payload to its surface text. Drop
// the leading marker-convention space (`\w_For`) so words separate by exactly the
// one inter-marker space — words with no inter-space (e.g. `hasn’\w t\w*`) stay
// joined ("hasn’t").
function wordSurface(text: string): string {
  const bar = text.indexOf('|');
  const surface = bar === -1 ? text : text.slice(0, bar);
  return surface.replace(/^[ \t]+/, '');
}

// Raw (unescaped) concatenated text between an open marker and its close — used to
// recover a wordlist surface before stripping its `|attrs`.
function rawText(toks: Tok[], start: number, stop: string): string {
  let s = '';
  for (let i = start; i < toks.length; i++) {
    const t = toks[i];
    if (t.kind === 'close' && t.v === stop) break;
    if (t.kind === 'text') s += t.v;
  }
  return s;
}

function skipTo(toks: Tok[], start: number, stop: string): number {
  for (let i = start; i < toks.length; i++) {
    if (toks[i].kind === 'close' && toks[i].v === stop) return i + 1;
  }
  return toks.length;
}

// A footnote: `\f + \fr 1:5 \ft text… \f*` → <note style="f" caller="+">…</note>.
// Sub-markers (\fr/\ft/…) each become a <char style="…"> spanning until the next
// sub-marker or the note close. The leading caller ("+") is dropped.
function renderNote(toks: Tok[], start: number): { xml: string; next: number } {
  let inner = '';
  let i = start;
  let caller = '+';
  // Caller: first text token before any sub-marker.
  if (toks[i]?.kind === 'text') {
    const c = toks[i].v.trim();
    if (c) caller = c.split(/\s+/)[0];
    i++;
  }
  let curStyle: string | null = null;
  let curText = '';
  const flush = () => {
    if (curStyle) {
      const stripped = stripWords(curText).trim();
      if (stripped) {
        inner += `<char style="${curStyle}">${escapeXml(stripped)}</char>`;
      }
    }
    curText = '';
  };
  while (i < toks.length) {
    const t = toks[i];
    if (t.kind === 'close' && t.v === 'f') {
      flush();
      i++;
      break;
    }
    if (t.kind === 'open' && NOTE_SUB.has(t.v)) {
      flush();
      curStyle = t.v === 'fq' ? 'fqa' : t.v;
      i++;
      continue;
    }
    if (t.kind === 'text') {
      curText += t.v;
      i++;
      continue;
    }
    // Nested word markers inside footnote text (e.g. \+wh Hebrew \+wh*): keep raw.
    if (t.kind === 'open' && INLINE_WORD.has(t.v)) {
      curText += rawText(toks, i + 1, t.v);
      i = skipTo(toks, i + 1, t.v);
      continue;
    }
    // Any other inline marker inside a note: skip its wrapper, keep text.
    if (t.kind === 'open') {
      curText += rawText(toks, i + 1, t.v);
      i = skipTo(toks, i + 1, t.v);
      continue;
    }
    i++; // stray close
  }
  return {
    xml: `<note style="f" caller="${escapeAttr(caller)}">${inner}</note>`,
    next: i,
  };
}

// Strip `\w …|attrs\w*` and `\+wh …\+wh*` payloads to surface text inside a string.
function stripWords(s: string): string {
  return s
    .replace(/\\\+?w[a-z]?\s+([^\\]*?)\\\+?w[a-z]?\*/gi, (_m, inner) =>
      wordSurface(inner),
    )
    .replace(/\\\+?[a-z][a-z0-9]*\*?/gi, '')
    .replace(/\|[^\\]*$/g, '');
}

// Paragraph-style mapping: which USFM para markers map to which USX style (the
// styles parseUsxBook special-cases — poetry q1/q2/qr/qa, headings, descriptive —
// must be exact; everything else falls through to a prose paragraph).
function paraStyle(marker: string): string | null {
  switch (marker) {
    case 'q':
    case 'q1':
    case 'qm':
    case 'qm1':
      return 'q1';
    case 'q2':
    case 'q3':
    case 'qm2':
    case 'qm3':
      return 'q2';
    case 'qr':
      return 'qr';
    case 'qa':
      return 'qa';
    case 's':
    case 's1':
      return 's1';
    case 's2':
      return 's2';
    case 's3':
      return 's3';
    case 'ms':
    case 'ms1':
      return 'ms';
    case 'mr':
      return 'mr';
    case 'sp':
      return 'sp';
    case 'r':
      return 'r';
    case 'd':
      return 'd';
    // Prose variants — parser treats any non-special style as prose.
    case 'p':
    case 'm':
    case 'mi':
    case 'pi':
    case 'pi1':
    case 'pi2':
    case 'pc':
    case 'pr':
    case 'pmo':
    case 'nb':
    case 'li1':
    case 'li2':
    case 'li':
    case 'cls':
      return 'p';
    default:
      return null; // front matter / intro / unsupported → skip
  }
}

const SKIP_LINE = new Set([
  'id',
  'ide',
  'h',
  'toc1',
  'toc2',
  'toc3',
  'mt',
  'mt1',
  'mt2',
  'mt3',
  'mte',
  'cl',
  'cp',
  'rem',
  'sts',
  'usfm',
  'is',
  'is1',
  'is2',
  'ip',
  'ipi',
  'im',
  'ili',
  'ili1',
  'ili2',
  'iot',
  'io1',
  'io2',
  'imt',
  'imt1',
]);

function convert(usfm: string, code: string): string {
  const toks = tokenize(usfm);
  const lines: string[] = ['<?xml version="1.0" encoding="utf-8"?>'];
  lines.push('<usx version="3.0">');
  lines.push(`  <book code="${code}" style="id">World English Bible</book>`);

  const chapter = { n: 0 };
  let i = 0;
  // Walk token stream; paragraph markers open a <para>…</para> whose inline
  // content is rendered until the next paragraph/chapter marker.
  while (i < toks.length) {
    const t = toks[i];
    if (t.kind !== 'open') {
      i++;
      continue;
    }
    if (t.v === 'c') {
      // Chapter number = leading integer of following text.
      const after = toks[i + 1];
      let num = '';
      if (after?.kind === 'text') {
        const mm = after.v.match(/\s*(\d+)/);
        if (mm) num = mm[1];
        i += 2;
      } else {
        i += 1;
      }
      chapter.n = Number(num);
      lines.push(
        `  <chapter number="${escapeAttr(num)}" style="c" sid="${code} ${num}" />`,
      );
      continue;
    }
    if (t.v === 'b') {
      lines.push('  <para style="b" />');
      i++;
      continue;
    }
    const style = paraStyle(t.v);
    if (style == null) {
      if (SKIP_LINE.has(t.v)) {
        // Skip the marker and its (single-line) text payload.
        i++;
        if (toks[i]?.kind === 'text') i++;
        continue;
      }
      // Unknown paragraph marker: skip the marker, keep walking.
      i++;
      continue;
    }
    const { xml, next } = renderUntilBlock(toks, i + 1, code, chapter);
    i = next;
    const trimmed = xml.trim();
    if (trimmed) {
      lines.push(`  <para style="${style}">${trimmed}</para>`);
    } else {
      lines.push(`  <para style="${style}" />`);
    }
  }
  lines.push('</usx>');
  return `${lines.join('\n')}\n`;
}

// Render inline content until the next block-level marker (paragraph, chapter, or
// blank) — those terminate the current paragraph.
function renderUntilBlock(
  toks: Tok[],
  start: number,
  code: string,
  chapter: { n: number },
): { xml: string; next: number } {
  let xml = '';
  let i = start;
  while (i < toks.length) {
    const t = toks[i];
    if (t.kind === 'open') {
      if (t.v === 'c' || t.v === 'b') break;
      if (paraStyle(t.v) != null || SKIP_LINE.has(t.v)) break;
    }
    // Render one inline element (handles \v, \w, \wj, \f, footnotes).
    const step = renderOne(toks, i, code, chapter);
    xml += step.xml;
    i = step.next;
  }
  return { xml, next: i };
}

// Render exactly one inline element starting at `i`.
function renderOne(
  toks: Tok[],
  i: number,
  code: string,
  chapter: { n: number },
): { xml: string; next: number } {
  const t = toks[i];
  if (t.kind === 'text') {
    return { xml: escapeXml(t.v), next: i + 1 };
  }
  if (t.kind === 'close') {
    return { xml: '', next: i + 1 };
  }
  const name = t.v;
  if (name === 'v') {
    const after = toks[i + 1];
    let rest = '';
    let num = '';
    if (after?.kind === 'text') {
      const mm = after.v.match(/^\s*(\d+[a-z]?)\s?/);
      if (mm) {
        num = mm[1].replace(/[a-z]$/, '');
        rest = after.v.slice(mm[0].length);
      } else {
        rest = after.v;
      }
      return {
        xml:
          `<verse number="${escapeAttr(num)}" style="v" sid="${code} ${chapter.n}:${num}" />` +
          escapeXml(rest),
        next: i + 2,
      };
    }
    return {
      xml: `<verse number="" style="v" sid="${code} ${chapter.n}:" />`,
      next: i + 1,
    };
  }
  if (INLINE_WORD.has(name)) {
    const surface = wordSurface(rawText(toks, i + 1, name));
    return { xml: escapeXml(surface), next: skipTo(toks, i + 1, name) };
  }
  if (name === 'wj' || name === 'nd' || name === 'qt') {
    const inner = renderSpan(toks, i + 1, name, code, chapter);
    return {
      xml: `<char style="${name}">${inner.xml}</char>`,
      next: inner.next,
    };
  }
  if (name === 'add' || name === 'it' || name === 'em' || name === 'bk') {
    const inner = renderSpan(toks, i + 1, name, code, chapter);
    return { xml: inner.xml, next: inner.next };
  }
  if (name === 'f') {
    return renderNote(toks, i + 1);
  }
  if (name === 'x') {
    return { xml: '', next: skipTo(toks, i + 1, 'x') };
  }
  // Unknown inline marker with a close: keep text, drop wrapper.
  const inner = renderSpan(toks, i + 1, name, code, chapter);
  return { xml: inner.xml, next: inner.next };
}

// Render a character span's content until its close marker.
function renderSpan(
  toks: Tok[],
  start: number,
  stop: string,
  code: string,
  chapter: { n: number },
): { xml: string; next: number } {
  let xml = '';
  let i = start;
  while (i < toks.length) {
    const t = toks[i];
    if (t.kind === 'close' && t.v === stop) {
      return { xml, next: i + 1 };
    }
    // A block marker terminates an unclosed span defensively.
    if (t.kind === 'open' && (t.v === 'c' || paraStyle(t.v) != null)) {
      return { xml, next: i };
    }
    const step = renderOne(toks, i, code, chapter);
    xml += step.xml;
    i = step.next;
  }
  return { xml, next: i };
}

function main() {
  if (!existsSync(usfmDir)) {
    throw new Error(
      `WEB USFM dir not found: ${usfmDir}. Run the download step first (just lets-bible-build-web-usx) or set WEB_USFM_DIR.`,
    );
  }
  // Map USFM book code → file by reading each file's \id line.
  const files = readdirSync(usfmDir).filter((f) => f.endsWith('.usfm'));
  const byCode = new Map<string, string>();
  for (const f of files) {
    const head = readFileSync(join(usfmDir, f), 'utf8').slice(0, 200);
    const m = head.match(/\\id\s+([A-Z0-9]{3})/);
    if (m) byCode.set(m[1], f);
  }

  mkdirSync(outDir, { recursive: true });
  let ok = 0;
  const missing: string[] = [];
  for (const book of CANON) {
    const file = byCode.get(book.code);
    if (!file) {
      missing.push(book.code);
      continue;
    }
    const usfm = readFileSync(join(usfmDir, file), 'utf8').replace(
      /\r\n?/g,
      '\n',
    );
    const usx = convert(usfm, book.code);
    writeFileSync(join(outDir, `${book.code}.usx`), usx);
    ok++;
  }
  console.log(`Wrote ${ok} WEB USX files → ${outDir}`);
  if (missing.length) {
    throw new Error(`Missing USFM for: ${missing.join(', ')}`);
  }
  process.exit(0);
}

main();
