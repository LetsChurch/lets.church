// Score Scripture-reference detection against the hand-labeled gold set.
//
// The corpus directory holds, per upload id: `source-<id>.json` (the public
// `media.getTranscriptParagraphs` payload, whose BIBLE annotations are the
// production LLM's), `meta-<id>.json` (title/description), and `gold-<id>.json`
// (every Scripture mention, typed explicit/implied/quote/allusion). No LLM
// calls: the stored annotations stand in for the LLM layer, so this compares
//   llm       — what production stores today
//   explicit / implied / quote — one deterministic layer alone
//   layers    — the deterministic layers together (no LLM)
//   pipeline  — everything merged, as the annotate activity now writes it
//
// Run: just eval-scripture-refs [corpus-dir]

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import type {
  EvalParagraph,
  ResolvedAnnotation,
} from '@letschurch/temporal/activities/background/annotate-transcript';
import {
  augmentBibleAnnotations,
  compatible,
  validateBibleRef,
  type BibleRef,
  type ScriptureLayer,
} from '@letschurch/temporal/util/scripture';

const DEFAULT_CORPUS = '/seed-data/eval/scripture-refs-20261027';
// A gold mention counts as found when an annotation covers at least half of
// the shorter of the two spans: "Romans 8:28" vs "Romans 8:28, all things…".
const MIN_OVERLAP = 0.5;
const SYSTEMS = [
  'llm',
  'explicit',
  'implied',
  'quote',
  'layers',
  'pipeline',
] as const;
type System = (typeof SYSTEMS)[number];

type GoldCase = {
  paragraphOrder: number;
  text: string;
  ref: Record<string, unknown>;
  type: string;
  note?: string;
};
type SourceParagraph = {
  order: number;
  text: string;
  annotations?: Array<{
    kind: ResolvedAnnotation['kind'];
    startWord: number | null;
    endWord: number | null;
    metadata: Record<string, unknown>;
  }>;
};
type Span = { paragraph: number; start: number; end: number; ref: BibleRef };

function wordIndexAt(text: string, char: number): number {
  return (
    text.slice(0, char).split(/\s+/).filter(Boolean).length -
    (char > 0 && !/\s/.test(text[char - 1] ?? ' ') ? 1 : 0)
  );
}

/** Gold cases → word spans, taking the n-th occurrence for repeated text. */
function goldSpans(
  paragraphs: Map<number, string>,
  cases: GoldCase[],
): Array<Span & { gold: GoldCase }> {
  const used = new Map<string, number>();
  const out: Array<Span & { gold: GoldCase }> = [];
  for (const gold of cases) {
    const text = paragraphs.get(gold.paragraphOrder);
    const ref = validateBibleRef(gold.ref);
    if (!text || !ref) {
      console.warn(`Skipping unusable gold case: ${JSON.stringify(gold)}`);
      continue;
    }
    const key = `${gold.paragraphOrder}\u0000${gold.text}`;
    const nth = used.get(key) ?? 0;
    used.set(key, nth + 1);
    let at = -1;
    for (let k = 0; k <= nth; k++) {
      at = text.indexOf(gold.text, at + 1);
      // Fewer occurrences than cases with this text: don't double-count one.
      if (at === -1) break;
    }
    if (at === -1) {
      console.warn(`Gold text not in paragraph: ${JSON.stringify(gold)}`);
      continue;
    }
    const start = wordIndexAt(text, at);
    const end = wordIndexAt(text, at + gold.text.length - 1) + 1;
    out.push({ paragraph: gold.paragraphOrder, start, end, ref, gold });
  }
  return out;
}

function overlaps(a: Span, b: Span): boolean {
  if (a.paragraph !== b.paragraph) return false;
  const shared = Math.min(a.end, b.end) - Math.max(a.start, b.start);
  return (
    shared > 0 &&
    shared / Math.min(a.end - a.start, b.end - b.start) >= MIN_OVERLAP
  );
}

/** The gold reference at the gold's own precision. */
function exact(gold: BibleRef, found: BibleRef): boolean {
  return (
    gold.book === found.book &&
    gold.chapter === found.chapter &&
    gold.verse === found.verse
  );
}

type Tally = { gold: number; found: number; exact: number };
type Score = {
  byType: Record<string, Tally>;
  annotations: number;
  correct: number;
  misses: Array<Record<string, unknown>>;
  falsePositives: Array<Record<string, unknown>>;
};

function score(
  gold: Array<Span & { gold: GoldCase }>,
  found: Span[],
  paragraphs: Map<number, string>,
): Score {
  const result: Score = {
    byType: {},
    annotations: found.length,
    correct: 0,
    misses: [],
    falsePositives: [],
  };
  for (const g of gold) {
    const tally = (result.byType[g.gold.type] ??= {
      gold: 0,
      found: 0,
      exact: 0,
    });
    tally.gold += 1;
    const hits = found.filter(
      (f) => overlaps(g, f) && compatible(g.ref, f.ref),
    );
    if (hits.length > 0) {
      tally.found += 1;
      if (hits.some((f) => exact(g.ref, f.ref))) tally.exact += 1;
    } else {
      result.misses.push({
        type: g.gold.type,
        paragraph: g.paragraph,
        text: g.gold.text,
        ref: g.ref,
      });
    }
  }
  for (const f of found) {
    if (gold.some((g) => overlaps(g, f) && compatible(g.ref, f.ref))) {
      result.correct += 1;
    } else {
      const words = (paragraphs.get(f.paragraph) ?? '')
        .split(/\s+/)
        .filter(Boolean);
      result.falsePositives.push({
        paragraph: f.paragraph,
        text: words.slice(f.start, f.end).join(' '),
        ref: f.ref,
      });
    }
  }
  return result;
}

