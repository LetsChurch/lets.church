import { createChatCompletionTracked } from '@letschurch/temporal/util/llm';
import { z } from 'zod';

import logger from '@/util/logger';

const moduleLogger = logger.child({ module: 'ai/answer-gate' });

const { OPENROUTER_SEARCH_PARSE_MODEL } = z
  .object({
    // Same model setting used for query parsing — reused here for the
    // answerability pre-check so it can be tuned independently of the agent.
    OPENROUTER_SEARCH_PARSE_MODEL: z.string().default('openai/gpt-5.6-luna'),
  })
  .parse(process.env);

// How the answer card should respond, given the query + retrieved passages.
export type AnswerMode = 'answer' | 'overview' | 'decline';

const responseJsonSchema = {
  name: 'answerMode',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      mode: { type: 'string', enum: ['answer', 'overview', 'decline'] },
    },
    required: ['mode'],
  },
} as const;

const ResultSchema = z.object({
  mode: z.enum(['answer', 'overview', 'decline']),
});

const SYSTEM = `You are a relevance gate for a Christian sermon/teaching video search engine. Given a user's query and transcript passages retrieved from the library, classify how the answer card should respond. Output exactly one "mode":

The query may be a full question OR just a short topic/keyword phrase (e.g. "biblical counseling", "church discipline", "pitch meeting"). Treat a bare phrase as "show me what the library has on this topic" — it does NOT have to be phrased as a question to deserve an answer or overview.

- "answer": The passages directly address the query's subject and contain enough substance to give a grounded answer.
- "overview": The passages are genuinely ABOUT the query's subject (the same topic), but don't fully or directly answer it — a short, grounded overview of that related material is still useful. This is the right choice for most topic/keyword queries whose passages are on-topic.
- "decline": Retrieval missed — the query's subject does NOT appear in the passages at all (they are about a wholly DIFFERENT subject, or are incoherent fragments). Do NOT decline merely because the passages lack a tidy, direct answer.

Identity questions ("who is X" / "what is X"): if X is the author, the speaker, or a subject of the passages — even when they give no formal biography or definition — choose "answer". You can identify X by their role and the work attributed to them (e.g. passages from X's own book or sermon let you answer "who is X" as its author/teacher). Only "decline" when X is entirely absent from the passages.

Critical bias: when the passages are genuinely on the query's topic, choose "answer" or "overview" — almost NEVER "decline". Reserve "decline" for passages that are clearly about something else. Example of a correct decline: a "who is <person>" query whose passages never mention that person at all and instead discuss an unrelated doctrine.

Prefer "answer" when the passages clearly support one. Output ONLY the JSON object.`;

/**
 * Answerability gate run before the answer agent. Classifies the
 * retrieved passages relative to the query into:
 *   - 'answer'  → generate a direct, grounded answer
 *   - 'overview'→ summarize the on-topic-but-incomplete related material
 *   - 'decline' → retrieval missed; say we couldn't find it (never pivot to
 *                 unrelated material)
 * Fail-soft: on any model/parse error it returns 'answer' (let the agent try)
 * rather than suppressing a possibly-good answer. Empty sources → 'decline'.
 * The call is recorded in `llm_call` (activity `searchAnswerGate`).
 */
export async function classifyAnswerMode(
  query: string,
  sourcesBlock: string,
): Promise<AnswerMode> {
  if (!sourcesBlock.trim()) return 'decline';
  try {
    const completion = await createChatCompletionTracked({
      model: OPENROUTER_SEARCH_PARSE_MODEL,
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: `Query: ${query}\n\nRetrieved passages:\n${sourcesBlock}`,
        },
      ],
      response_format: { type: 'json_schema', json_schema: responseJsonSchema },
      tracking: { activity: 'searchAnswerGate' },
    });
    const content = completion.choices[0]?.message.content ?? '';
    const cleaned = content
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '');
    return ResultSchema.parse(JSON.parse(cleaned)).mode;
  } catch (err) {
    moduleLogger.warn(
      { context: { error: err instanceof Error ? err.message : String(err) } },
      'Answer mode gate failed; allowing a direct answer attempt',
    );
    return 'answer';
  }
}

// --- Recollection gate: when to run the expensive detective loop ---

