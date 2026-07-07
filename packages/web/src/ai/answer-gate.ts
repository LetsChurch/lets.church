import { createChatCompletionTracked } from '@letschurch/temporal/util/llm';
import { z } from 'zod';

import logger from '@/util/logger';

const moduleLogger = logger.child({ module: 'ai/answer-gate' });

const { OPENROUTER_SEARCH_PARSE_MODEL } = z
  .object({
    // Same cheap nano tier used for query parsing — reused here for the
    // answerability pre-check so it can be tuned independently of the agent.
    OPENROUTER_SEARCH_PARSE_MODEL: z.string().default('openai/gpt-5.4-nano'),
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
 * Cheap nano gate run before the (more expensive) answer agent. Classifies the
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
