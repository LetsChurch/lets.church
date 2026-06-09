import { createChatCompletionTracked } from '@letschurch/temporal/util/llm';
import { z } from 'zod';
import { cacheGetJson, cacheSetJson } from '@/util/cache';
import logger from '@/util/logger';

const moduleLogger = logger.child({ module: 'trpc/search/parse-query' });

// Parsed queries are stable for a given query+day, so a day's TTL is plenty.
const PARSE_CACHE_TTL_SECONDS = 60 * 60 * 24;

const { OPENROUTER_SEARCH_PARSE_MODEL } = z
  .object({
    // Cheap/fast structured-extraction model. Separate env from the
    // summarize/annotate models so search parsing can be tuned independently.
    OPENROUTER_SEARCH_PARSE_MODEL: z.string().default('openai/gpt-5.4-nano'),
  })
  .parse(process.env);

// Date range, both bounds inclusive, date-only (YYYY-MM-DD). Elasticsearch
// rounds a date-only `gte` down to the start of the day and `lte` up to the end
// of the day, so a bare date range is inclusive on both ends with no extra
// time-of-day handling here. Unlike the earlier draft that enumerated every
// individual day in the interval, a single range maps directly onto the
// publishedAt range filter and stays compact for multi-year spans.
const DateRangeSchema = z.object({
  gte: z.string().nullable(),
  lte: z.string().nullable(),
});

// Raw shape the model returns (nullable arrays). Normalized to non-null arrays
// by `parseSearchQuery` before callers see it.
const RawParsedQuerySchema = z.object({
  questions: z.array(z.string()).nullable(),
  quotes: z.array(z.string()).nullable(),
  speakers: z.array(z.string()).nullable(),
  channels: z.array(z.string()).nullable(),
  objects: z.array(z.string()).nullable(),
  keywords: z.array(z.string()).nullable(),
  dates: DateRangeSchema.nullable(),
});

export type ParsedQuery = {
  /** Questions the user is asking (drives the streamed-answer branch). */
  questions: string[];
  /** Verbatim quoted phrases to match exactly. */
  quotes: string[];
  /** Person names attributed as speakers (no identity library yet — folded
   * into lexical text + a UI notice; never an index filter). */
  speakers: string[];
  /** Free-text channel / ministry names to resolve to channel filters. */
  channels: string[];
  /** Visual objects (no image embeddings yet — folded into lexical text). */
  objects: string[];
  /** Residual semantic search terms. */
  keywords: string[];
  /** Published-at range, or null if the query implies no time bound. */
  dates: { gte: string | null; lte: string | null } | null;
};

// JSON Schema mirror of RawParsedQuerySchema for OpenAI/OpenRouter structured
// output (strict mode requires every property in `required` and
// additionalProperties:false; nullability is expressed with ["type","null"]).
const responseJsonSchema = {
  name: 'parsedSearchQuery',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      questions: { type: ['array', 'null'], items: { type: 'string' } },
      quotes: { type: ['array', 'null'], items: { type: 'string' } },
      speakers: { type: ['array', 'null'], items: { type: 'string' } },
      channels: { type: ['array', 'null'], items: { type: 'string' } },
      objects: { type: ['array', 'null'], items: { type: 'string' } },
      keywords: { type: ['array', 'null'], items: { type: 'string' } },
      dates: {
        type: ['object', 'null'],
        additionalProperties: false,
        properties: {
          gte: { type: ['string', 'null'] },
          lte: { type: ['string', 'null'] },
        },
        required: ['gte', 'lte'],
      },
    },
    required: [
      'questions',
      'quotes',
      'speakers',
      'channels',
      'objects',
      'keywords',
      'dates',
    ],
  },
} as const;

