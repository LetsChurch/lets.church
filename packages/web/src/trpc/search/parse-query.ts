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

// The UI's coarse "current period" date buckets (mirrors the Date facet's
// options). When the query asks for one of these exactly, we suggest the bucket
// itself so it lights up the facet and reuses the UI's own date math; any other
// time expression resolves to an absolute `dates` range instead.
export const DATE_BUCKETS = [
  'today',
  'this-week',
  'this-month',
  'this-year',
] as const;
export type DateBucket = (typeof DATE_BUCKETS)[number];

// Raw shape the model returns (nullable arrays). Normalized to non-null arrays
// by `parseSearchQuery` before callers see it.
const RawParsedQuerySchema = z.object({
  questions: z.array(z.string()).nullable(),
  speakers: z.array(z.string()).nullable(),
  channels: z.array(z.string()).nullable(),
  dateRange: z.enum(DATE_BUCKETS).nullable(),
  dates: DateRangeSchema.nullable(),
  dateLabel: z.string().nullable(),
});

// The parser is an AI-*enhancement* pass: results + channel facets are already
// shown from the (non-LLM) hybrid search, so this only extracts the few fields
// that refine the UI after the fact. Quoted phrases are handled deterministically
// (extractQuotedPhrases); keywords/objects were never consumed (search runs on
// the raw query), so they're intentionally not extracted.
export type ParsedQuery = {
  /** Reformulated question(s) — frame the (best-effort) streamed answer. */
  questions: string[];
  /** Person names credited as speakers (no identity library yet — drives a UI
   * notice only; never an index filter). */
  speakers: string[];
  /** Channel(s) the query is seeking, selected from the grounded candidate
   * facets passed in — drives the channel-filter suggestion. */
  channels: string[];
  /** A current-period UI bucket ("this week", …) when the query asks for one
   * exactly — suggested as that facet bucket. Mutually exclusive with `dates`. */
  dateRange: DateBucket | null;
  /** Absolute published-at range for any other time bound, or null. */
  dates: { gte: string | null; lte: string | null } | null;
  /** Short relative label ("Past month", "Last year") when `dates` came from a
   * relative expression — drives the date suggestion chip's text. Null for an
   * absolute range (the chip formats the dates) or when there's no range. */
  dateLabel: string | null;
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
      speakers: { type: ['array', 'null'], items: { type: 'string' } },
      channels: { type: ['array', 'null'], items: { type: 'string' } },
      dateRange: {
        type: ['string', 'null'],
        enum: [...DATE_BUCKETS, null],
      },
      dates: {
        type: ['object', 'null'],
        additionalProperties: false,
        properties: {
          gte: { type: ['string', 'null'] },
          lte: { type: ['string', 'null'] },
        },
        required: ['gte', 'lte'],
      },
      dateLabel: { type: ['string', 'null'] },
    },
    required: [
      'questions',
      'speakers',
      'channels',
      'dateRange',
      'dates',
      'dateLabel',
    ],
  },
} as const;

function systemPrompt(todayIso: string, candidateChannels?: string[]): string {
  // Channels are grounded in the real facet candidates (channels that actually
  // have results for this query), so the suggestion can only ever be a real,
  // useful filter — never a hallucinated or zero-result channel name.
  const channelsRule =
    candidateChannels && candidateChannels.length > 0
      ? `- channels: From the CANDIDATE CHANNELS listed below, return the one(s) the query is clearly seeking — a navigational/source query like "the dorean principle" or "Apologia on baptism". Echo the candidate's name verbatim. Include a candidate ONLY when the query specifically targets that source; for a general topical query leave it null. Never output a channel that is not in the candidate list.`
      : `- channels: Leave null (no candidate channels are available for this query).`;

  const candidateSection =
    candidateChannels && candidateChannels.length > 0
      ? `\n\nCANDIDATE CHANNELS (these have results for this query):\n${candidateChannels.map((c) => `- ${c}`).join('\n')}`
      : '';

  return `You enrich a media-search query for a Christian sermon/teaching video library. The matching videos and channel facets are ALREADY shown to the user by a separate (non-AI) search — your job is only to extract a few optional fields that refine the experience after the fact. Today's date is ${todayIso}; resolve every relative date expression against it.

Extract these fields:
- questions: Questions to answer for the user. Include BOTH literal questions AND non-interrogative information needs that call for a synthesized, multi-source answer — an explanation, examples, a comparison, or "what Scripture/teaching says about X". Reformulate such a need into the natural question it implies (e.g. "Bible examples of free, grace-based giving" -> "What are some Bible examples of free, grace-based giving?"; "passages about suffering and hope" -> "What do the Scriptures say about suffering and hope?"). Do NOT treat as questions: navigational lookups for a specific channel/ministry/speaker, requests to browse or list media, or bare topic/keyword queries where a plain list of videos is the natural result. Use null when none applies.
- speakers: Names or identities of people credited with speaking (e.g. "James White", "Dr. Robinson", "Pastor Bill"). Only real personal names/titles, not channels or topics.
${channelsRule}
- dateRange: If (and ONLY if) the query asks for one of these exact current-period spans, set it to the matching value and leave \`dates\` and \`dateLabel\` null: "today" -> "today"; "this week" -> "this-week"; "this month" -> "this-month"; "this year" -> "this-year". For any other time expression, leave dateRange null.
- dates: For any OTHER time bound — absolute ("in 2021", "since 2020", "before 2019") OR a relative span that is NOT a current-period bucket ("past month", "last year", "last week", "recently", "last 90 days") — set a single inclusive { "gte": "YYYY-MM-DD" | null, "lte": "YYYY-MM-DD" | null } resolved against today (use one open bound for one-sided queries: "since 2020" -> gte only; "before 2019" -> lte only). Leave null when the query implies no time bound OR when dateRange is set.
- dateLabel: When you fill \`dates\` from a RELATIVE expression, a short Title Case label of how the user phrased it ("Past month", "Last year", "Last week", "Recently"). Null when \`dates\` is an absolute calendar range, or when \`dates\` is null.

Rules:
- Set a field to null when it does not apply (do not output empty arrays). Never set both dateRange and dates.
- Output ONLY the JSON object, no commentary.${candidateSection}`;
}

