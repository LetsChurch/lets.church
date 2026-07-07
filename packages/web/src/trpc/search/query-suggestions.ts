import { createChatCompletionTracked } from '@letschurch/temporal/util/llm';
import { z } from 'zod';

import { cacheGetJson, cacheSetJson } from '@/util/cache';
import logger from '@/util/logger';

const moduleLogger = logger.child({
  module: 'trpc/search/query-suggestions',
});

// Suggestions are stable for a given query, so a day's TTL is plenty.
const SUGGEST_CACHE_TTL_SECONDS = 60 * 60 * 24;

const MAX_SUGGESTIONS = 5;

const { OPENROUTER_SEARCH_SUGGEST_MODEL } = z
  .object({
    // Same cheap/fast nano default as the parser/related-search, but a separate
    // env so palette query-suggestion generation can be tuned independently.
    OPENROUTER_SEARCH_SUGGEST_MODEL: z.string().default('openai/gpt-5.4-nano'),
  })
  .parse(process.env);

/**
 * Compact corpus grounding pulled from the live palette facets (the same data
 * already on screen), so suggestions skew toward queries that return content.
 */
export type SuggestContext = {
  titles?: string[];
  channels?: string[];
  speakers?: string[];
  books?: string[];
};

const RawSchema = z.object({ suggestions: z.array(z.string()).nullable() });

// Strict structured-output schema (every property required,
// additionalProperties:false, nullability via ["array","null"]).
const responseJsonSchema = {
  name: 'querySuggestions',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      suggestions: { type: ['array', 'null'], items: { type: 'string' } },
    },
    required: ['suggestions'],
  },
} as const;

function systemPrompt(): string {
  return `You suggest search queries for a Christian sermon/teaching video library, shown as a user types into the search box. Given the user's partial query and a sample of what the corpus actually contains (titles, channels, speakers, scripture books that match so far), produce up to ${MAX_SUGGESTIONS} short, distinct searches the user is likely to want — grounded in that corpus context so they return real results.

Rules:
- GROUND every suggestion in the provided context: prefer topics, people, channels, or scripture that appear in the context. Do not invent content the library plainly doesn't have.
- Each suggestion must be FULLY SELF-CONTAINED: it must make complete sense on its own to someone who has not seen the user's query or the context. Write what a person would actually type into a search box from scratch.
- A good suggestion is either a complete question ("How are we sanctified by grace?") or a concrete topic phrase naming its full subject ("Bible verses on God's mercy").
- NEVER use referential words that point at unstated context — no "this", "that", "the principle", "the passage", "the doctrine", etc. Name the actual subject.
- NEVER use trailing fragments like "… explained", "… explored", "… discussed", "… overview". These aren't real searches.
- Build naturally on what the user typed (treat the last word as possibly unfinished), but vary the angle (a definition, an application, a related doctrine, a specific passage, a named speaker).
- Do NOT echo specific video titles back as suggestions — write fresh searches a person would type (questions, topics, scripture, a speaker's name), not the names of individual videos.
- Do not repeat the user's query verbatim, and don't duplicate suggestions. Keep each concise (≈8 words or fewer where natural).
- Output ONLY the JSON object {"suggestions": [...]}.`;
}

function contextBlock(ctx: SuggestContext): string {
  const lines: string[] = [];
  const add = (label: string, items?: string[]) => {
    const vals = (items ?? []).map((s) => s.trim()).filter(Boolean);
    if (vals.length) lines.push(`${label}: ${vals.join(', ')}`);
  };
  add('Matching titles', ctx.titles);
  add('Matching channels', ctx.channels);
  add('Matching speakers', ctx.speakers);
  add('Matching scripture', ctx.books);
  return lines.length ? lines.join('\n') : '(no strong matches yet)';
}

/**
 * Generate grounded, Grok-style search suggestions for the command palette's
 * left column with gpt-5.4-nano. Best-effort: any model/parse error resolves to
 * an empty list so the palette never breaks. Cached by model + query (the corpus
 * context is a deterministic function of the query, so it isn't part of the key).
 * The LLM call is recorded in `llm_call` (activity `searchQuerySuggestions`).
 */
export async function generateQuerySuggestions(
  query: string,
  context: SuggestContext = {},
): Promise<string[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const cacheKey = `search-suggest:v1:${OPENROUTER_SEARCH_SUGGEST_MODEL}:${trimmed}`;
  const cached = await cacheGetJson<string[]>(cacheKey);
  if (cached) return cached;

  try {
    const completion = await createChatCompletionTracked({
      model: OPENROUTER_SEARCH_SUGGEST_MODEL,
      messages: [
        { role: 'system', content: systemPrompt() },
        {
          role: 'user',
          content: `Partial query: ${trimmed}\n\nCorpus context:\n${contextBlock(context)}`,
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: responseJsonSchema,
      },
      tracking: { activity: 'searchQuerySuggestions' },
    });

    const content = completion.choices[0]?.message.content ?? '';
    const cleaned = content
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '');
    const raw = RawSchema.parse(JSON.parse(cleaned));
    const suggestions = (raw.suggestions ?? [])
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => s.toLowerCase() !== trimmed.toLowerCase())
      .slice(0, MAX_SUGGESTIONS);

    await cacheSetJson(cacheKey, suggestions, SUGGEST_CACHE_TTL_SECONDS);
    return suggestions;
  } catch (err) {
    moduleLogger.warn(
      {
        context: {
          error: err instanceof Error ? err.message : String(err),
          query: trimmed,
        },
      },
      'Query suggestions generation failed',
    );
    return [];
  }
}
