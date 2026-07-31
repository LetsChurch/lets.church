// One-off prompt-evaluation CLI for the annotate activity.
//
// Reads a paragraphs JSON file produced by `services/transcribe/scripts/
// segment_text.py` (just `{ "paragraphs": [text, text, ...] }`), runs the
// production `runAnnotation` against the configured model, prints the raw
// markdown response, and lists the headings the model produced.
//
// Used for tuning the annotate prompt against text-only transcripts (e.g.
// hand-authored debate dumps) without going through the full upload
// pipeline. The call is `tracking: undefined` so it doesn't pollute
// `llm_call`. Costs the price of one annotate call (~$0.01-0.03 on
// gpt-5.6-luna).
//
// Usage (inside the web container):
//   pnpm exec tsx src/seed/eval-annotate-from-json.ts \
//     /seed-data/eval/debate.paragraphs.json \
//     [channel-name] [title]
//
// Output: writes a `.annotated.md` file beside the input JSON (raw model
// output) plus prints a heading summary to stdout.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  type EvalParagraph,
  runAnnotation,
} from '@letschurch/temporal/activities/background/annotate-transcript';
import { ANNOTATE_MODEL } from '@letschurch/temporal/util/llm';

const inputPath = process.argv[2];
if (!inputPath) {
  console.error(
    'usage: tsx src/seed/eval-annotate-from-json.ts <paragraphs.json> [channel] [title]',
  );
  process.exit(2);
}
const channelName = process.argv[3] ?? 'Eval';
const title = process.argv[4] ?? null;

const raw = await readFile(inputPath, 'utf-8');
const data = JSON.parse(raw) as { paragraphs: string[] };
if (!Array.isArray(data.paragraphs) || data.paragraphs.length === 0) {
  console.error(`${inputPath}: no paragraphs`);
  process.exit(2);
}

// Build EvalParagraph[] with synthetic word timings. The annotate parser
// uses words[] for span indexing but the actual `start`/`end` numeric
// values only matter when the result is rendered against an audio file,
// which a text-only eval isn't doing. Zero them out.
const paragraphs: EvalParagraph[] = data.paragraphs.map((text, idx) => {
  const tokens = text.split(/\s+/).filter((t) => t.length > 0);
  return {
    id: `eval-${idx}`,
    order: idx,
    text,
    words: tokens.map((word) => ({ word, start: 0, end: 0 })),
  };
});

const totalWords = paragraphs.reduce((acc, p) => acc + p.words.length, 0);
const totalChars = paragraphs.reduce((acc, p) => acc + p.text.length, 0);
console.log(
  `[eval] ${paragraphs.length} paragraphs, ${totalWords} words, ${totalChars} chars`,
);
console.log(`[eval] model: ${ANNOTATE_MODEL}`);

// Bump max_tokens well above the 32k default — debate-length text-only
// transcripts can echo back close to the input size, and the activity's
// silent-summarization guard requires the model to actually echo every
// paragraph. The provider rejects requests exceeding the model's hard
// cap, but most gpt-5.4 / claude-haiku-4.5 routings allow 64k+.
const MAX_TOKENS = 65536;

const result = await runAnnotation(
  paragraphs,
  { channelName, title, description: null },
  ANNOTATE_MODEL,
  { maxTokens: MAX_TOKENS },
);

// Headings: grep the raw markdown so we count what the model actually
// emitted (not what made it past the char-diff aligner — both numbers
// matter, but the emit count is the prompt's signal).
const emittedHeadings = (result.responseText.match(/^# .+$/gm) ?? []).map((h) =>
  h.slice(2).trim(),
);

console.log();
console.log(`[eval] paragraphs in:    ${paragraphs.length}`);
console.log(`[eval] headings emitted: ${emittedHeadings.length}`);
console.log(`[eval] outline resolved: ${result.stats.outline}`);
console.log(`[eval] bible:            ${result.stats.bible}`);
console.log(`[eval] keyword:          ${result.stats.keyword}`);
console.log(`[eval] skipped:          ${result.stats.skipped}`);
console.log(`[eval] prompt tokens:    ${result.stats.promptTokens}`);
console.log(`[eval] completion tokens: ${result.stats.completionTokens}`);
console.log(`[eval] duration:         ${result.stats.durationMs}ms`);
console.log(`[eval] cost (provider):  $${result.stats.costUsd ?? 'n/a'}`);
console.log();
console.log('[eval] emitted headings:');
for (const h of emittedHeadings) {
  console.log(`  # ${h}`);
}

const outPath = `${inputPath.replace(/\.json$/, '')}.annotated.md`;
await writeFile(outPath, result.responseText);
console.log();
console.log(`[eval] wrote ${path.relative(process.cwd(), outPath)}`);
