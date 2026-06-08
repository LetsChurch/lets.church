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

const responseJsonSchema = {
  name: 'answerability',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      answerable: { type: 'boolean' },
    },
    required: ['answerable'],
  },
} as const;

const ResultSchema = z.object({ answerable: z.boolean() });

const SYSTEM = `You are a relevance gate for a Christian sermon/teaching video search engine. Given a user's question and transcript passages retrieved from the library, decide ONE thing: are the passages on-topic enough to attempt a grounded answer?

Answer "answerable": true when the passages discuss the question's subject OR closely related material that could support at least a partial, useful answer — even if they don't give a complete or formal definition. Lean toward true whenever the passages are clearly about the topic.

Answer "answerable": false ONLY when retrieval clearly missed: the passages are about a different subject, mention the topic merely in passing, or are incoherent fragments with no substantive content on it. Example of false: a "who is <person>" question where the passages never describe that person and are about an unrelated topic.

Output ONLY the JSON object.`;

/**
 * Cheap nano pre-check: would the retrieved passages let us actually answer the
 * question? Runs before the (more expensive) answer agent so we can skip
 * generating an ungrounded "I couldn't find anything" response. Fail-soft: on
 * any model/parse error it returns true (let the agent try) rather than
 * suppressing a possibly-good answer. The call is recorded in `llm_call`
 * (activity `searchAnswerGate`).
 */
export async function isAnswerableFromSources(
  query: string,
  sourcesBlock: string,
): Promise<boolean> {
  if (!sourcesBlock.trim()) return false;
  try {
    const completion = await createChatCompletionTracked({
      model: OPENROUTER_SEARCH_PARSE_MODEL,
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: `Question: ${query}\n\nRetrieved passages:\n${sourcesBlock}`,
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
    return ResultSchema.parse(JSON.parse(cleaned)).answerable;
  } catch (err) {
    moduleLogger.warn(
      { context: { error: err instanceof Error ? err.message : String(err) } },
      'Answerability gate failed; allowing the answer through',
    );
    return true;
  }
}