// Verbatim phrases the user double-quoted, using straight ("…") or curly
// (“…”) double quotes. Deterministic (no LLM), so the hybrid search's
// `match_phrase` boost is stable across pages and never waits on the (now
// decoupled) query parse. Returns each balanced pair's inner text, trimmed,
// non-empty, de-duplicated. Apostrophes / single quotes are intentionally
// ignored (they'd swallow contractions like "don't").
const QUOTE_RE = /"([^"]+)"|“([^”]+)”/g;

export function extractQuotedPhrases(query: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const match of query.matchAll(QUOTE_RE)) {
    const phrase = (match[1] ?? match[2] ?? '').trim();
    if (!phrase || seen.has(phrase)) continue;
    seen.add(phrase);
    out.push(phrase);
  }
  return out;
}

const FALLBACK = (): ParsedQuery => ({
  questions: [],
  speakers: [],
  channels: [],
  dateRange: null,
  dates: null,
  dateLabel: null,
});

function normalize(raw: z.infer<typeof RawParsedQuerySchema>): ParsedQuery {
  const arr = (v: string[] | null) =>
    (v ?? []).map((s) => s.trim()).filter(Boolean);
  // A current-period bucket wins and is mutually exclusive with an absolute
  // range; the relative label only applies when there's an absolute range.
  const dateRange = raw.dateRange;
  const dates =
    !dateRange && raw.dates && (raw.dates.gte || raw.dates.lte)
      ? { gte: raw.dates.gte, lte: raw.dates.lte }
      : null;
  const dateLabel = dates ? raw.dateLabel?.trim() || null : null;
  return {
    questions: arr(raw.questions),
    speakers: arr(raw.speakers),
    channels: arr(raw.channels),
    dateRange,
    dates,
    dateLabel,
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
  {
    now = new Date(),
    candidateChannels,
  }: { now?: Date; candidateChannels?: string[] } = {},
): Promise<ParsedQuery> {
  const trimmed = query.trim();
  if (!trimmed) return FALLBACK();

  const todayIso = now.toISOString().slice(0, 10);

  // Cache the parse so the same query parses identically across requests (e.g.
  // every page of a paginated search). Keyed by model + day (relative dates
  // resolve against today) + the candidate channel set (which now grounds the
  // `channels` field, so the output is a function of it too) + the query.
  // Best-effort: a cache miss/outage just re-parses.
  const candidateSig = (candidateChannels ?? [])
    .map((c) => c.trim().toLowerCase())
    .sort()
    .join('|');
  const cacheKey = `search-parse:v5:${OPENROUTER_SEARCH_PARSE_MODEL}:${todayIso}:${candidateSig}:${trimmed}`;
  const cached = await cacheGetJson<ParsedQuery>(cacheKey);
  if (cached) return cached;

  try {
    const completion = await createChatCompletionTracked({
      model: OPENROUTER_SEARCH_PARSE_MODEL,
      messages: [
        { role: 'system', content: systemPrompt(todayIso, candidateChannels) },
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
      'Search query parse failed; returning empty enrichment',
    );
    return FALLBACK();
  }
}
