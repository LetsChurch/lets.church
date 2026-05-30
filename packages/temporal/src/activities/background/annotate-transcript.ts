import {
  Annotation,
  Channel,
  db,
  TranscriptParagraph,
  UploadRecord,
} from '@letschurch/db';
import { diffChars } from 'diff';
import { asc, count, eq, inArray } from 'drizzle-orm';
import { invariant } from 'es-toolkit';
import { z } from 'zod';
import {
  ANNOTATE_MODEL,
  createChatCompletionTracked,
  openrouterExtras,
} from '../../util/llm';
import { resolveCostUsd } from '../../util/llm-pricing';
import logger from '../../util/logger';

const moduleLogger = logger.child({
  module: 'temporal/activities/background/annotate-transcript',
});

// One LLM call generates all three annotation kinds. The model returns
// the transcript back as a markdown document with:
//   - `# Heading` lines preceding paragraphs that open a section
//   - inline `[span](#bible?book=…&chapter=…&verse=…)` for scripture refs
//   - inline `[span](#keyword)` for notable terms / key phrases
// We pull headings out as OUTLINE annotations (attached to the paragraph
// they precede) and the inline links as BIBLE / KEYWORD annotations with
// word-level offsets into paragraph.words[]. Word offsets (not char) keep
// us robust against minor text drift when the model lightly edits the
// paragraph as it goes — at worst we lose an annotation, never cut a word.
//
// Earlier iterations tried a sparse-JSON output format where the model
// returned `{paragraphs: [{order, headings, annotatedText}]}`. In
// practice the model hallucinated paragraph `order` numbers — emitting
// valid-looking annotations but assigning them to random paragraphs
// tens of indices off. Echoing the full transcript back as markdown
// and resolving positions on our end with a char-diff (see
// `buildModelToOriginalMap`) avoids that failure mode entirely.

// Bible URL query params (`#bible?book=…[&chapter=…][&verse=…][&endVerse=…][&endChapter=…]`).
// Book-only refs (whole-book mentions like "the gospel of John") are
// valid and emitted by the prompt's own examples; chapter is optional.
// Verse / endChapter / endVerse only meaningful when chapter is set —
// not enforced in the schema; downstream consumers should null-check.
const bibleMetadataSchema = z.object({
  book: z.string().min(1),
  chapter: z.coerce.number().int().positive().optional(),
  verse: z.coerce.number().int().positive().optional(),
  endChapter: z.coerce.number().int().positive().optional(),
  endVerse: z.coerce.number().int().positive().optional(),
});