function systemPrompt(todayIso: string): string {
  return `You parse a media-search query for a Christian sermon/teaching video library into structured fields. Today's date is ${todayIso}; resolve every relative date expression against it.

Extract these fields:
- questions: Questions to answer for the user. Include BOTH literal questions AND non-interrogative information needs that call for a synthesized, multi-source answer — an explanation, examples, a comparison, or "what Scripture/teaching says about X". Reformulate such a need into the natural question it implies (e.g. "Bible examples of free, grace-based giving" -> "What are some Bible examples of free, grace-based giving?"; "passages about suffering and hope" -> "What do the Scriptures say about suffering and hope?"). A query can be both a question AND have other fields. Do NOT treat these as questions: navigational lookups for a specific channel, ministry, or speaker; requests to browse or list media; or bare topic/keyword queries where a plain list of videos is the natural result. Use null when none applies.
- quotes: Text the user wants matched verbatim — quoted in the query, or clearly a quotation being looked up.
- speakers: Names or identities of people credited with speaking (e.g. "James White", "Dr. Robinson", "Pastor Bill"). Only real personal names/titles, not channels or topics.
- channels: Names of sources, ministries, churches, shows, or channels (e.g. "Apologia", "Cornerstone Baptist Church").
- objects: Visual objects or imagery the user wants to find (e.g. "cat shirt", "colorful sweater").
- keywords: The core topical search terms — the residual concepts to search for after the above are removed. Keep these even when other fields are present.
- dates: A single inclusive publish-date range as { "gte": "YYYY-MM-DD" | null, "lte": "YYYY-MM-DD" | null }, or null when the query implies no time bound. Resolve relative expressions ("last week", "since 2020", "before Easter") to absolute YYYY-MM-DD bounds against today. Use only one open bound when the query is one-sided ("since 2020" -> gte only; "before 2019" -> lte only). Do not invent a range when none is implied.

Rules:
- Set a field to null when it does not apply (do not output empty arrays).
- Do not put the same span in multiple incompatible fields; prefer the most specific (a person name -> speakers, not keywords).
- Output ONLY the JSON object, no commentary.`;
}

const FALLBACK = (query: string): ParsedQuery => ({
  questions: [],
  quotes: [],
  speakers: [],
  channels: [],
  objects: [],
  keywords: [query.trim()].filter(Boolean),
  dates: null,
});

function normalize(raw: z.infer<typeof RawParsedQuerySchema>): ParsedQuery {
  const arr = (v: string[] | null) =>
    (v ?? []).map((s) => s.trim()).filter(Boolean);
  const dates =
    raw.dates && (raw.dates.gte || raw.dates.lte)
      ? { gte: raw.dates.gte, lte: raw.dates.lte }
      : null;
  return {
    questions: arr(raw.questions),
    quotes: arr(raw.quotes),
    speakers: arr(raw.speakers),
    channels: arr(raw.channels),
    objects: arr(raw.objects),
    keywords: arr(raw.keywords),
    dates,
  };
}

/**
 * Parse a raw search query into structured fields with gpt-5.4-nano. Always
 * resolves — on any model/parse/validation error it falls back to treating the
 * whole query as keywords, so search never breaks because parsing did. The LLM
 * call is recorded in `llm_call` (activity `searchParseQuery`).
 */
export async function parseSearchQuery(
  query: string,
  { now = new Date() }: { now?: Date } = {},
): Promise<ParsedQuery> {
  const trimmed = query.trim();
  if (!trimmed) return FALLBACK(query);

  const todayIso = now.toISOString().slice(0, 10);

  // Cache the parse so the same query parses identically across requests (e.g.
  // every page of a paginated search), making the derived filters/quotes
  // deterministic. Keyed by model + day (relative dates resolve against today)
  // + the query. Best-effort: a cache miss/outage just re-parses.
  const cacheKey = `search-parse:v3:${OPENROUTER_SEARCH_PARSE_MODEL}:${todayIso}:${trimmed}`;
  const cached = await cacheGetJson<ParsedQuery>(cacheKey);
  if (cached) return cached;

  try {
    const completion = await createChatCompletionTracked({
      model: OPENROUTER_SEARCH_PARSE_MODEL,
      messages: [
        { role: 'system', content: systemPrompt(todayIso) },
        { role: 'user', content: trimmed },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: responseJsonSchema,
      },
      tracking: { activity: 'searchParseQuery' },
    });

    const content = completion.choices[0]?.message.content ?? '';
    // Strip a ```json fence if the provider wraps the object despite the
    // structured-output request (mirrors summarize-upload's defensive parse).
    const cleaned = content
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '');
    const raw = RawParsedQuerySchema.parse(JSON.parse(cleaned));
    const result = normalize(raw);
    // Only successful parses are cached (never the keyword-only fallback).
    await cacheSetJson(cacheKey, result, PARSE_CACHE_TTL_SECONDS);
    return result;
  } catch (err) {
    moduleLogger.warn(
      {
        context: {
          error: err instanceof Error ? err.message : String(err),
          query: trimmed,
        },
      },
      'Search query parse failed; falling back to keyword-only',
    );
    return FALLBACK(query);
  }
}