// A natural-language recollection is a sentence, not a keyword. Below this token
// count a query is navigational/topical and never worth the deep loop.
const RECOLLECTION_MIN_TOKENS = 6;
// Operator / filter-syntax / quoted-id markers → navigational, never dig.
const OPERATOR_RE = /[":<>()]|\b(AND|OR|NOT)\b/;

// 'dig' → run the detective loop; 'summarize' → the existing cheap answer/
// overview path; 'skip' → clearly navigational (also handled by the cheap path);
// 'ambiguous' → let the model tie-breaker decide.
export type DigDecision = 'dig' | 'summarize' | 'skip' | 'ambiguous';

/**
 * Deterministic, cheap first pass deciding whether a query might be a
 * RECOLLECTION worth the expensive detective loop versus the cheap
 * summarize/answer path. IMPORTANT: a natural-language question is NOT by itself
 * a recollection — most questions ("what does X argue about Y") are answered
 * perfectly well by the cheap answer/overview path, and running them through the
 * detective loop makes it hunt for a "story" that isn't there (forced
 * corrections / false declines). So this NEVER returns 'dig' outright: the only
 * signals that a real "re-find a specific remembered moment" intent exists (an NL
 * question, or a thin Lane-1 that keywords missed) are handed to the model
 * classifier via 'ambiguous', which digs ONLY for an actual recollection. A plain
 * on-topic browse (no question, healthy cosine) skips the classifier call.
 * See docs/agentic-search-overview.md ("The gate — when to dig").
 */
export function recollectionGate(args: {
  query: string;
  isAnswerWorthy: boolean;
  topCosine: number | null;
}): DigDecision {
  const trimmed = args.query.trim();
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (OPERATOR_RE.test(trimmed) || tokens.length <= 2) return 'skip';
  if (tokens.length < RECOLLECTION_MIN_TOKENS) return 'summarize';
  // Any substantive natural-language query → hand to the model recollection
  // classifier. IMPORTANT: do NOT gate this on `isAnswerWorthy`/thin-cosine.
  // Recollections are frequently NOUN PHRASES ("the story where James White met
  // his first two missionaries", "James White's granddaughter and the Jehovah's
  // Witnesses") — not questions — and they often retrieve a healthy (non-thin)
  // cosine, so gating on question-ness meant those never reached the classifier
  // and got a cheap-path answer or, worse, a cold decline. The classifier
  // returns false for genuine questions/topics (which then take the
  // answer/overview path), closing the recollection under-trigger.
  // (`isAnswerWorthy` /
  // `topCosine` stay in the signature for future tuning.)
  return 'ambiguous';
}

const recollectionJsonSchema = {
  name: 'recollection',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: { isRecollection: { type: 'boolean' } },
    required: ['isRecollection'],
  },
} as const;

const RecollectionResultSchema = z.object({ isRecollection: z.boolean() });

const RECOLLECTION_SYSTEM = `You decide whether a search query is a RECOLLECTION: the user trying to RE-FIND a specific remembered MOMENT — a story, an anecdote, a particular scene, or a line someone said — as opposed to a general question or topic browse.

Output {"isRecollection": true} when the query points to ONE specific episode. The strongest tells:
- it names a SPECIFIC PERSON in a SPECIFIC SCENE doing something (e.g. "his granddaughter talking with missionaries at the door", "the caller who argued about baptism", "when he met his first two missionaries in college"), and/or
- it quotes or paraphrases a specific LINE someone said ("she asked, 'is it true you aren't allowed to talk to us?'"), and/or
- it opens like a retold memory ("the story/time/episode where…", "that segment about…", "he went off about…", "remind me what he said about…").
An embedded question or quoted line does NOT make it a general question — a remembered quote is part of the scene the user wants to locate. CRUCIALLY: the details may be WRONG — a wrong name (Smith and Young for Reed and Reese), a wrong relation (grandson for granddaughter), a wrong group (Catholic priest / Jehovah's Witnesses for Mormons), a wrong setting (Christmas for Easter). Wrong details are EXACTLY what recollections have, and a query with a specific person+action+scene is a recollection even when a detail looks off or when it makes the underlying event sound implausible. When in doubt between "recollection" and "question", if there is a specific person doing a specific thing in a specific scene, choose true.

Output {"isRecollection": false} ONLY for a GENERAL question about what someone teaches/argues/believes with no specific scene ("what does he say about the papacy", "how does he define sola scriptura", "what are the five solas"), or a bare topic/keyword ("church discipline", "textual criticism").

Examples → answer:
- "James White's granddaughter talking with Jehovah's Witnesses, is it true that you aren't allowed to talk to us" → true (specific person + scene + a quoted line)
- "the story where James White meets his first two Mormon missionaries, elders Smith and Young, in college" → true (specific scene + names, even though the names are wrong)
- "the story where his grandson handed a tract to Mormon missionaries at a pageant" → true (specific scene; "grandson" may be a misremembered "granddaughter")
- "James White's granddaughter Clementine witnessing to a Catholic priest on the street" → true (named person + scene; the group may be misremembered)
- "there was a segment where he talked about how Mormons changed their teaching about temple garments" → true (a retold specific segment)
- "the episode where he tells the story about the roller coaster" → true
- "how does James White respond to the Roman Catholic view of the papacy" → false (general question, no specific scene)
- "textual criticism of the New Testament" → false (topic)`;

/**
 * Nano tie-breaker for the 'ambiguous' case of `recollectionGate`. Returns true
 * when the query reads like a specific recollection worth the detective loop.
 * Fail-soft to FALSE (don't dig when unsure — digging costs money). Recorded in
 * `llm_call` (activity `searchRecollectionGate`).
 */
export async function classifyRecollection(query: string): Promise<boolean> {
  try {
    const completion = await createChatCompletionTracked({
      model: OPENROUTER_SEARCH_PARSE_MODEL,
      messages: [
        { role: 'system', content: RECOLLECTION_SYSTEM },
        { role: 'user', content: `Query: ${query}` },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: recollectionJsonSchema,
      },
      tracking: { activity: 'searchRecollectionGate' },
    });
    const content = completion.choices[0]?.message.content ?? '';
    const cleaned = content
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '');
    return RecollectionResultSchema.parse(JSON.parse(cleaned)).isRecollection;
  } catch (err) {
    moduleLogger.warn(
      { context: { error: err instanceof Error ? err.message : String(err) } },
      'Recollection gate failed; not digging',
    );
    return false;
  }
}