// Match every inline annotation link in a paragraph's annotatedText.
// Captures: 1=span, 2=kind, 3=query string (incl. leading `?`, optional).
const LINK_RE = /\[([^\]]+?)\]\(#(bible|keyword)(\?[^)]*)?\)/g;

// Normalize a single word for matching: lowercase + strip surrounding
// punctuation but keep inner apostrophes ("can't" -> "can't"). Whitespace
// is already separated out by callers.
function normalizeWord(s: string): string {
  return s
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/[^\p{L}\p{N}']+$/u, '');
}

function tokenize(s: string): string[] {
  return s
    .split(/\s+/)
    .map(normalizeWord)
    .filter((t) => t.length > 0);
}

export type EvalParagraph = {
  id: string;
  order: number;
  text: string;
  words: Array<{ word: string; start: number; end: number }>;
};

export type AnnotationMetadata = {
  channelName: string;
  title: string | null;
  description: string | null;
};

export type ResolvedAnnotation = {
  paragraphId: string;
  kind: 'OUTLINE' | 'BIBLE' | 'KEYWORD';
  startWord: number | null;
  endWord: number | null;
  rawSpan: string | null;
  metadata: Record<string, unknown>;
};

// One skipped inline annotation: the model asked to wrap this span but
// the char-diff aligner couldn't locate it in the paragraph, or the
// bible metadata failed validation. Returned to the eval surface so the
// admin can see what's being dropped and why.
export type SkippedAnnotation = {
  paragraphId: string;
  paragraphOrder: number;
  kind: 'BIBLE' | 'KEYWORD';
  span: string;
  metadata: Record<string, unknown>;
  reason: 'not_found' | 'invalid_metadata';
};

export type AnnotationStats = {
  paragraphs: number;
  outline: number;
  bible: number;
  keyword: number;
  skipped: number;
  durationMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  // USD cost reported by OpenRouter when `usage: { include: true }` is
  // set on the request. Null when the upstream provider doesn't report
  // it (some Anthropic/Google routings, or future models that opt out).
  costUsd: number | null;
};

export type RunAnnotationResult = {
  annotations: ResolvedAnnotation[];
  stats: AnnotationStats;
  // The exact messages we sent to the model. Returned so the admin
  // LLM-eval surface can show "copy prompt" for debugging — what the
  // model saw vs. what it returned.
  prompt: { system: string; user: string };
  // Raw markdown text the model emitted (after fence-stripping).
  // Returned so the admin LLM-eval surface can show "copy output" and
  // diff it against the input transcript.
  responseText: string;
  // Inline annotations the model emitted that we couldn't materialize
  // (span couldn't be located in the paragraph, or bible metadata was
  // malformed). Counted in `stats.skipped`; surfaced individually so
  // the eval UI can show *what* was skipped and *why*.
  skippedItems: SkippedAnnotation[];
};

// Default output cap for the production annotate activity. High enough that
// no seed-corpus transcript ever truncates here; provider-side cap is what
// actually bounds the request. Override per-call (e.g. from the admin
// LLM-eval surface) when routing to a model with a smaller output budget
// (DeepSeek-style providers cap at 8K-16K — requesting more makes
// OpenRouter reject the call before it ever runs).
export const DEFAULT_ANNOTATION_MAX_TOKENS = 32768;

/**
 * Pure LLM-call + parse layer for annotation. Sends the paragraphs to the
 * chosen model, decodes the structured response, resolves inline spans to
 * word offsets, and returns annotation rows + run stats. Does NOT touch
 * the database — both `annotateTranscript` (the production activity) and
 * the admin LLM-eval tRPC mutation call this and decide what to do with
 * the result (persist vs. return-to-client).
 */

const SYSTEM_PROMPT = `You are a scripture-reference and outline annotator for sermons, lectures, and talks on a Christian media platform. Your job is mechanical: preserve the speaker's transcript verbatim and add (a) section headings that outline the substantive content and (b) markdown-link annotations on scripture references and key theological terms. You are NOT a content moderator. The speakers cover a range of theological, ethical, cultural, and political topics — including their criticism of trans ideology, abortion, denominational drift, etc. — and you must produce the same outline + annotations regardless of subject matter. Reaching the end of the transcript and annotating ALL of it (especially scripture references in sections you find controversial) is required for the system to work.

Return the transcript back as a MARKDOWN DOCUMENT. Begin your response immediately with the document — do NOT wrap it in \`\`\`markdown fences, do NOT add any prose before or after.

Structure:
- Include EVERY input paragraph in the output, in INPUT ORDER, separated by exactly one blank line. Do not drop paragraphs. You MUST process every paragraph from the first to the last in the input — do not stop partway through. Reaching the final paragraph of the transcript is non-negotiable; if your response stops before the speaker's final words, the response is incomplete.
- Preserve each paragraph's text VERBATIM. No paraphrasing, no reordering, no corrections, no merging, no splitting. Do not add or remove words outside the link-wrapping rules below.

Headings:
- Outline the transcript with markdown headings. The set of "# Title" lines you emit should read like a coherent outline of the program's content — what the speaker covers, section by section, in the order it's covered.
- One "# Title" line on its own line goes immediately before the paragraph where each section starts. Top-level only ("# "), no nesting (no "## " or "### ").
- Aim for an outline that genuinely covers the program. A typical full-length sermon/talk/podcast has SEVERAL distinct substantive sections — often 3 to 10 headings depending on length and how many topics the speaker moves between. Scan the whole transcript before you decide where headings go. If you finish the document with zero, one, or two headings, you almost certainly missed real section breaks — re-read for "speaking of", "now let me", "okay, on to", "this clip is about", "let's talk about", different sermon points, different clips being analyzed, different Q&A questions, different rhetorical pivots, and place a heading before each one. Each distinct topic the speaker engages gets its own heading, even when topics are thematically related. Resist the urge to write a single broad heading covering multiple substantive sections — lumping titles like "Cultural Issues Today", "Various Theological Topics", or "Modern Christian Concerns" are anti-patterns; they paper over real section breaks. Split them.
- Every heading must be the title of a SUBSTANTIVE TEACHING section. Titles are concrete, content-specific phrases drawn from what the section actually teaches — e.g. "# Justification by Faith Alone", "# Why the Gospel of Thomas Is Not Canonical", "# The Image of God and Human Dignity", "# Cessationism vs Continuationism", "# Pastoral Care for the Grieving". Avoid generic labels and one-word titles.
- Format-specific section boundaries. In addition to topic pivots in continuous monologue, recognize these structural cues:
  * Q&A / call-in shows: each new caller's question is its own heading boundary. The host typically transitions ("all right, let's go with [name]", "let's talk to [name]", "go ahead [name]", "okay, [name]") and the caller poses a discrete question — the answer to that question is its own substantive section. Title by the question's topic, not the caller's name (e.g. "# Whether Christians May Have Images of Christ", not "# Marco's Question" or "# Question from Marco"). When the host returns to monologue between callers (e.g. for an off-topic tangent or a brief sign-off comment), apply the normal banter rule — those interludes don't earn a heading.
  * Enumerated essays / "N reasons for/why…" / sermon-point-list talks: each numbered or named item gets its own heading. If the speaker says "first reason / second reason / third reason", "first point / second point", "reason number one / reason number two", "and the third thing is…", write a heading per item — not one heading covering all the reasons. Title by the item's content (e.g. "# Sufficiency of Scripture", not "# Reason One").
  * Recorded clips with commentary: each clip the speaker introduces and then analyzes is its own heading boundary (signaled by "let's play this clip", "here's the next one", "this next clip is about…", "let me play this for you"). Title by the clip's topic or who the clip is critiquing.
- Banter is anything that isn't substantive teaching: greetings, welcomes, weather, scheduling chitchat, sound checks, tech setup, host/guest small talk, off-topic news asides, sponsor reads, sign-offs. Banter paragraphs appear in the output verbatim but they DO NOT have a heading above them and they ARE NOT named by a heading. If a heading you're about to write would be titled around banter ("Welcome and Technical Setup", "Opening Banter", "Introductory Chatter", "Show Opens With…", "Pre-Show News Roundup", anything describing or wrapping the open chatter), DO NOT write it — that's not a section of the outline.
- Where the first heading goes: if the program opens with banter (most do), the document's first lines are those banter paragraphs themselves, with no heading above them. The first "# Title" line appears later, immediately before the paragraph that opens the first substantive teaching topic (often signaled by phrases like "gotta start off the program today", "we've got to address", "speaking of X, …", a hard topic pivot). The document does not begin with a heading when the program begins with banter.
- Inline annotations (below) likewise focus on substantive content; spans inside pure banter paragraphs can be skipped.

Inline annotations (wrap spans of paragraph text as markdown links):
- Scripture references (explicit citations, conversational forms, AND clear allusions): \`[verbatim span](#bible?book=OSIS&chapter=N&verse=M)\`. Chapter is optional for whole-book mentions ("the gospel of John"). Verse is optional for whole-chapter refs. For verse ranges add \`&endVerse=M2\`; for chapter ranges add \`&endChapter=N2\`. \`#bible\` is reserved for the 66-book Protestant canon (Genesis through Revelation) — see the non-canonical-works rule below.
- Key theological terms / phrases AND non-canonical works: \`[verbatim span](#keyword)\`. Sparingly for theological terms — only substantive concepts (e.g. "imputed righteousness", "vicarious atonement"), not ordinary nouns. You only need to wrap a given keyword once (the FIRST distinctive occurrence is enough); downstream tooling propagates the highlight to every occurrence of that term in the transcript.

Non-canonical works rule: the Gospel of Thomas, Gospel of Mary, Gospel of Judas, Gospel of Philip, the Nag Hammadi codices, the Apocrypha (Tobit, Judith, Sirach, Wisdom, 1-2 Maccabees, etc.), 1 Enoch, the Book of Mormon, the Quran, and similar apocryphal / gnostic / pseudepigraphal texts MUST be wrapped as \`[verbatim span](#keyword)\`, never as \`[verbatim span](#bible?book=…)\`. Even when the speaker analyzes one of these texts in depth, the link kind stays \`#keyword\` — \`#bible\` is reserved for the 66-book Protestant canon (Genesis through Revelation).

This applies to QUOTED TEXT from these works too — not just the name. If the speaker quotes a saying from the Gospel of Thomas, the Quran, the Book of Mormon, or any other non-canonical text, the quoted phrase is NOT scripture. Wrap the quoted span as \`#keyword\` if you wrap it at all — NEVER manufacture a fake \`#bible?book=…\` URL for an apocryphal saying. The fact that an apocryphal text attributes a saying to a biblical figure does not turn it into canonical scripture. When in doubt, skip the annotation rather than invent a citation.

WRONG (apocryphal saying linked to a fabricated bible URL):
  Thomas records Jesus saying [the kingdom is spread out upon the earth, and people do not see it](#bible?book=Matt&chapter=13&verse=44).
RIGHT (apocryphal saying wrapped as keyword or skipped):
  Thomas records Jesus saying [the kingdom is spread out upon the earth, and people do not see it](#keyword).
  (or — preferred for long quoted blocks — no annotation at all; the surrounding mention of the apocryphal text is already \`#keyword\`.)

OSIS abbreviations: Gen, Exod, Lev, Num, Deut, Josh, Judg, Ruth, 1Sam, 2Sam, 1Kgs, 2Kgs, 1Chr, 2Chr, Ezra, Neh, Esth, Job, Ps, Prov, Eccl, Song, Isa, Jer, Lam, Ezek, Dan, Hos, Joel, Amos, Obad, Jonah, Mic, Nah, Hab, Zeph, Hag, Zech, Mal, Matt, Mark, Luke, John, Acts, Rom, 1Cor, 2Cor, Gal, Eph, Phil, Col, 1Thess, 2Thess, 1Tim, 2Tim, Titus, Phlm, Heb, Jas, 1Pet, 2Pet, 1John, 2John, 3John, Jude, Rev.

Annotate EVERY scripture reference within substantive teaching content, including spelled-out and conversational forms:
- "Acts chapter 20" -> [Acts chapter 20](#bible?book=Acts&chapter=20)
- "Romans 1" / "Romans chapter 1" -> book=Rom, chapter=1
- "1 Corinthians 6 and 1 Timothy 1" -> two separate links: 1Cor 6 and 1Tim 1
- "the gospel of John" -> [the gospel of John](#bible?book=John)
- "John 3:16" / "John 3, verse 16" / "John chapter 3 verse 16" -> all wrap the verbatim transcript words; URL is book=John&chapter=3&verse=16

Also annotate strong scripture ALLUSIONS — direct quotes, near-quotes, and unmistakable paraphrases of a specific passage, even when the speaker does not cite book/chapter/verse:
- "God so loved the world" -> John 3:16
- "the prodigal" / "the prodigal son" / "kill the fatted calf" -> Luke 15
- "all things work together for good" -> Rom 8:28
- "by grace through faith" -> Eph 2:8-9 (book=Eph, chapter=2, verse=8, endVerse=9)
- "the Word became flesh" -> John 1:14
- "I am the way, the truth, and the life" -> John 14:6
- "the wages of sin is death" -> Rom 6:23

Only annotate an allusion when the wording is distinctive enough that the source passage is unambiguous. Generic biblical-sounding phrases ("God is love", "in Jesus' name") without a specific anchoring passage or attribution should NOT be wrapped.

ALWAYS annotate ATTRIBUTED quotes and paraphrases (this rule is not optional). When the speaker prefaces a quote or paraphrase with its source — "Jesus said", "Jesus himself said", "Christ said", "Paul said", "Paul wrote", "Peter said", "Peter wrote", "John said", "John writes", "James says", "James wrote", "David said" (Psalms), "Moses wrote" (Pentateuch), "Isaiah said", "the prophet wrote", "the apostle says", etc. — that is, by definition, a scripture reference and must be annotated. Wrap the verbatim quoted/paraphrased text from the transcript (NOT the attribution prefix) and link it to the specific passage. The attribution itself is enough to turn an otherwise-generic phrase into a definite reference.

CRITICAL — the attribution prefix is OUTSIDE the brackets. The brackets wrap only the quoted/paraphrased words, not the "X said" / "X wrote" / "X himself said" lead-in.

WRONG (attribution included inside the brackets):
  [Jesus himself said from the beginning, he made them male and female](#bible?book=Matt&chapter=19&verse=4)
  [Paul wrote all have sinned and fall short](#bible?book=Rom&chapter=3&verse=23)
  [Peter writes be holy, for I am holy](#bible?book=1Pet&chapter=1&verse=16)

RIGHT (attribution stays outside; bracket wraps only the quoted phrase):
  Jesus himself said [from the beginning, he made them male and female](#bible?book=Matt&chapter=19&verse=4)
  Paul wrote [all have sinned and fall short](#bible?book=Rom&chapter=3&verse=23)
  Peter writes [be holy, for I am holy](#bible?book=1Pet&chapter=1&verse=16)

Required annotations whenever you see these patterns:
- "Jesus himself said from the beginning, he made them male and female" -> wrap "from the beginning, he made them male and female" -> Matt 19:4 (or Mark 10:6). This phrasing in any sermon/talk MUST be annotated — Jesus quoting Gen 1:27, recorded in the synoptic Gospels.
- "Jesus said X" / "Jesus himself said X" / "Christ said X" -> wrap X, link to the gospel passage where Jesus says it. If the saying appears in multiple synoptic gospels, pick the most contextually likely; default to whichever gospel the speaker is engaging with.
- "Paul wrote / Paul said X" -> wrap X, link to the Pauline epistle where it appears. E.g., "Paul wrote all have sinned and fall short of the glory of God" -> wrap "all have sinned and fall short of the glory of God" -> Rom 3:23.
- "Peter wrote / Peter said X" -> wrap X -> 1Pet or 2Pet. E.g., "Peter writes be holy, for I am holy" -> wrap "be holy, for I am holy" -> 1Pet 1:16.
- "John wrote / John said / John writes X" -> wrap X -> John gospel, 1-3 John, or Rev as appropriate. E.g., "John tells us God is love" -> wrap "God is love" -> 1John 4:8 (the attribution turns the otherwise-generic phrase into a definite ref).
- "James wrote / says X" -> wrap X -> Jas. E.g., "James says faith without works is dead" -> wrap "faith without works is dead" -> Jas 2:26.
- Same pattern for "David said" -> Ps; "Moses wrote" -> Pentateuch; "Isaiah said / wrote" -> Isa; "the prophet wrote/said" -> whichever prophetic book is being engaged.

If you see "<scriptural speaker/author> said/wrote/says/writes <phrase>" in the transcript and you skip annotating <phrase>, you have made a mistake.

Verbatim text rule (strict):
- The text inside \`[…]\` MUST be an EXACT verbatim substring of the original paragraph — character-for-character, preserving the speaker's exact wording, spacing, and punctuation. NEVER substitute the OSIS abbreviation inside the brackets: if the speaker said "1 Timothy 1", the bracket text is "1 Timothy 1", not "1Tim 1". The OSIS form is for the URL parameters only.
- One link per span. Do NOT nest links. Each link must wrap a DIFFERENT, NON-OVERLAPPING portion of the original transcript text. You cannot wrap the same characters twice — every link consumes its own slice of the text and then we move on to the next slice.
- Concrete worked example. Original text: "He cites 1 Corinthians 6 and 1 Timothy 1 and Romans 1 on this point".
  CORRECT (three links, each wrapping a different non-overlapping span; the connective " and " stays outside the brackets):
    He cites [1 Corinthians 6](#bible?book=1Cor&chapter=6) and [1 Timothy 1](#bible?book=1Tim&chapter=1) and [Romans 1](#bible?book=Rom&chapter=1) on this point
  WRONG — same span text wrapped three times with three different URLs (the original only contains that phrase once; duplicating the bracket text invents characters that aren't there):
    He cites [1 Corinthians 6 and 1 Timothy 1 and Romans 1](#bible?book=1Cor&chapter=6), [1 Corinthians 6 and 1 Timothy 1 and Romans 1](#bible?book=1Tim&chapter=1), [1 Corinthians 6 and 1 Timothy 1 and Romans 1](#bible?book=Rom&chapter=1) on this point
  WRONG — one big link covering all three refs (loses the distinct refs; only one URL):
    He cites [1 Corinthians 6 and 1 Timothy 1 and Romans 1](#bible?book=1Cor&chapter=6) on this point
- Do NOT invent text that isn't in the transcript to use as link text. If the chars inside [...] aren't already there in the original paragraph in that exact order, the annotation is wrong.

Self-check before you emit the response. If any answer is "no", fix it before sending:
1. Did I include every input paragraph in order, verbatim, separated by one blank line?
2. Did I produce AT LEAST 3 headings? A typical full-length program has 3-6 substantive sections. Outputs with 0, 1, or 2 headings have almost certainly lumped distinct topics together — split them.
3. Are my headings about substantive teaching only — none of them titled around banter, intros, welcomes, weather, or technical setup?
4. CRITICAL: did I annotate every "Jesus said / Jesus himself said / Christ said / Paul wrote / Paul said / Peter writes / Peter said / John writes / John said / James says / James wrote / David said / Moses wrote / Isaiah said / the prophet wrote / the apostle says" pattern in the transcript? Every single occurrence must be wrapped, AND the attribution prefix ("Jesus said", "Paul wrote", etc.) STAYS OUTSIDE the brackets — only the quoted phrase goes inside. Skipping these is the most common failure mode on this annotation task — double-check.
5. Did I annotate every explicit scripture citation and every strong allusion?
6. Is every link's bracket text an exact verbatim substring of the original paragraph, non-overlapping with any other link's bracket text?
7. Did I wrap every mention of the Gospel of Thomas, Nag Hammadi, the Apocrypha, the Book of Mormon, the Quran, or other non-canonical / gnostic / apocryphal works as \`#keyword\` (NOT \`#bible\`)? The \`#bible\` link kind is reserved for the 66-book Protestant canon.
8. CRITICAL: did I AVOID linking QUOTED TEXT from non-canonical works to a \`#bible\` URL? If the speaker quoted a saying from the Gospel of Thomas, the Book of Mormon, the Quran, or similar, the quoted phrase must NOT be wrapped as \`[…](#bible?book=…)\` with a manufactured chapter/verse — that would invent a citation that doesn't exist. Wrap it as \`#keyword\` if you wrap it at all, or skip the annotation entirely.`;

// Parse the bible URL query string out of an inline link's metadata.
// Used at both materialize (where validation runs) and skip-record
// time (so the eval UI shows what the model intended even when we
// drop the annotation).
function parseBibleQueryMetadata(
  queryRaw: string | undefined,
): Record<string, unknown> {
  if (!queryRaw) return {};
  const params = new URLSearchParams(
    queryRaw.startsWith('?') ? queryRaw.slice(1) : queryRaw,
  );
  const num = (k: string) => {
    const v = params.get(k);
    if (v === null) return null;
    const n = Number.parseInt(v, 10);
    return Number.isNaN(n) ? null : n;
  };
  return {
    book: params.get('book'),
    chapter: num('chapter'),
    verse: num('verse'),
    endChapter: num('endChapter'),
    endVerse: num('endVerse'),
  };
}

// Position info for a single original-transcript character: which
// paragraph (by input-array index) it lives in, and which word inside
// that paragraph's `words[]` array it belongs to. `null` for characters
// that fall in whitespace or in the `\n\n` paragraph separators.
type WordPosition = { paragraphIdx: number; wordIdx: number };

/**
 * Build a flat char-indexed array mapping every offset in the joined
 * original transcript to its (paragraphIdx, wordIdx). Non-word
 * characters (whitespace, the `\n\n` separators) map to null.
 *
 * Relies on `paragraph.text` being whitespace-aligned with
 * `paragraph.words` — i.e. the Nth non-whitespace run in `text`
 * corresponds to `words[N]`. This is how `storeTranscriptParagraphs`
 * builds the rows (segs joined by spaces, words concatenated in the
 * same order), so the assumption holds for all production transcripts.
 */
function buildWordPositionMap(
  paragraphs: EvalParagraph[],
): Array<WordPosition | null> {
  // Total length: sum of paragraph text lengths plus '\n\n' separators
  // between adjacent paragraphs.
  const totalLength = paragraphs.reduce(
    (sum, p, i) => sum + p.text.length + (i < paragraphs.length - 1 ? 2 : 0),
    0,
  );
  const map: Array<WordPosition | null> = new Array(totalLength).fill(null);
  let textOffset = 0;
  for (let pi = 0; pi < paragraphs.length; pi++) {
    const p = paragraphs[pi] as EvalParagraph;
    let wordIdx = 0;
    let i = 0;
    while (i < p.text.length) {
      // Skip whitespace.
      while (i < p.text.length && /\s/.test(p.text[i] as string)) i++;
      if (i >= p.text.length) break;
      // Run of non-whitespace = one word; tag every char in the run.
      while (i < p.text.length && !/\s/.test(p.text[i] as string)) {
        map[textOffset + i] = { paragraphIdx: pi, wordIdx };
        i++;
      }
      wordIdx += 1;
    }
    textOffset += p.text.length;
    if (pi < paragraphs.length - 1) textOffset += 2; // '\n\n' separator
  }
  return map;
}

/**
 * Build a flat char-indexed array mapping every offset in the model's
 * response to the corresponding offset in the original transcript.
 * `-1` for model characters that were added by the model (not present
 * in the original) — link decorations (`[`, `](#...)`), inserted
 * heading lines, or any spurious additions.
 *
 * Computed by walking the char-level diff once: equal regions
 * contribute mappings; added regions advance the model cursor only;
 * removed regions advance the original cursor only.
 */
function buildModelToOriginalMap(original: string, model: string): Int32Array {
  const map = new Int32Array(model.length).fill(-1);
  let oi = 0;
  let mi = 0;
  for (const part of diffChars(original, model)) {
    if (part.added) {
      mi += part.value.length;
    } else if (part.removed) {
      oi += part.value.length;
    } else {
      // Equal: every model char in this run maps to the corresponding
      // original char one-for-one.
      for (let k = 0; k < part.value.length; k++) {
        map[mi + k] = oi + k;
      }
      oi += part.value.length;
      mi += part.value.length;
    }
  }
  return map;
}

// Matches a single-line heading anywhere in the model output. Captured
// group 1 is the heading title. `^...$` with /gm so multiple headings
// in one response are each found.
const HEADING_RE = /^#{1,3}[ \t]+(.+?)[ \t]*$/gm;

// Silent-summarization guard tuning. See the docstring at the call site
// (search for SILENT_SUMMARY_FLOOR) for why these are the values they
// are. Pulled out so the next person to revisit the threshold has one
// place to edit, and so the constants show up in stack traces.
//
// CHARS_PER_TOKEN is the English-prose average. Sermon transcripts skew
// closer to 3.5 because of scripture-reference density (`John 3:16`,
// `1 Corinthians 6 and 1 Timothy 1`) — that means `length / 4` slightly
// *overestimates* target tokens, which is conservative for this guard's
// purpose (false-positive on legitimate-but-token-dense outputs is the
// failure we'd want to know about).
const CHARS_PER_TOKEN = 4;

// Fraction of estimated-transcript-tokens the completion must hit. Tuned
// against the corpus: healthy gpt-5.4-mini runs land at 0.95-1.05 (echo
// + heading + link decoration overhead), Llama 4 summarization failures
// land at 0.2-0.3. 0.8 is comfortably in between, but if a model that
// trims banter aggressively shows up in the corpus the floor may need
// to drop. Watch for false-alarms in the LlmCall audit log
// (finish_reason='stop' rows with non-null errors).
const SILENT_SUMMARY_FLOOR = 0.8;

/**
 * Eval-only: full-markdown-document annotation mode. See the block
 * comment above for the strategy + rationale. Same `RunAnnotationResult`
 * shape as the other annotate paths so the eval surface renders any of
 * them through one pipeline.
 */
export async function runAnnotation(
  paragraphs: EvalParagraph[],
  metadata: AnnotationMetadata,
  model: string,
  options: {
    maxTokens?: number;
    /**
     * When set, the chat-completion call is logged to `llm_call` for cost
     * accounting. Omit only from one-off scripts and unit tests where
     * polluting the audit log is undesirable.
     */
    tracking?: {
      activity: string;
      uploadRecordId?: string | null;
    };
  } = {},
): Promise<RunAnnotationResult> {
  invariant(paragraphs.length > 0, 'runAnnotation: no paragraphs provided');
  const maxTokens = options.maxTokens ?? DEFAULT_ANNOTATION_MAX_TOKENS;

  // No `[N]` prefix — full-doc mode positions paragraphs by sequence
  // in the model's output, fuzzy-aligned to inputs by the parser. The
  // prompt requires every input paragraph to appear verbatim in the
  // output (in order), so emitted-output length should be ≥ input
  // length — the silent-summarization guard below catches the case
  // where a model ignores that rule and returns a paraphrased summary.
  const transcriptBody = paragraphs.map((p) => p.text).join('\n\n');
  const metadataLines = [
    `Channel: ${metadata.channelName}`,
    metadata.title ? `Title: ${metadata.title}` : null,
    metadata.description ? `Description: ${metadata.description}` : null,
  ].filter((l): l is string => l !== null);
  const userContent = `${metadataLines.join('\n')}\n\nTranscript:\n\n${transcriptBody}`;

  // Plain text out — no `response_format`. The model writes a markdown
  // document directly; we parse it block-by-block on this side.
  //
  // Wrapper handles timing, audit-log insertion, and built-in guards
  // (finish_reason length/content_filter, empty content, create() throw).
  // The activity-specific `guards` callback handles silent-summarization
  // — a content check that some models (notably Llama 4 Maverick/Scout)
  // trip by returning a paraphrased summary instead of echoing the
  // transcript. The response parses fine as markdown but the downstream
  // annotations would be bogus because most input paragraphs never made
  // it through. Healthy runs produce completion_tokens roughly equal to
  // or slightly greater than the transcript's tokens (echo + inserted
  // headings + link syntax overhead).
  const t0 = Date.now();
  const estimatedTranscriptTokens = Math.ceil(
    transcriptBody.length / CHARS_PER_TOKEN,
  );
  const completion = await createChatCompletionTracked({
    tracking: options.tracking,
    model,
    max_tokens: maxTokens,
    // Empirically the best temperature for verbatim-echo + outlining on
    // gpt-5.4-mini across our seed-corpus transcripts (4 transcripts × 4
    // temperatures × 3 runs each, May 2026). The provider default (1.0)
    // produced the catastrophic "model summarizes the transcript instead
    // of echoing it" failure mode on ~1/12 runs (one run scored 0 on
    // paragraph fidelity). 0.6 had the highest heading count, lowest
    // within-cell variance, highest paragraph fidelity (99.3%), and no
    // catastrophic failures.
    temperature: 0.6,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    ...(openrouterExtras as Record<string, unknown>),
    guards: (completion) => {
      const completionTokens = completion.usage?.completion_tokens ?? 0;
      if (
        completionTokens > 0 &&
        estimatedTranscriptTokens > 0 &&
        completionTokens < estimatedTranscriptTokens * SILENT_SUMMARY_FLOOR
      ) {
        return {
          outcome: 'guard_silent_summarization',
          errorMessage: `Model output too short (${completionTokens} completion tokens vs ~${estimatedTranscriptTokens} estimated transcript tokens, ${Math.round(
            (completionTokens / estimatedTranscriptTokens) * 100,
          )}%, floor ${Math.round(SILENT_SUMMARY_FLOOR * 100)}%). Likely silent summarization or truncation — the model did not echo every paragraph verbatim.`,
        };
      }
      return { outcome: 'success', errorMessage: null };
    },
  });
  const durationMs = Date.now() - t0;
  const choice = completion.choices[0];

  // Log the completion/estimated-input ratio so the silent-summarization
  // floor (SILENT_SUMMARY_FLOOR) can be tuned from observed data instead
  // of vibes. The ratio is per-call, the floor is per-model; plotting
  // the distribution over enough runs surfaces models that hug the
  // edge. This only runs on the happy path — failed guards already
  // threw above.
  const completionTokens = completion.usage?.completion_tokens ?? 0;
  if (estimatedTranscriptTokens > 0) {
    moduleLogger.info(
      {
        ...(options.tracking?.uploadRecordId
          ? { uploadRecordId: options.tracking.uploadRecordId }
          : {}),
        context: {
          model,
          activity: options.tracking?.activity,
          completionTokens,
          estimatedTranscriptTokens,
          ratio: completionTokens / estimatedTranscriptTokens,
          floor: SILENT_SUMMARY_FLOOR,
        },
      },
      'annotate-transcript completion ratio',
    );
  }

  const raw = choice?.message.content;
  invariant(raw, 'Model returned no content');
  // Defensive fence-strip in case the model wraps its document despite
  // explicit instructions. Doing it once up-front means `responseText`
  // is clean for the eval "copy output" affordance and the diff pass
  // sees the same text the eval UI shows.
  const stripped = raw
    .trim()
    .replace(/^```(?:markdown|md)?\s*/i, '')
    .replace(/\s*```$/i, '');

  // Build two position maps:
  //   1. wordAt: char offset in `transcriptBody` → (paragraphIdx,
  //      wordIdx), null for whitespace and the `\n\n` separators.
  //   2. modelToOriginal: char offset in `stripped` → char offset in
  //      `transcriptBody`, -1 for chars the model added (link
  //      decorations, inserted headings, spurious whitespace).
  //
  // Together they let us walk every link/heading the model emitted and
  // find exactly where it lives in the original — bypassing any
  // per-paragraph alignment that would otherwise fail when the model
  // merges, splits, or reorders paragraphs.
  const wordAt = buildWordPositionMap(paragraphs);
  const modelToOriginal = buildModelToOriginalMap(transcriptBody, stripped);

  const annotations: ResolvedAnnotation[] = [];
  const skippedItems: SkippedAnnotation[] = [];
  let outlineCount = 0;
  let bibleCount = 0;
  let keywordCount = 0;
  let skippedInline = 0;

  // --- Headings -----------------------------------------------------
  // A heading line in the model output is a pure insertion (no
  // corresponding chars in the original). To attach it to a paragraph,
  // scan forward past the heading line for the first model char that
  // *does* map back to the original — that char's paragraph is the one
  // the heading opens.
  HEADING_RE.lastIndex = 0;
  for (const headingMatch of stripped.matchAll(HEADING_RE)) {
    const title = headingMatch[1]?.trim();
    if (!title || headingMatch.index === undefined) continue;
    let scan = headingMatch.index + headingMatch[0].length;
    while (scan < stripped.length && modelToOriginal[scan] === -1) scan++;
    if (scan >= stripped.length) continue;
    const origPos = modelToOriginal[scan] as number;
    const wp = wordAt[origPos];
    if (!wp) continue;
    const paragraph = paragraphs[wp.paragraphIdx] as EvalParagraph;
    annotations.push({
      paragraphId: paragraph.id,
      kind: 'OUTLINE',
      startWord: null,
      endWord: null,
      rawSpan: null,
      metadata: { level: 1, title },
    });
    outlineCount += 1;
  }

  // --- Inline links -------------------------------------------------
  // Bible refs: resolve each link's span chars through the diff map to
  // find its real position in the original transcript. From there,
  // wordAt gives us paragraph + word range.
  //
  // Keywords: collect the distinct span texts the model wrapped. We
  // *don't* use their positions — keywords aren't context-specific, so
  // we'll do a global pass below to highlight every occurrence in
  // every paragraph.
  const keywordSpans = new Set<string>();
  LINK_RE.lastIndex = 0;
  for (const match of stripped.matchAll(LINK_RE)) {
    const [, span, kindLower, queryRaw] = match;
    if (!span || !kindLower || match.index === undefined) continue;

    if (kindLower === 'keyword') {
      keywordSpans.add(span);
      continue;
    }

    // Bible: locate the span via the model→original map.
    const spanStartModel = match.index + 1; // skip the '['
    const spanEndModel = spanStartModel + span.length; // exclusive

    let startOrig = -1;
    for (let k = spanStartModel; k < spanEndModel; k++) {
      if (modelToOriginal[k] !== -1) {
        startOrig = modelToOriginal[k] as number;
        break;
      }
    }
    let endOrig = -1;
    for (let k = spanEndModel - 1; k >= spanStartModel; k--) {
      if (modelToOriginal[k] !== -1) {
        endOrig = modelToOriginal[k] as number;
        break;
      }
    }

    const intendedMetadata = parseBibleQueryMetadata(queryRaw);

    if (startOrig === -1 || endOrig === -1) {
      // None of the span's chars survived to the original — model
      // emitted text that wasn't in the input. Skip.
      skippedInline += 1;
      skippedItems.push({
        paragraphId: '',
        paragraphOrder: -1,
        kind: 'BIBLE',
        span,
        metadata: intendedMetadata,
        reason: 'not_found',
      });
      continue;
    }

    const startWp = wordAt[startOrig];
    const endWp = wordAt[endOrig];
    if (!startWp || !endWp || startWp.paragraphIdx !== endWp.paragraphIdx) {
      // Span endpoints land in whitespace, separator, or cross a
      // paragraph boundary (would only happen if model glued paragraphs
      // together — but the diff still gave us positions, just bad ones).
      skippedInline += 1;
      const ownerIdx = startWp?.paragraphIdx ?? endWp?.paragraphIdx;
      const owner = ownerIdx !== undefined ? paragraphs[ownerIdx] : undefined;
      skippedItems.push({
        paragraphId: owner?.id ?? '',
        paragraphOrder: owner?.order ?? -1,
        kind: 'BIBLE',
        span,
        metadata: intendedMetadata,
        reason: 'not_found',
      });
      continue;
    }

    const paragraph = paragraphs[startWp.paragraphIdx] as EvalParagraph;
    const query = queryRaw ? queryRaw.slice(1) : '';
    const params = new URLSearchParams(query);
    const metaCandidate = bibleMetadataSchema.safeParse({
      book: params.get('book') ?? '',
      chapter: params.get('chapter') ?? undefined,
      verse: params.get('verse') ?? undefined,
      endChapter: params.get('endChapter') ?? undefined,
      endVerse: params.get('endVerse') ?? undefined,
    });
    if (!metaCandidate.success) {
      skippedInline += 1;
      skippedItems.push({
        paragraphId: paragraph.id,
        paragraphOrder: paragraph.order,
        kind: 'BIBLE',
        span,
        metadata: intendedMetadata,
        reason: 'invalid_metadata',
      });
      continue;
    }
    annotations.push({
      paragraphId: paragraph.id,
      kind: 'BIBLE',
      startWord: startWp.wordIdx,
      endWord: endWp.wordIdx + 1, // half-open
      rawSpan: span,
      metadata: metaCandidate.data as unknown as Record<string, unknown>,
    });
    bibleCount += 1;
  }

  // --- Keyword global highlight pass --------------------------------
  // Keywords aren't context-specific: the model only needs to flag a
  // distinctive term once, and we propagate the highlight to every
  // occurrence of that term anywhere in the transcript. This recovers
  // (a) repeated terms in the same paragraph that exact-match would
  // skip as "ambiguous", and (b) terms appearing in paragraphs the
  // model didn't wrap them in.
  for (const span of keywordSpans) {
    const spanTokens = tokenize(span);
    if (spanTokens.length === 0) continue;
    let matched = false;
    for (const p of paragraphs) {
      const tokens = p.words.map((w) => normalizeWord(w.word));
      for (let i = 0; i + spanTokens.length <= tokens.length; i++) {
        let ok = true;
        for (let j = 0; j < spanTokens.length; j++) {
          if (tokens[i + j] !== spanTokens[j]) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        annotations.push({
          paragraphId: p.id,
          kind: 'KEYWORD',
          startWord: i,
          endWord: i + spanTokens.length,
          rawSpan: span,
          metadata: {},
        });
        keywordCount += 1;
        matched = true;
      }
    }
    if (!matched) {
      // Model emitted a keyword span that doesn't appear in the
      // transcript at all — likely a hallucination or a tokenization
      // mismatch (joined acronym vs spaced form).
      skippedInline += 1;
      skippedItems.push({
        paragraphId: '',
        paragraphOrder: -1,
        kind: 'KEYWORD',
        span,
        metadata: {},
        reason: 'not_found',
      });
    }
  }

  return {
    annotations,
    stats: {
      paragraphs: paragraphs.length,
      outline: outlineCount,
      bible: bibleCount,
      keyword: keywordCount,
      skipped: skippedInline,
      durationMs,
      promptTokens: completion.usage?.prompt_tokens ?? null,
      completionTokens: completion.usage?.completion_tokens ?? null,
      // Prefer the provider-reported cost when OpenRouter actually returns
      // one (gemma + other open-weight routings reliably do); fall back to
      // our pricing table when it's missing OR returned as 0, which is
      // what OpenRouter sends back for direct-from-vendor routings like
      // openai/* and the badge would otherwise read "$0" on every prod
      // run. See `util/llm-pricing.ts` for the table.
      costUsd: resolveCostUsd(
        model,
        completion.usage?.prompt_tokens ?? null,
        completion.usage?.completion_tokens ?? null,
        (completion.usage as unknown as { cost?: number } | undefined)?.cost ??
          null,
      ),
    },
    prompt: { system: SYSTEM_PROMPT, user: userContent },
    responseText: stripped,
    skippedItems,
  };
}

/**
 * Generate OUTLINE / BIBLE / KEYWORD annotations for one upload via the
 * configured chat model. Reads paragraphs from `transcript_paragraph`,
 * runs the shared `runAnnotation` pure layer, then replaces any existing
 * annotations for the upload's paragraphs in a single transaction.
 *
 * `force: false` (the default, used by the first-pass transcribe path)
 * short-circuits when any annotation row already exists for this
 * upload's paragraphs so parent-workflow retries don't re-bill tokens
 * for work the previous attempt completed. `regenerateUploadAnnotations`
 * passes `force: true` to override that.
 *
 * Idempotent: the delete-then-insert is scoped to this upload's
 * paragraphs, so re-runs against the same data converge to the same
 * (model-deterministic) set.
 */
export default async function annotateTranscript(
  uploadRecordId: string,
  options: { force?: boolean } = {},
) {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'annotateTranscript',
    context: { args: { uploadRecordId } },
  });

  // Metadata anchor — same idea as summarize-upload: helps the model
  // pick the right section titles + scope of allusions.
  const upload = await db
    .select({
      title: UploadRecord.title,
      description: UploadRecord.description,
      channelName: Channel.name,
    })
    .from(UploadRecord)
    .innerJoin(Channel, eq(Channel.id, UploadRecord.channelId))
    .where(eq(UploadRecord.id, uploadRecordId))
    .then((r) => r[0]);
  invariant(upload, `Upload record ${uploadRecordId} not found`);

  const paragraphs = await db
    .select({
      id: TranscriptParagraph.id,
      order: TranscriptParagraph.order,
      text: TranscriptParagraph.text,
      words: TranscriptParagraph.words,
    })
    .from(TranscriptParagraph)
    .where(eq(TranscriptParagraph.uploadRecordId, uploadRecordId))
    .orderBy(asc(TranscriptParagraph.order));
  invariant(
    paragraphs.length > 0,
    `No transcript paragraphs for ${uploadRecordId} — cannot annotate`,
  );

  const paragraphIds = paragraphs.map((p) => p.id);

  if (!options.force) {
    const [{ existing } = { existing: 0 }] = await db
      .select({ existing: count() })
      .from(Annotation)
      .where(inArray(Annotation.paragraphId, paragraphIds));
    if (existing > 0) {
      activityLogger.info(
        `Skipping annotate — ${existing} annotation row(s) already present (force=false)`,
      );
      return {
        paragraphs: paragraphs.length,
        outline: 0,
        bible: 0,
        keyword: 0,
        skipped: 0,
      };
    }
  }

  activityLogger.info(
    `Annotating ${paragraphs.length} paragraphs with ${ANNOTATE_MODEL}`,
  );
  const { annotations, stats } = await runAnnotation(
    paragraphs,
    upload,
    ANNOTATE_MODEL,
    {
      tracking: { activity: 'annotateTranscript', uploadRecordId },
    },
  );

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .delete(Annotation)
      .where(inArray(Annotation.paragraphId, paragraphIds));
    if (annotations.length > 0) {
      await tx
        .insert(Annotation)
        .values(annotations.map((a) => ({ ...a, updatedAt: now })));
    }
  });

  activityLogger.info(
    `Inserted annotations: outline=${stats.outline} bible=${stats.bible} keyword=${stats.keyword} skipped=${stats.skipped}`,
  );
  return {
    paragraphs: stats.paragraphs,
    outline: stats.outline,
    bible: stats.bible,
    keyword: stats.keyword,
    skipped: stats.skipped,
  };
}