function toSpans(
  annotations: readonly ResolvedAnnotation[],
  orderById: Map<string, number>,
): Span[] {
  return annotations.flatMap((a) => {
    if (a.kind !== 'BIBLE' || a.startWord === null || a.endWord === null)
      return [];
    const paragraph = orderById.get(a.paragraphId);
    const ref = validateBibleRef(a.metadata);
    if (paragraph === undefined || !ref) return [];
    return [{ paragraph, start: a.startWord, end: a.endWord, ref }];
  });
}

function add(into: Score, from: Score) {
  for (const [type, t] of Object.entries(from.byType)) {
    const tally = (into.byType[type] ??= { gold: 0, found: 0, exact: 0 });
    tally.gold += t.gold;
    tally.found += t.found;
    tally.exact += t.exact;
  }
  into.annotations += from.annotations;
  into.correct += from.correct;
}

const pct = (n: number, d: number) =>
  d === 0 ? '   -  ' : `${((100 * n) / d).toFixed(1).padStart(5)}%`;

async function main() {
  // pnpm forwards the `--` separator from `just eval-scripture-refs -- …`.
  const corpus =
    process.argv.slice(2).find((a) => a !== '--') ?? DEFAULT_CORPUS;
  const ids = (await readdir(corpus))
    .map((f) => /^gold-(.+)\.json$/.exec(f)?.[1])
    .filter((id): id is string => id !== undefined)
    .sort();
  const totals = Object.fromEntries(
    SYSTEMS.map((s) => [
      s,
      {
        byType: {},
        annotations: 0,
        correct: 0,
        misses: [],
        falsePositives: [],
      } as Score,
    ]),
  ) as Record<System, Score>;
  const details: Record<string, Record<System, Score>> = {};

  for (const id of ids) {
    const read = async (kind: string) =>
      JSON.parse(
        await readFile(path.join(corpus, `${kind}-${id}.json`), 'utf8'),
      );
    const [source, meta, gold] = await Promise.all([
      read('source'),
      read('meta'),
      read('gold'),
    ]);
    const rows = source.result.data.json as SourceParagraph[];
    const paragraphs: EvalParagraph[] = rows.map((p) => ({
      id: String(p.order),
      order: p.order,
      text: p.text,
      words: [],
    }));
    const orderById = new Map(paragraphs.map((p) => [p.id, p.order]));
    const texts = new Map(rows.map((p) => [p.order, p.text]));
    const llm: ResolvedAnnotation[] = rows.flatMap((p) =>
      (p.annotations ?? []).map((a) => ({
        paragraphId: String(p.order),
        kind: a.kind,
        startWord: a.startWord,
        endWord: a.endWord,
        rawSpan: null,
        metadata: a.metadata,
      })),
    );
    const metadata = { title: meta.title, description: meta.description };
    const run = (layers: ScriptureLayer[]) =>
      toSpans(
        augmentBibleAnnotations(paragraphs, metadata, llm, new Set(layers))
          .annotations,
        orderById,
      );
    const spans: Record<System, Span[]> = {
      llm: toSpans(llm, orderById),
      explicit: run(['explicit']),
      implied: run(['implied']),
      quote: run(['quote']),
      layers: run(['explicit', 'implied', 'quote']),
      pipeline: run(['explicit', 'llm', 'implied', 'quote']),
    };
    const goldSpansForId = goldSpans(texts, gold.cases as GoldCase[]);
    details[id] = Object.fromEntries(
      SYSTEMS.map((s) => [s, score(goldSpansForId, spans[s], texts)]),
    ) as Record<System, Score>;
    for (const s of SYSTEMS) add(totals[s], details[id][s]);
  }

  const types = [
    ...new Set(SYSTEMS.flatMap((s) => Object.keys(totals[s].byType))),
  ].sort();
  console.log(`\n${ids.length} sermons, ${corpus}\n`);
  console.log(
    `Recall (found / exact verse)       ${SYSTEMS.map((s) => s.padStart(16)).join('')}`,
  );
  for (const type of [...types, 'all']) {
    const cells = SYSTEMS.map((s) => {
      const t =
        type === 'all'
          ? Object.values(totals[s].byType).reduce(
              (a, b) => ({
                gold: a.gold + b.gold,
                found: a.found + b.found,
                exact: a.exact + b.exact,
              }),
              { gold: 0, found: 0, exact: 0 },
            )
          : (totals[s].byType[type] ?? { gold: 0, found: 0, exact: 0 });
      return `${pct(t.found, t.gold)} /${pct(t.exact, t.gold)}`.padStart(16);
    });
    const gold = totals.llm.byType[type]?.gold;
    console.log(
      `  ${`${type} (${type === 'all' ? Object.values(totals.llm.byType).reduce((a, b) => a + b.gold, 0) : gold})`.padEnd(32)}${cells.join('')}`,
    );
  }
  console.log(
    `Precision (annotations matching gold)${SYSTEMS.map((s) => `${pct(totals[s].correct, totals[s].annotations)} of ${totals[s].annotations}`.padStart(16)).join('')}`,
  );

  const out = path.join(corpus, 'results.json');
  await writeFile(out, JSON.stringify(details, null, 2));
  console.log(`\nPer-sermon misses and false positives: ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
