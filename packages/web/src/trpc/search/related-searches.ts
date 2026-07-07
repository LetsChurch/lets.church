import { createChatCompletionTracked } from '@letschurch/temporal/util/llm';
import { z } from 'zod';

import { cacheGetJson, cacheSetJson } from '@/util/cache';
import logger from '@/util/logger';

const moduleLogger = logger.child({
  module: 'trpc/search/related-searches',
});

// Suggestions are stable for a given query, so a day's TTL is plenty.
const RELATED_CACHE_TTL_SECONDS = 60 * 60 * 24;

const MAX_RELATED = 6;

const { OPENROUTER_SEARCH_RELATED_MODEL } = z
  .object({
    // Same cheap/fast nano default as the query parser, but a separate env so
    // related-search generation can be tuned independently.
    OPENROUTER_SEARCH_RELATED_MODEL: z.string().default('openai/gpt-5.4-nano'),
  })
  .parse(process.env);

const RawSchema = z.object({ related: z.array(z.string()).nullable() });

// Strict structured-output schema (every property required,
// additionalProperties:false, nullability via ["array","null"]).
const responseJsonSchema = {
  name: 'relatedSearches',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      related: { type: ['array', 'null'], items: { type: 'string' } },
    },
    required: ['related'],
  },
} as const;

function systemPrompt(): string {
  return `You suggest related searches for a Christian sermon/teaching video library. Given the user's query, produce up to ${MAX_RELATED} short, distinct follow-up searches or questions the user is likely to want next.

Rules:
- Each suggestion must be FULLY SELF-CONTAINED: it must make complete sense on its own to someone who has NOT seen the user's query, the results, or any prior context. Write what a person would actually type into a search box from scratch.
- A good suggestion is either a complete question ("How are we sanctified by grace?") or a concrete topic phrase naming its full subject ("Bible verses on God's mercy").
- NEVER use referential or anaphoric words that point at unstated context — no "this", "that", "the principle", "the passage", "the doctrine", "more on it", etc. Name the actual subject instead.
- NEVER use trailing/dangling fragments like "… explained", "… explored", "… discussed", or "… overview". These aren't real searches. (Bad: "Grace, mercy, and the principle explained". Good: "What is the difference between grace and mercy?")
- Stay closely related to the query's topic, but vary the angle (a definition, an application, a related doctrine, a relevant passage).
- Do not repeat the user's query verbatim, and don't duplicate suggestions. Keep each concise (≈8 words or fewer where natural).
- Output ONLY the JSON object {"related": [...]}.`;
}

/**
 * Generate related searches / follow-up questions for a query with
 * gpt-5.4-nano. Best-effort: any model/parse error resolves to an empty list so
 * search never breaks. Cached by model + query (suggestions don't depend on the
 * date, unlike the query parse). The LLM call is recorded in `llm_call`
 * (activity `searchRelatedSearches`).
 */
export async function generateRelatedSearches(
  query: string,
): Promise<string[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  // v2: self-contained-suggestion prompt (no anaphora / dangling fragments).
  const cacheKey = `search-related:v2:${OPENROUTER_SEARCH_RELATED_MODEL}:${trimmed}`;
  const cached = await cacheGetJson<string[]>(cacheKey);
  if (cached) return cached;

  try {
    const completion = await createChatCompletionTracked({
      model: OPENROUTER_SEARCH_RELATED_MODEL,
      messages: [
        { role: 'system', content: systemPrompt() },
        { role: 'user', content: trimmed },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: responseJsonSchema,
      },
      tracking: { activity: 'searchRelatedSearches' },
    });

    const content = completion.choices[0]?.message.content ?? '';
    const cleaned = content
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '');
    const raw = RawSchema.parse(JSON.parse(cleaned));
    const related = (raw.related ?? [])
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => s.toLowerCase() !== trimmed.toLowerCase())
      .slice(0, MAX_RELATED);

    await cacheSetJson(cacheKey, related, RELATED_CACHE_TTL_SECONDS);
    return related;
  } catch (err) {
    moduleLogger.warn(
      {
        context: {
          error: err instanceof Error ? err.message : String(err),
          query: trimmed,
        },
      },
      'Related searches generation failed',
    );
    return [];
  }
}
