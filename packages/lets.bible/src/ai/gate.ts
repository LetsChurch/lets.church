import {
  aiTelemetry,
  type AiTelemetryContext,
} from '@letschurch/util/server/ai-telemetry';
import { generateText, Output } from 'ai';
import { z } from 'zod';

import { parseModel } from './model';

// The gates that run before the (more expensive) answer generation. Two
// decisions:
//   1. Is this a VERSE RECOLLECTION worth the detective loop (multi-strategy
//      cross-translation retrieval + streamed reasoning), or a cheap topical
//      question? (`recollectionGate` → `classifyVerseRecollection`)
//   2. On the cheap path, is the query even about Scripture/faith, or should we
//      decline outright? (`classifyScriptureAnswerable`)
// Both nano calls fail-soft: recollection → false (don't dig when unsure; the
// loop costs money), answerable → true (let the model try rather than suppress a
// good answer). Bare references never reach here (the client skips them —
// they're navigation).

// A verse recollection is a phrase, not a single keyword. One-token queries are
// topical/keyword browses and never worth the loop; anything longer is handed to
// the nano classifier, which digs ONLY for an actual "find this remembered
// verse" intent (a paraphrase, a partial quote, a suspected misquote, a
// remembered reference). Verse fragments are SHORT ("train up a child", "be
// still"), so — unlike the web app's story gate (6-token floor) — we route from
// 2 tokens up.
const RECOLLECTION_MIN_TOKENS = 2;
// Boolean-operator markers → treat as a lexical query, not a recollection. Note
// we do NOT treat ':' as an operator here (unlike the web app's field-filter
// syntax): a colon is a normal part of a verse reference ("John 3:16"), which is
// exactly the recollection shape we want to catch.
const OPERATOR_RE = /\b(AND|OR|NOT)\b/;

// A Scripture reference embedded in a longer phrase: a book-ish word (optionally
// prefixed by a number, e.g. "1 John") followed by a chapter (and optional
// verse), e.g. "John 3:16", "Romans 8", "Galatians 6", "Psalm 24". Looser than
// `parseReference` (which must match the WHOLE string) so it fires on a
// reference sitting inside remembered wording ("John 3:17, for God so loved…").
const REFERENCE_RE = /\b(?:[123]\s+)?[A-Za-z]{2,}\s+\d{1,3}(?::\d{1,3})?\b/;

// Interrogative openers / a question mark → a topical QUESTION, not a
// recollection, even when it names a passage ("what does Romans 8 say about
// suffering"). Keeps a reference-bearing question on the cheap path.
const QUESTION_RE =
  /\?|^\s*(what|how|why|who|whom|whose|where|when|which|is|are|was|were|does|do|did|can|could|should|would|will|explain|describe|define|summarize|tell me|give me|list)\b/i;

// 'dig' → run the detective loop outright; 'summarize' → the cheap topical
// answer path; 'ambiguous' → let the nano classifier decide. (No 'skip': the
// client already filters bare references, and every query that reaches the route
// gets SOME answer treatment.)
export type DigDecision = 'dig' | 'summarize' | 'ambiguous';

/**
 * Deterministic, cheap first pass:
 *   - a single keyword is topical (cheap path);
 *   - a NON-question phrase that embeds a Scripture reference is a
 *     recollection/verification ("John 3:17, for God so loved the world",
 *     "Psalm 24 the Lord is my shepherd") → dig outright, since a reference paired
 *     with remembered wording is definitionally something to locate/verify;
 *   - everything else is handed to the nano recollection classifier, which digs
 *     only for an actual "find this remembered verse" intent, so a plain topical
 *     question ("what does the Bible say about anxiety") stays cheap.
 */
export function recollectionGate(query: string): DigDecision {
  const trimmed = query.trim();
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (OPERATOR_RE.test(trimmed) || tokens.length < RECOLLECTION_MIN_TOKENS) {
    return 'summarize';
  }
  // A reference embedded in a longer, non-question phrase → verify it.
  if (
    tokens.length >= 3 &&
    !QUESTION_RE.test(trimmed) &&
    REFERENCE_RE.test(trimmed)
  ) {
    return 'dig';
  }
  return 'ambiguous';
}

const RECOLLECTION_SYSTEM = `You decide whether a Bible search query is a VERSE RECOLLECTION: the user trying to RE-FIND or VERIFY a specific remembered verse, quote, reference, or well-known saying — as opposed to asking a general topical/doctrinal QUESTION.

The clearest structural tell: a recollection is a DECLARATIVE phrase, quote, saying, or reference (something the user is quoting or half-remembering); a topical question is INTERROGATIVE ("what/how/why/who…", "explain…", "is … necessary"). When the query is a bare declarative phrase or saying — not a question — it is almost always a recollection.

Output {"isRecollection": true} when the query points at ONE specific verse OR a specific remembered saying the user has in mind. Strong tells:
- it quotes or paraphrases the WORDING of a specific verse ("a soft answer turns away wrath", "train up a child", "faith is the substance of things hoped for", "be still"), and/or
- it PAIRS a reference with remembered wording ("John 3:17, for God so loved the world", "Romans 8:29 all things work together for good", "the fruit of the Spirit in Galatians 6") — ALWAYS a recollection, even (especially) when the reference is wrong, and/or
- it is a well-known SAYING the user likely believes is Scripture — including a common MISQUOTE or proverbial phrase that is NOT actually in the Bible ("God helps those who help themselves", "cleanliness is next to godliness", "the Lord works in mysterious ways", "everything happens for a reason", "hate the sin but love the sinner", "money is the root of all evil"). Locating/verifying such a phrase (and telling the user it isn't a verse) IS a recollection.
CRUCIALLY the details may be WRONG — wrong reference, wrong wording, or the wording of a DIFFERENT translation than the one being read. Wrong details are EXACTLY what recollections have.

Output {"isRecollection": false} ONLY for a genuine QUESTION or topic browse with no single verse/saying being quoted: "what does the Bible say about anxiety", "how should Christians handle anger", "who is Melchizedek", "explain the Trinity", "is baptism necessary for salvation", or a bare topic ("forgiveness", "the armor of God"). When in doubt between a recollection and a question — if the query is a declarative phrase, quote, or saying rather than an actual question — choose true.

Examples → true:
- "a soft answer turns away wrath" → true (remembered wording)
- "John 3:17 for God so loved the world" → true (reference + wording; the reference is wrong)
- "the fruit of the Spirit in Galatians 6" → true (reference + wording; wrong chapter)
- "Psalm 24 the Lord is my shepherd" → true (reference + wording; wrong psalm)
- "study to shew thyself approved" → true (remembered wording, likely a different translation)
- "God helps those who help themselves" → true (a saying the user thinks is a verse)
- "cleanliness is next to godliness" → true (proverbial misquote to verify)
- "everything happens for a reason" → true (saying commonly believed to be a verse)
- "the Lord works in mysterious ways" → true (saying commonly believed to be a verse)
- "be still" → true (a short remembered verse fragment)

Examples → false:
- "what does the Bible say about anxiety" → false (topical question)
- "how do I forgive someone who hurt me" → false (question)
- "who was King David" → false
- "explain justification by faith" → false (doctrine)
- "is baptism necessary for salvation" → false (doctrinal question)`;

const recollectionSchema = z.object({ isRecollection: z.boolean() });

/**
 * Nano tie-breaker for the 'ambiguous' case of `recollectionGate`. Returns true
 * when the query reads like the user trying to locate/verify a specific
 * remembered verse (worth the cross-translation detective loop). Fail-soft to
 * FALSE — don't dig when unsure.
 */
export async function classifyVerseRecollection(
  query: string,
  telemetryContext?: AiTelemetryContext,
): Promise<boolean> {
  try {
    const { output } = await generateText({
      model: parseModel,
      output: Output.object({ schema: recollectionSchema }),
      instructions: RECOLLECTION_SYSTEM,
      prompt: `Query: ${query}`,
      ...aiTelemetry('letsbible.classify-recollection', telemetryContext),
    });
    return output.isRecollection;
  } catch (err) {
    console.warn(
      'lets.bible recollection gate failed (not digging):',
      err instanceof Error ? err.message : String(err),
    );
    return false;
  }
}

const ANSWERABLE_SYSTEM = `You are a relevance gate for a Bible study assistant. Decide whether a query is a question or topic the assistant should answer FROM SCRIPTURE and the Christian faith.

Output {"answerable": true} for anything about the Bible, its teaching, meaning, characters, history, Christian doctrine, or the Christian life — including broad topics ("anxiety", "forgiveness", "marriage", "money"), which the assistant answers by pointing to what Scripture says.

Output {"answerable": false} ONLY when the query is clearly NOT about the Bible or Christian faith and could not be answered from Scripture — e.g. "how do I bake sourdough bread", "what's the weather", "write me a Python function", "who won the 2024 election". A question ABOUT another religion's own scriptures ("what does the Quran teach about Jesus") is also false — this assistant answers from the Bible, not other scriptures.

When in doubt, prefer true.`;

const answerableSchema = z.object({ answerable: z.boolean() });

/**
 * Cheap-path gate: is this query answerable from Scripture at all? Lets the
 * route decline off-topic queries ("how do I bake bread") in one plain sentence
 * instead of forcing the model to answer from nearest (irrelevant) verses.
 * Fail-soft to TRUE — let the model attempt rather than suppress a good answer.
 */
export async function classifyScriptureAnswerable(
  query: string,
  telemetryContext?: AiTelemetryContext,
): Promise<boolean> {
  try {
    const { output } = await generateText({
      model: parseModel,
      output: Output.object({ schema: answerableSchema }),
      instructions: ANSWERABLE_SYSTEM,
      prompt: `Query: ${query}`,
      ...aiTelemetry('letsbible.classify-answerable', telemetryContext),
    });
    return output.answerable;
  } catch (err) {
    console.warn(
      'lets.bible answerable gate failed (allowing answer):',
      err instanceof Error ? err.message : String(err),
    );
    return true;
  }
}
