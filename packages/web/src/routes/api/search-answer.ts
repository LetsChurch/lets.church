import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import {
  type AnswerSource,
  answerSourceKey,
  SOURCES_DELIMITER,
} from '@/ai/answer-stream';
import { IncomingIdSchema } from '@/schemas/common';
import logger from '@/util/logger';

const moduleLogger = logger.child({ module: 'routes/api/search-answer' });

// Minimum top-video cosine similarity (recovered from the faiss kNN score over
// searchSummaryEmbedding as 2*score - 1) for the query to be considered
// "covered" by the library. Set low — it only kills queries with nothing
// semantically close; the nano gate catches the subtler "retrieved something
// topical but it doesn't actually answer this".
const RELEVANCE_COSINE_FLOOR = 0.3;

// Shown in the answer card when a relevance gate suppresses generation. Concise
// and plain — no retrieval mechanics — matching the agent's own decline style.
const GATED_ANSWER = "I couldn't find anything about that in the library.";

// Cache the final answer payload by query (same TTL as the parse cache) so a
// repeated query is deterministic and skips retrieval + the agent entirely.
const ANSWER_CACHE_TTL_SECONDS = 60 * 60 * 24;

// Tool-call budget for the detective (dig) loop — higher than the cheap path's 8
// because it runs multiple retrieval strategies (grep + windows + hybrid),
// reconciles them, and re-queries after a pivot. Still bounded (a cost control).
const DIG_STEP_BUDGET = 12;

const bodySchema = z.object({
  query: z.string().min(1),
  // The parser's reformulated question (e.g. "Bible examples of grace-based
  // giving" -> "What are some Bible examples of grace-based giving?"). Used to
  // frame the generated answer + the answerability check; retrieval still runs
  // on the raw `query` to preserve recall. Falls back to `query` when absent.
  question: z.string().optional().nullable(),
  // Per search-session conversation thread (multi-turn follow-ups share it).
  threadId: z.string().min(1),
  // Stable per-browser id; only used for anonymous users (logged-in users are
  // keyed by their app user id instead).
  resourceId: z.string().min(1),
  // The search_log_entry row created by hybridSearch for this query; the final
  // answer (or decline) is appended to its params. Null when logging was
  // skipped (e.g. admin inspecting logs).
  searchLogId: z.string().nullish(),
  // Outgoing (base58) upload id when the question is about ONE specific video
  // (the media-page "ask about this video" entry point). Scopes retrieval +
  // the relevance probe to that upload's paragraphs. Omitted for library search.
  uploadId: z.string().nullish(),
  // Facet-only browse: `query` is a synthesized description of the active facet
  // (e.g. a verse label), not a user question. The facet already establishes
  // topical relevance, so skip the relevance-floor decline and always give an
  // overview of the (facet-scoped) sources rather than gating them off.
  facetOnly: z.boolean().optional(),
  // Manual "dig deeper / search by meaning" override from the answer card. Forces
  // the expensive detective loop (multi-strategy retrieval + streamed reasoning)
  // even when the recollection gate wouldn't have auto-triggered it. Never digs
  // for a single-video ask or a facet browse. See docs/agentic-search-overview.md.
  deepen: z.boolean().optional(),
  // Filters pre-filled on the search URL when this query loaded (e.g. a channel
  // slug when searching from a channel page). The answer's grounding retrieval
  // is scoped to them so it reflects the same corpus as the results. The client
  // captures these at fire time and does NOT resend on a later filter change, so
  // changing a filter never regenerates the answer.
  filters: z
    .object({
      channelSlugs: z.array(z.string()).nullish(),
      speakers: z.array(z.string()).nullish(),
      bibleRefs: z.array(z.string()).nullish(),
      bibleBooks: z.array(z.string()).nullish(),
      dateRange: z
        .enum(['all-time', 'today', 'this-week', 'this-month', 'this-year'])
        .nullish(),
      dateStart: z.string().nullish(),
      dateEnd: z.string().nullish(),
    })
    .nullish(),
});

// Map the UI's coarse date-range bucket to absolute inclusive bounds. Mirrors
// dateRangeToPublishedAt in trpc/procedures/search.ts so the answer's retrieval
// honors a pre-filled date filter the same way the results list does.
function dateBucketBounds(
  dateRange: string | null | undefined,
  now: Date,
): { gte: string; lte: string } | null {
  if (!dateRange || dateRange === 'all-time') return null;
  let start: Date;
  switch (dateRange) {
    case 'today':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case 'this-week':
      start = new Date(now);
      start.setDate(now.getDate() - now.getDay());
      start.setHours(0, 0, 0, 0);
      break;
    case 'this-month':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'this-year':
      start = new Date(now.getFullYear(), 0, 1);
      break;
    default:
      return null;
  }
  return { gte: start.toISOString(), lte: now.toISOString() };
}

const STREAM_HEADERS = {
  'Content-Type': 'text/plain; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  // Disable proxy buffering so tokens flush as they arrive.
  'X-Accel-Buffering': 'no',
};

// Read a string field off a tool's (untyped) input/output for the reasoning
// narration, defensively — the parts are typed as a broad union.
function strField(obj: unknown, key: string): string | null {
  if (obj && typeof obj === 'object' && key in obj) {
    const v = (obj as Record<string, unknown>)[key];
    return typeof v === 'string' ? v : null;
  }
  return null;
}
function arrLen(obj: unknown, key: string): number | null {
  if (obj && typeof obj === 'object' && key in obj) {
    const v = (obj as Record<string, unknown>)[key];
    return Array.isArray(v) ? v.length : null;
  }
  return null;
}

// SERVER-authored reasoning lines derived from OBSERVABLE tool calls/results —
// not the model's prose. This keeps the streamed "thinking" legible and immune
// to prompt injection (untrusted transcript text never becomes reasoning).
function describeToolCall(toolName: string, input: unknown): string {
  switch (toolName) {
    case 'grepTranscript': {
      const phrase = strField(input, 'phrase');
      return phrase
        ? `Searching transcripts for the exact quote “${phrase}”…`
        : 'Searching transcripts for an exact quote…';
    }
    case 'recallWindows': {
      const q = strField(input, 'query');
      return q
        ? `Searching by meaning for the story: “${q}”…`
        : 'Searching by meaning for the story…';
    }
    case 'searchMedia': {
      const q = strField(input, 'query');
      return q ? `Searching the library for “${q}”…` : 'Searching the library…';
    }
    case 'aggregateMedia': {
      const q = strField(input, 'query');
      return q ? `Counting matches for “${q}”…` : 'Counting matches…';
    }
    case 'resolveChannel':
      return 'Resolving a ministry/channel name…';
    default:
      return 'Searching…';
  }
}
function describeToolResult(toolName: string, output: unknown): string {
  switch (toolName) {
    case 'grepTranscript': {
      const n = arrLen(output, 'matches') ?? 0;
      return n > 0
        ? `Found ${n} exact quote match${n === 1 ? '' : 'es'}.`
        : 'No exact matches for that quote — the wording or a label may be off.';
    }
    case 'recallWindows': {
      const n = arrLen(output, 'spans') ?? 0;
      return n > 0
        ? `Recall surfaced ${n} candidate passage${n === 1 ? '' : 's'}.`
        : 'No semantically similar stories surfaced.';
    }
    case 'searchMedia': {
      const n = arrLen(output, 'results') ?? 0;
      return n > 0
        ? `Found ${n} related video${n === 1 ? '' : 's'}.`
        : 'No related videos.';
    }
    case 'aggregateMedia': {
      const count =
        output && typeof output === 'object' && 'count' in output
          ? (output as { count?: unknown }).count
          : null;
      return typeof count === 'number'
        ? `${count} total match${count === 1 ? '' : 'es'}.`
        : 'Counted matches.';
    }
    default:
      return 'Done.';
  }
}

export const Route = createFileRoute('/api/search-answer')({
  component: () => null,
  server: {
    handlers: {
      POST: async ({ request }) => {
        // TODO(abuse): this endpoint is unauthenticated and expensive per call
        // (embedding + multi-step agent + LLM gen) — a cost-DoS vector. Add a
        // rate-limit + adaptive proof-of-work guard here before building the
        // agent. Design: docs/search-answer-abuse-mitigation.md.
        let parsed: z.infer<typeof bodySchema>;
        try {
          parsed = bodySchema.parse(await request.json());
        } catch {
          return new Response('Invalid request body', { status: 400 });
        }

        // Single-video scope: resolve the outgoing upload id to the internal
        // UUID (= the media doc `_id`). Invalid ids degrade to "no scope" rather
        // than erroring the whole request.
        const internalUploadId = (() => {
          if (!parsed.uploadId) return null;
          const r = IncomingIdSchema.safeParse(parsed.uploadId);
          return r.success ? r.data : null;
        })();

        // Normalize the pre-filled URL filters into retrieval scope. Explicit
        // date bounds win over the coarse bucket (matching the results list).
        const filters = parsed.filters ?? null;
        const dateBounds =
          filters?.dateStart || filters?.dateEnd
            ? {
                gte: filters.dateStart ?? undefined,
                lte: filters.dateEnd ?? undefined,
              }
            : dateBucketBounds(filters?.dateRange, new Date());

        // Stable signature of the scope, so a channel- (or date-/speaker-)scoped
        // answer is cached separately from the unscoped one for the same query.
        const filterSig = JSON.stringify({
          c: [...(filters?.channelSlugs ?? [])].sort(),
          s: [...(filters?.speakers ?? [])].sort(),
          r: [...(filters?.bibleRefs ?? [])].sort(),
          b: [...(filters?.bibleBooks ?? [])].sort(),
          dr: filters?.dateRange ?? null,
          ds: filters?.dateStart ?? null,
          de: filters?.dateEnd ?? null,
          u: internalUploadId ?? null,
        });

        // Server-only deps loaded lazily so pg / opensearch / db never enter the
        // client bundle (this route file is part of the shared route tree).
        const [
          { searchTools, INSTRUCTIONS, detectiveTools, DETECTIVE_INSTRUCTIONS },
          { runAgentMediaSearch },
          { classifyAnswerMode, recollectionGate, classifyRecollection },
          { SEARCH_AGENT_MODEL, agentModel },
          { runMediaKnnProbe },
          { recordLlmCall },
          { hydrateUploads },
          { db, SearchLogEntry, UploadRecord },
          { eq, sql },
          { cacheGetJson, cacheSetJson },
          { parseSearchQuery },
          { resolveChannelSlugs },
          { streamText, stepCountIs },
          { channelChunk },
        ] = await Promise.all([
          import('@/ai/agent'),
          import('@/ai/tools/search-media'),
          import('@/ai/answer-gate'),
          import('@/ai/model'),
          import('@letschurch/opensearch'),
          import('@letschurch/temporal/util/llm'),
          import('@/trpc/search/hydrate'),
          import('@letschurch/db'),
          import('drizzle-orm'),
          import('@/util/cache'),
          import('@/trpc/search/parse-query'),
          import('@/trpc/search/channels'),
          import('ai'),
          import('@/ai/answer-stream'),
        ]);

        // Parse the query for intent + a reformulated question, concurrently with
        // the retrieval below (cached by query+day, so usually free). We use it to
        // (a) frame an answer on the natural question the query implies and (b)
        // tell an answer-worthy need from a browse/topic query — the latter should
        // produce a grounded OVERVIEW of the matches, never a flat decline.
        const parsePromise = parseSearchQuery(parsed.query).catch(() => null);

        // Resolve the pre-filled channel slugs once: the ids scope retrieval; the
        // names let the agent keep any follow-up search in the same channel scope.
        const scopedChannels =
          filters?.channelSlugs && filters.channelSlugs.length > 0
            ? await resolveChannelSlugs(filters.channelSlugs).catch(() => [])
            : [];
        const scopedChannelIds = scopedChannels.map((c) => c.id);
        const scopedChannelNames = scopedChannels.map((c) => c.name);

        // For a single-video ask, load the title + summary to feed the agent as
        // "other relevant information" beyond the retrieved transcript passages.
        const videoMeta = internalUploadId
          ? await db.query.UploadRecord.findFirst({
              where: eq(UploadRecord.id, internalUploadId),
              columns: { title: true, summary: true },
            }).catch(() => null)
          : null;

        // Declines read differently per scope: a single-video ask can't claim the
        // whole library lacks it, only that this video doesn't cover it.
        const declineMessage = internalUploadId
          ? "This video doesn't seem to cover that."
          : GATED_ANSWER;

        // Append the final answer (real or decline) + the cited sources to the
        // search_log_entry row hybridSearch created, so each search's parse,
        // answer, and sources live in one row (the admin log renders them, and
        // the answer's [N] markers map to sources[N - 1]). No-op when there's no
        // row id (logging was skipped). Strip the heavy avatar/thumbnail fields.
        const recordAnswer = async (
          answer: string,
          answerSources: AnswerSource[],
        ) => {
          if (!parsed.searchLogId) return;
          const loggedSources = answerSources.map((s) => ({
            id: s.id,
            title: s.title,
            channelName: s.channelName,
            startSeconds: s.startSeconds,
          }));
          try {
            await db
              .update(SearchLogEntry)
              .set({
                params: sql`${SearchLogEntry.params} || ${JSON.stringify({ answer, sources: loggedSources })}::jsonb`,
              })
              .where(eq(SearchLogEntry.id, parsed.searchLogId));
          } catch (err) {
            moduleLogger.warn(
              {
                context: {
                  error: err instanceof Error ? err.message : String(err),
                },
              },
              'Failed to record answer on search log',
            );
          }
        };

        const encoder = new TextEncoder();
        // The wire format is `<sources JSON><DELIMITER><body>`, where <body> is
        // plain answer markdown, or — when `reasoning` is present (a cached dig
        // answer) — the channel-tagged form `<r-chunk><a-chunk>` the live dig
        // path streams. Used for cache hits and declines (the live agent path
        // streams it instead).
        const payloadResponse = (
          answerSources: AnswerSource[],
          answer: string,
          reasoning?: string | null,
        ) => {
          const body = reasoning
            ? channelChunk('r', reasoning) + channelChunk('a', answer)
            : answer;
          return new Response(
            encoder.encode(
              JSON.stringify(answerSources) + SOURCES_DELIMITER + body,
            ),
            { headers: STREAM_HEADERS },
          );
        };

        // Answer cache (day-scoped TTL, like the parse). Keyed by (model, day,
        // filters, query) only. Answers are single-turn and deterministic for a
        // given query+filters — there is no conversation memory anymore (dropped
        // with Mastra), so an answer never depends on who asked or in what
        // "thread". Including resource/threadId (as the Mastra era did, to avoid
        // cross-conversation bleed) only fragmented the cache: the client mints a
        // fresh threadId per session, so a refresh missed and regenerated. Bump
        // v1 -> v2 so old thread-scoped keys are ignored. Dropping them also
        // dedups identical queries across users — a cost win with no downside
        // (the answer is grounded in public content, not personalized). Bumped
        // v2 -> v3: the payload gained an optional `reasoning` field (dig path)
        // and the gate can now route a query to the detective loop, so old
        // v2 entries (answer-only, non-dig) must not be replayed as dig answers.
        const answerCacheKey = `search-answer:v3:${SEARCH_AGENT_MODEL}:${new Date()
          .toISOString()
          .slice(0, 10)}:${filterSig}:${parsed.query.trim()}`;
        const cacheAnswer = (
          answerSources: AnswerSource[],
          answer: string,
          reasoning?: string | null,
        ) =>
          cacheSetJson(
            answerCacheKey,
            { sources: answerSources, answer, reasoning: reasoning ?? null },
            ANSWER_CACHE_TTL_SECONDS,
          );

        // Every "no answer" exit (gated off / nothing found) renders a concise,
        // plain decline in the card with no sources — never a verbose,
        // retrieval-narrating apology. Cache + log it like a real answer.
        const declineResponse = () => {
          void recordAnswer(declineMessage, []);
          void cacheAnswer([], declineMessage);
          return payloadResponse([], declineMessage);
        };

        // Cache hit: replay the stored payload (skips retrieval + the agent) and
        // still record it on this search's log row.
        const cachedAnswer = await cacheGetJson<{
          sources: AnswerSource[];
          answer: string;
          reasoning?: string | null;
        }>(answerCacheKey);
        if (cachedAnswer) {
          void recordAnswer(cachedAnswer.answer, cachedAnswer.sources);
          moduleLogger.info(
            { context: { query: parsed.query, cached: true } },
            'Served cached search answer',
          );
          return payloadResponse(
            cachedAnswer.sources,
            cachedAnswer.answer,
            cachedAnswer.reasoning,
          );
        }

        try {
          // Structured sources (avatar + channel name + title) rendered as chips
          // under the answer. Built from our own retrieval — not the model — so
          // they're always accurate and can't be spoofed by injected text.
          const sources: AnswerSource[] = [];
          let sourcesBlock = '';
          // Reuse the (already-logged) retrieval embedding for the relevance
          // probe instead of embedding the query a second time.
          let queryVector: number[] | null = null;

          try {
            // Pre-retrieve grounded passages and inject them into the prompt:
            // the model would otherwise often answer well-known topics from its
            // training data without searching. Pre-retrieving guarantees
            // grounded context and gives us the source list for the chips.
            const retrieved = await runAgentMediaSearch({
              query: parsed.query,
              // Pass the resolved ids when a channel filter was requested — even
              // an empty array, so a filter that matched no public channel yields
              // no results rather than broadening to the whole library. Null only
              // when no channel filter was set.
              channelIds:
                filters?.channelSlugs && filters.channelSlugs.length > 0
                  ? scopedChannelIds
                  : null,
              speakerNames: filters?.speakers ?? undefined,
              bibleRefs: filters?.bibleRefs ?? undefined,
              bibleBooks: filters?.bibleBooks ?? undefined,
              uploadIds: internalUploadId ? [internalUploadId] : undefined,
              dateGte: dateBounds?.gte,
              dateLte: dateBounds?.lte,
              limit: 8,
            });
            queryVector = retrieved.queryVector;

            // Enrich the retrieved uploads with channel avatars for the chips.
            const internalIds = retrieved.results
              .map((r) => {
                try {
                  return IncomingIdSchema.parse(r.uploadId);
                } catch {
                  return null;
                }
              })
              .filter((id): id is string => id !== null);
            const hydrated = await hydrateUploads(internalIds);
            const byId = new Map(hydrated.map((h) => [h.id, h]));

            // Build the citation list and the numbered prompt block from the
            // same iteration so the inline [N] markers the model emits line up
            // exactly with the chips (number N ↔ sources[N - 1]).
            const seen = new Set<string>();
            const numbered: string[] = [];
            for (const r of retrieved.results) {
              if (seen.has(r.uploadId)) continue;
              const h = byId.get(r.uploadId);
              if (!h) continue;
              seen.add(r.uploadId);
              const n = sources.length + 1;
              sources.push({
                id: r.uploadId,
                title: h.title ?? r.title,
                channelName: h.channel.name ?? r.channelName,
                avatarUrl: h.channel.avatarUrl,
                thumbnailUrl: h.thumbnailUrl,
                // Anchor the citation to the strongest match, not the earliest
                // context block (which the ±1 window can drag toward 0s).
                startSeconds: r.matchStartSeconds,
              });
              // Prefix each passage with its attributed speaker (when known) so
              // the model can attribute who said what; unattributed passages are
              // left bare rather than labeled with a raw diarization id.
              const passages = r.context
                .map((c) => (c.speaker ? `${c.speaker}: ${c.text}` : c.text))
                .join('\n');
              numbered.push(
                `[${n}] (${h.title ?? r.title ?? 'Untitled'} — ${h.channel.name ?? r.channelName ?? 'Unknown'}):\n${passages}`,
              );
              if (sources.length >= 8) break;
            }
            sourcesBlock = numbered.join('\n\n');
          } catch (err) {
            moduleLogger.warn(
              {
                context: {
                  error: err instanceof Error ? err.message : String(err),
                },
              },
              'Pre-retrieval failed; answering without injected sources',
            );
          }

          // The parser separates an answer-worthy need ("what does Scripture
          // say about X", a question) from a browse/topic/navigational query
          // (a bare keyword, a channel name) — `questions` is populated only for
          // the former. We frame an answer on its reformulated question, and let
          // a topic query default to an overview rather than a decline. Computed
          // before the dig gate AND the decline gate, since both read it.
          const parsedQuery = await parsePromise;
          const reformulated = parsedQuery?.questions[0]?.trim();
          const framingQuestion =
            reformulated || parsed.question?.trim() || parsed.query;
          const isAnswerWorthy = Boolean(
            reformulated || parsed.question?.trim(),
          );

          // Absolute kNN cosine of the closest video (recovered from the probe
          // score as 2*score - 1). Computed ONCE here and reused by both the dig
          // gate (thin Lane-1 is a dig signal) and the cheap-path cosine-floor
          // decline below. Skipped for facet browses (their synthesized query
          // would spuriously fail the floor).
          let topCosine: number | null = null;
          if (queryVector && !parsed.facetOnly) {
            try {
              const score = await runMediaKnnProbe({
                queryVector,
                uploadIds: internalUploadId ? [internalUploadId] : undefined,
              });
              topCosine = score == null ? null : 2 * score - 1;
              moduleLogger.info(
                { context: { query: parsed.query, score, cosine: topCosine } },
                'Answer relevance probe',
              );
            } catch (err) {
              // Probe failure shouldn't downgrade a possibly-good answer.
              moduleLogger.warn(
                {
                  context: {
                    error: err instanceof Error ? err.message : String(err),
                  },
                },
                'Relevance probe failed; skipping cosine gate',
              );
            }
          }

          // --- Decide whether to run the expensive detective (dig) loop, and
          // which FLAVOR. --- Single-video asks and facet browses never dig.
          // Otherwise the deterministic gate hands NL-question / thin-Lane-1
          // queries to the nano recollection classifier: an AUTO-dig fires only
          // for an actual recollection (a specific remembered moment). A manual
          // "dig deeper" always digs (the user asked for a deep search) — we
          // still classify it so the prompt matches (recollection vs question),
          // since a genuine question dug through the recollection playbook
          // produces forced corrections / false "no story" declines.
          let wantDig = false;
          let digIsRecollection = false;
          if (!internalUploadId && !parsed.facetOnly) {
            const gate = recollectionGate({
              query: parsed.query,
              isAnswerWorthy,
              topCosine,
            });
            if (gate === 'ambiguous' || parsed.deepen === true) {
              digIsRecollection = await classifyRecollection(parsed.query);
              wantDig = digIsRecollection || parsed.deepen === true;
            }
          }

          if (wantDig) {
            moduleLogger.info(
              {
                context: {
                  query: parsed.query,
                  deepen: parsed.deepen === true,
                  recollection: digIsRecollection,
                },
              },
              'Running detective (dig) loop',
            );
            const digScopeNote =
              scopedChannelNames.length > 0
                ? `\n\nScope: limit any search to the channel(s): ${scopedChannelNames.join(
                    ', ',
                  )} (pass channelNames: ${JSON.stringify(scopedChannelNames)}).`
                : '';
            // Two dig flavors. RECOLLECTION: forceful find-the-moment + correct
            // wrong labels (a genuine question run through this produces forced
            // corrections / false "no story" declines — hence the split).
            // QUESTION: just answer it thoroughly via the deep tools.
            const recollectionPrompt = `The user is trying to RE-FIND a specific half-remembered moment in the library — a story, anecdote, or exchange they heard. Their recollection (details may be WRONG):

"${parsed.query}"

Your ONLY job is to identify the specific narrated moment/video and correct any misremembered details. This is NOT a doctrinal or factual question: if the recollection embeds a question or quoted line ("is it true that…?"), do NOT answer it or explain any doctrine — the quote is only a clue to WHICH moment they mean.

How to find it:
1. Extract the PEOPLE and ACTIONS — especially any specific person named (a granddaughter, a child, a friend) and what they DID. That named person + action is your PRIMARY anchor.
2. You MUST call recallWindows — it is the best tool for a remembered story/scene, finding coherent multi-paragraph passages by MEANING even with no shared keywords. Describe the scene in your own words (person + action + the gist of the quote), with the denomination, the setting ("at the door"), and the exact wording STRIPPED OUT — the remembered label/setting are low-confidence and just re-surface generic content and hide the real story. Also grepTranscript the exact quoted phrase, and searchMedia for the hybrid. Do not conclude after only searchMedia.
3. The right moment MUST contain the CORE described elements — the specific person (e.g. the granddaughter) AND the remembered quote/action. An episode that merely shares the topic but LACKS the central person (e.g. the teller's own encounter when the query is about his granddaughter) is the WRONG episode — do NOT present it as the match. If the searches fit the people+actions but involve a DIFFERENT group/place than remembered, THAT is the moment.${
              sourcesBlock
                ? `\n\nInitial keyword matches (retrieved on the raw wording → biased toward the possibly-wrong label; do NOT anchor on them, use only if they fit the people + actions):\n\n${sourcesBlock}`
                : '\n\nInitial keyword retrieval was thin.'
            }${digScopeNote}

Reporting — this is the important part, get the TONE right:
- Lead DIRECTLY with the moment, as a natural statement: name the video and what happens in it, cited with the tool-provided [upload:...] tokens — the citation is the receipt, so you don't need to hedge. e.g. "On a Dividing Line episode, James White recounts his granddaughter Clementine walking up to two missionaries and asking, '…'." Do NOT open with "This looks like…" / "This appears to be…" / "This seems like…" / "I think this is…" when the quote and the people match — just state it. Reserve a brief hedge ("This may be…") ONLY when the match is genuinely uncertain (a weak or partial fit).
- Name any group/person/place from what the SOURCE actually shows (e.g. "Mormon missionaries" / "LDS"), NEVER from the query's assumption. Do not describe the story as being about the group the query named if the source shows a different one — that would state a wrong fact.
- Write ONLY about the source — never about the user's memory. Do NOT analyze, diagnose, or narrate what they remembered: forbidden phrasing includes "misremembered", "you got it wrong", "the remembered X", "the label you're thinking of", "the swapped detail", "which suggests…", "you may be conflating…", "what you have in mind". Do not explain your reasoning for a correction; just state the fact.
- If the source clearly involves a DIFFERENT group/person/place than the query named (a genuine substitution, e.g. Mormons where the query said Jehovah's Witnesses), note it in ONE short neutral clause about the source and stop: "This is about Mormon missionaries, not Jehovah's Witnesses." Do NOT add a because/which-suggests explanation, and do NOT restate it a second way.
- A more SPECIFIC detail from the source is NOT a discrepancy: e.g. if they said "his granddaughter" and the source names her Clementine, "granddaughter" was correct — do NOT claim otherwise or list it as a difference. Only note true substitutions, and don't over-correct.
- NEVER negate a CENTRAL element the user described (a named person like "his granddaughter", the quoted line) just because the episode you happened to retrieve doesn't contain it — e.g. do NOT say "not a granddaughter story". If your best match lacks the core person/quote, you have the WRONG episode: search again with recallWindows, and if you still can't find one that fits, say you couldn't pin down that exact moment rather than substituting a different episode and contradicting what they described.
- If you truly can't locate it, say so in one plain sentence — do NOT fall back to answering a doctrinal question.`;

            const questionPrompt = `Answer this question thoroughly and grounded in the library, using ALL your tools (searchMedia, plus grepTranscript and recallWindows to dig up less-obvious material — search several times with different phrasings):

"${parsed.query}"

This is a QUESTION/topic, not a recollection: synthesize a direct, well-supported answer. Do NOT hunt for a single "story", do NOT tell the user they misremembered anything, and do NOT decline just because there's no one narrated moment.${
              sourcesBlock
                ? `\n\nInitial matches to build on:\n\n${sourcesBlock}`
                : '\n\nInitial keyword retrieval was thin — search more.'
            }${digScopeNote}

Cite every claim with the tool-provided [upload:...] tokens. If the library genuinely doesn't cover it, say so in one plain sentence.`;

            const digPrompt = digIsRecollection
              ? recollectionPrompt
              : questionPrompt;

            const digGenStart = Date.now();
            const digResult = streamText({
              model: agentModel,
              system: DETECTIVE_INSTRUCTIONS,
              prompt: digPrompt,
              tools: detectiveTools,
              stopWhen: stepCountIs(DIG_STEP_BUDGET),
              onError: ({ error }) => {
                moduleLogger.error(
                  {
                    context: {
                      error:
                        error instanceof Error ? error.message : String(error),
                    },
                  },
                  'streamText error during dig generation',
                );
              },
            });

            const reader = digResult.fullStream.getReader();
            let generationDone = false;
            void Promise.resolve(digResult.finishReason)
              .then(() => {
                generationDone = true;
              })
              .catch(() => {
                generationDone = true;
              });

            const digStream = new ReadableStream<Uint8Array>({
              async start(controller) {
                // Empty up-front sources block: the dig cites the sources it
                // DISCOVERS inline via [upload:id@sec] tokens, which aren't known
                // until the loop runs. As those tokens stream we hydrate each and
                // push it on the 's' channel (below) so the client resolves the
                // citation to a real source badge + chip. (The pre-retrieved
                // `sources` are prompt context only — they carry no citation
                // tokens, so the model never cites them.)
                controller.enqueue(
                  encoder.encode(JSON.stringify([]) + SOURCES_DELIMITER),
                );
                let answerText = '';
                let reasoningText = '';

                // Sources the model actually cited, hydrated (avatar + title +
                // thumbnail) for the chips. Populated from the [upload:id@sec]
                // tokens as the answer streams. Keep distinct timestamps from
                // the same upload as distinct citations; a hydrate miss just
                // leaves the bare [source] link.
                const digSources: AnswerSource[] = [];
                const seenSourceKeys = new Set<string>();
                // In-flight hydrations, awaited before close so a late enqueue
                // never lands on a closed controller.
                const flushes: Array<Promise<void>> = [];
                const CITE_RE = /\[upload:([1-9A-HJ-NP-Za-km-z]+)@(\d+)\]/g;
                const flushNewSources = async () => {
                  const pending: Array<{ outId: string; sec: number }> = [];
                  for (const m of answerText.matchAll(CITE_RE)) {
                    const outId = m[1];
                    const sec = Number(m[2]);
                    const key = answerSourceKey({
                      id: outId,
                      startSeconds: sec,
                    });
                    if (seenSourceKeys.has(key)) continue;
                    seenSourceKeys.add(key);
                    pending.push({ outId, sec });
                  }
                  if (pending.length === 0) return;
                  const withInternal = pending
                    .map((p) => {
                      try {
                        return { ...p, intId: IncomingIdSchema.parse(p.outId) };
                      } catch {
                        return null;
                      }
                    })
                    .filter((x): x is NonNullable<typeof x> => x !== null);
                  if (withInternal.length === 0) return;
                  let hydrated: Awaited<ReturnType<typeof hydrateUploads>>;
                  try {
                    hydrated = await hydrateUploads(
                      withInternal.map((p) => p.intId),
                    );
                  } catch {
                    return;
                  }
                  const byOut = new Map(hydrated.map((h) => [h.id, h]));
                  const fresh: AnswerSource[] = [];
                  for (const p of withInternal) {
                    const h = byOut.get(p.outId);
                    if (!h) continue;
                    const src: AnswerSource = {
                      id: p.outId,
                      title: h.title ?? null,
                      channelName: h.channel.name ?? null,
                      avatarUrl: h.channel.avatarUrl,
                      thumbnailUrl: h.thumbnailUrl,
                      startSeconds: p.sec,
                    };
                    fresh.push(src);
                    digSources.push(src);
                  }
                  if (fresh.length > 0) {
                    controller.enqueue(
                      encoder.encode(channelChunk('s', JSON.stringify(fresh))),
                    );
                  }
                };
                const emitReasoning = (line: string) => {
                  reasoningText += (reasoningText ? '\n' : '') + line;
                  controller.enqueue(
                    encoder.encode(channelChunk('r', `${line}\n`)),
                  );
                };
                const deadline = Date.now() + 120_000;
                const idle = () =>
                  new Promise<'idle'>((resolve) => {
                    setTimeout(() => resolve('idle'), 1_000);
                  });
                let pending = reader.read();
                try {
                  while (true) {
                    const res = await Promise.race([pending, idle()]);
                    if (res === 'idle') {
                      if (generationDone || Date.now() > deadline) break;
                      continue;
                    }
                    if (res.done) break;
                    const part = res.value;
                    switch (part.type) {
                      case 'tool-call':
                        emitReasoning(
                          describeToolCall(part.toolName, part.input),
                        );
                        break;
                      case 'tool-result':
                        emitReasoning(
                          describeToolResult(part.toolName, part.output),
                        );
                        break;
                      case 'reasoning-delta':
                        // Provider reasoning is private model deliberation, not a
                        // public progress channel. Observable tool statuses above
                        // are the only reasoning we expose.
                        break;
                      case 'text-delta':
                        answerText += part.text;
                        controller.enqueue(
                          encoder.encode(channelChunk('a', part.text)),
                        );
                        // Hydrate + stream any newly-completed [upload:…]
                        // citation so its badge/chip resolves close behind the
                        // token. Tracked (not fire-and-forget) so it's awaited
                        // before close; the sync seenSourceKeys guard keeps
                        // concurrent flushes from double-adding one moment.
                        flushes.push(flushNewSources());
                        break;
                      case 'error':
                        moduleLogger.warn(
                          { context: { error: String(part.error) } },
                          'dig fullStream error part',
                        );
                        break;
                      default:
                        break;
                    }
                    pending = reader.read();
                  }
                } catch (err) {
                  moduleLogger.warn(
                    {
                      context: {
                        error: err instanceof Error ? err.message : String(err),
                      },
                    },
                    'Error reading dig stream; closing with partial answer',
                  );
                }
                // Drain in-flight hydrations, then a final sweep for any
                // citation completed in the last delta (the loop may have
                // broken before its flush ran) — all before close, so no
                // enqueue lands on a closed controller.
                await Promise.allSettled(flushes);
                await flushNewSources();

                controller.close();
                void reader.cancel();

                try {
                  const usage = (await Promise.resolve(
                    digResult.usage as unknown,
                  ).catch(() => null)) as {
                    inputTokens?: number;
                    outputTokens?: number;
                    promptTokens?: number;
                    completionTokens?: number;
                  } | null;
                  const finishReason = await Promise.resolve(
                    digResult.finishReason,
                  ).catch(() => null);
                  await recordLlmCall({
                    model: SEARCH_AGENT_MODEL,
                    activity: 'searchDetectiveAgent',
                    promptTokens:
                      usage?.inputTokens ?? usage?.promptTokens ?? null,
                    completionTokens:
                      usage?.outputTokens ?? usage?.completionTokens ?? null,
                    durationMs: Date.now() - digGenStart,
                    finishReason:
                      typeof finishReason === 'string' ? finishReason : null,
                    outcome: 'success',
                    responseText: answerText,
                  });
                } catch (err) {
                  moduleLogger.warn(
                    {
                      context: {
                        error: err instanceof Error ? err.message : String(err),
                      },
                    },
                    'Failed to record dig llm_call',
                  );
                }

                if (answerText.trim().length > 0) {
                  // Persist the DISCOVERED (cited) sources, not the pre-retrieved
                  // ones — so a cache replay streams them up front and the
                  // [upload:…] citations resolve to chips without the 's' channel.
                  await recordAnswer(answerText, digSources);
                  void cacheAnswer(
                    digSources,
                    answerText,
                    reasoningText || null,
                  );
                }
                moduleLogger.info(
                  { context: { sources: digSources.length } },
                  'Dig answer stream finished',
                );
              },
              cancel() {
                void reader.cancel();
              },
            });

            return new Response(digStream, { headers: STREAM_HEADERS });
          }

          // Nothing retrieved and NOT digging — there's nothing to answer OR
          // overview, so this is the only genuine decline. (Dig runs even on a
          // thin/empty pre-retrieval: its grep + window-recall tools can find
          // what the stage-1 pool missed, so the empty check is after the dig
          // branch, not before it.)
          if (sources.length === 0) {
            moduleLogger.info(
              { context: { query: parsed.query, reason: 'no-results' } },
              'Answer gated off',
            );
            return declineResponse();
          }

          // --- Decide ANSWER vs OVERVIEW vs DECLINE (cheap path). ---
          // answer  → directly answer the question from the sources.
          // overview→ sources are on-topic but don't fully answer; summarize the
          //           related material (grounded, no fabricated answer).
          // decline → retrieval missed / off-topic; say we couldn't find it
          //           rather than pivoting to unrelated material.
          let mode: 'answer' | 'overview' | 'decline' = 'answer';

          // Facet-only browse: the user filtered to an explicit facet (e.g. a
          // verse), so the retrieved sources are on-topic by construction. Force
          // an overview and skip the relevance-floor + nano gates entirely — the
          // synthesized `query` (a verse label) would otherwise often fall below
          // the cosine floor and be gated off even though the facet clearly
          // matched real media. (`sources.length === 0` already declined above.)
          if (parsed.facetOnly) {
            mode = 'overview';
          } else {
            // 1. Absolute kNN cosine floor (reuse the probe above): if nothing
            //    in the library is even semantically close, decline outright —
            //    there's nothing worth overviewing.
            if (topCosine != null && topCosine < RELEVANCE_COSINE_FLOOR) {
              mode = 'decline';
            }

            // 2. Cheap nano classifier: answer vs overview vs decline. Only the
            //    nano gate can tell "on-topic but no direct answer" (overview)
            //    from "retrieval missed / off-topic" (decline) — the latter is
            //    what produces awkward "we don't cover that, but here's unrelated
            //    material" pivots, so it declines instead.
            if (mode !== 'decline') {
              mode = await classifyAnswerMode(framingQuestion, sourcesBlock);
            }

            if (mode === 'decline') {
              moduleLogger.info(
                { context: { query: parsed.query, reason: 'gate' } },
                'Answer gated off',
              );
              return declineResponse();
            }

            // Intent override. The gate still owns the decline decision above
            // (off-topic / retrieval miss); these only adjust answer↔overview:
            // - A real question should always ATTEMPT a direct answer. "On-topic
            //   but indirect" must not downgrade a question to a passive overview
            //   of related material (e.g. answering "who is X" with a summary of
            //   X's book) — answer it directly from what's on point instead.
            // - A browse/topic query (no question) reads as a grounded overview
            //   of what the matches cover, never a definitive "answer".
            if (isAnswerWorthy && mode === 'overview') {
              mode = 'answer';
            } else if (!isAnswerWorthy && mode === 'answer') {
              mode = 'overview';
            }
          }

          if (mode === 'overview') {
            moduleLogger.info(
              { context: { query: parsed.query, mode: 'overview' } },
              'Streaming an overview of related results',
            );
          }

          // When the search is scoped to specific channel(s), tell the agent so
          // any follow-up searchMedia/aggregateMedia call stays within the same
          // scope instead of pulling in other channels' content. The injected
          // sources are already scoped; this only constrains re-searches.
          const scopeNote =
            scopedChannelNames.length > 0
              ? `\n\nScope: these results are limited to the channel(s): ${scopedChannelNames.join(', ')}. If you search again, pass channelNames: ${JSON.stringify(scopedChannelNames)} so follow-ups stay within the same channel scope.`
              : '';

          // Single-video ask: give the agent the video's identity + summary as
          // extra grounding, and forbid pulling in other videos (the searchMedia
          // tool can't scope to one upload, so it must NOT re-search).
          const videoContext = internalUploadId
            ? `\n\nThis question is about ONE video${
                videoMeta?.title ? ` titled "${videoMeta.title}"` : ''
              }.${
                videoMeta?.summary
                  ? ` Video summary: ${videoMeta.summary.slice(0, 1000)}`
                  : ''
              } Every source below is a passage from THIS video — answer only from them and do NOT search for or cite other videos.`
            : '';

          // The answer path directly answers the question; the overview path
          // (when the sources are on-topic but don't answer it) summarizes the
          // related content without asserting an answer.
          const prompt =
            mode === 'answer'
              ? `Question: ${framingQuestion}

Answer using ONLY the numbered sources below (these are already fetched — you do not need to search again unless the question needs comparison or counts, or it asks what a specific PERSON said — in that case call searchMedia again with their name in speakerNames to scope to paragraphs they actually spoke).${scopeNote}${videoContext}

Formatting rules:
- Answer the EXACT question asked, first — in one or two sentences — then add detail. Do NOT open with a heading, title, or a restatement of the question. For an identity question ("who is X" / "what is X"), lead by identifying X from what the sources show — their role, the work attributed to them, or what they teach (e.g. "Conley Owens is the author of The Dorean Principle, in which he argues…") — do NOT pivot straight into summarizing a related work without first answering who/what they are. Even when the sources only cover the subject indirectly, give the most direct answer they support rather than a passive tour of related material.
- FALSE PREMISE (important): if the question ASSUMES something the sources contradict — e.g. it asks why a person believes/supports/rejects X when the sources show they actually hold the OPPOSITE (asks why he thinks the Trinity is unbiblical when he defends it; why he supports Rome when he opposes it) — do NOT accept or rationalize that premise. Correct it plainly first ("Actually, White defends the Trinity as biblical — he argues…"), then answer from what the sources really say. Never build an answer that affirms a premise the sources refute.
- Write about the subject directly — don't frame it as what "the library", "the sources", "the material", or "the passages" say (it reads wooden); attribute to a named author/speaker instead when a passage has one, using active verbs.
- After that, add any supporting detail, lists, or short sections that help.
- Write in Markdown.
- A passage prefixed with a name (e.g. "Conley Owens: …") is attributed to that speaker — you may name them and attribute their statements. Passages with no name prefix are unattributed; do not guess who is speaking.
- Cite your sources inline with bracketed numbers that match the list below (e.g. place [1] or [2] immediately after the sentence it supports). Only cite numbers that appear in the list; never invent a citation or a source.
- PHRASING (hard rule): state what a work teaches as a DIRECT claim. NEVER write "presents the book as…", "presents it as…", "is presented as…", "frames it as…", "is described as…", or "the book/appendix/text says/notes…". Instead write "he argues that…", "the book contends that…", or "in it, he teaches that…". (Reporting what the author says about the work itself — "he says he adapted it from his thesis" — is fine.)

Sources:
${sourcesBlock}`
              : `Search: ${framingQuestion}

The numbered sources below matched that search but don't form a single direct answer. In 2–4 sentences, give the reader a grounded overview of what they're actually about. Do NOT fabricate specifics the sources don't support.${scopeNote}${videoContext}

Formatting rules:
- Lead with the actual subject the sources discuss — infer it from THEM (a doctrine, a thesis, a practice, a named work or author). The search text may be a fragment, phrase, or title, so do NOT restate or echo it as if it were a defined subject (e.g. do NOT write "Biblical response Christianity is…"). And do NOT make "the library", "the sources", "the material", "the passages", or "this collection" the subject of your sentences — it reads wooden. State what's taught directly with active verbs (e.g. "Commercialization distorts ministry by…"), or attribute a point to a named author/speaker when a passage has one (e.g. "Owens argues that…"). Do NOT hedge with meta-attribution like "is presented as", "is described as", "the book/appendix/text says/notes", or "according to the sources" — the citation already shows where it came from, so write the claim directly. Do NOT open with an apology or a heading, and do NOT pivot to material that isn't on point.
- Keep it to 2–4 sentences. Write in Markdown. Use ONLY the sources below; do not search again.
- Cite sources inline with bracketed numbers that match the list (e.g. [1], [2]). Only cite numbers that appear in the list; never invent a citation or a source.

Sources:
${sourcesBlock}`;

          const genStart = Date.now();
          const result = streamText({
            model: agentModel,
            system: INSTRUCTIONS,
            prompt,
            tools: searchTools,
            // Allow several tool calls per answer (multi-source synthesis).
            stopWhen: stepCountIs(8),
            // Surface a generation error instead of silently ending the stream;
            // the catch below records the decline and the card shows the error.
            onError: ({ error }) => {
              moduleLogger.error(
                {
                  context: {
                    error:
                      error instanceof Error ? error.message : String(error),
                  },
                },
                'streamText error during answer generation',
              );
            },
          });

          // Bridge ai-sdk's text stream into a DOM byte stream for the Response.
          // We drive completion off result.finishReason (resolves when the run
          // ends) and an idle timer, so a pause during a tool call doesn't look
          // like completion and a late final delta isn't dropped.
          const reader = result.textStream.getReader();
          let generationDone = false;
          void Promise.resolve(result.finishReason)
            .then(() => {
              generationDone = true;
            })
            .catch(() => {
              generationDone = true;
            });

          const stream = new ReadableStream<Uint8Array>({
            async start(controller) {
              // Emit the structured sources first (JSON + delimiter) so the
              // client can resolve inline [N] citations to chips while the
              // answer is still streaming.
              controller.enqueue(
                encoder.encode(JSON.stringify(sources) + SOURCES_DELIMITER),
              );
              const deadline = Date.now() + 90_000;
              let answerText = '';
              // Keep a SINGLE outstanding read() and race the same promise
              // against an idle timer — so a chunk whose read() loses the race
              // (e.g. a >1s pause during a tool call) is NOT discarded; the next
              // iteration awaits that same pending read. Racing a fresh read()
              // each time would drop the chunk it eventually resolves with.
              const idleMs = 1_000;
              const idle = () =>
                new Promise<'idle'>((resolve) => {
                  setTimeout(() => resolve('idle'), idleMs);
                });
              let pending = reader.read();
              try {
                while (true) {
                  const res = await Promise.race([pending, idle()]);
                  if (res === 'idle') {
                    // Mastra may keep the textStream open after generation; once
                    // it's done (or we hit the hard cap), drain whatever's left
                    // quickly, then stop.
                    if (generationDone || Date.now() > deadline) break;
                    continue;
                  }
                  if (res.done) break;
                  if (res.value) {
                    answerText += res.value;
                    controller.enqueue(encoder.encode(res.value));
                  }
                  pending = reader.read();
                }
                // Final bounded drain: pick up any chunk that was still in
                // flight when generation finished (finishReason can resolve
                // alongside the last delta).
                while (Date.now() <= deadline) {
                  const res = await Promise.race([
                    pending,
                    new Promise<'idle'>((r) =>
                      setTimeout(() => r('idle'), 250),
                    ),
                  ]);
                  if (res === 'idle' || res.done) break;
                  if (res.value) {
                    answerText += res.value;
                    controller.enqueue(encoder.encode(res.value));
                  }
                  pending = reader.read();
                }
              } catch (err) {
                // Log, then fall through to close + cleanup with the partial
                // answer. We can't rethrow/propagate: start() runs after the
                // handler already returned the Response, so the outer catch
                // can't see it, and throwing would skip the graceful close,
                // llm_call logging, and cache write below.
                moduleLogger.warn(
                  {
                    context: {
                      error: err instanceof Error ? err.message : String(err),
                    },
                  },
                  'Error reading agent stream; closing with partial answer',
                );
              }
              controller.close();
              void reader.cancel();

              // Record the agent generation in `llm_call`. `streamText` makes
              // the OpenAI request directly (the tracked wrappers don't see it),
              // so log it manually from the resolved usage/finishReason.
              try {
                const usage = (await Promise.resolve(
                  result.usage as unknown,
                ).catch(() => null)) as {
                  inputTokens?: number;
                  outputTokens?: number;
                  promptTokens?: number;
                  completionTokens?: number;
                } | null;
                const finishReason = await Promise.resolve(
                  result.finishReason,
                ).catch(() => null);
                await recordLlmCall({
                  model: SEARCH_AGENT_MODEL,
                  activity: 'searchAnswerAgent',
                  promptTokens:
                    usage?.inputTokens ?? usage?.promptTokens ?? null,
                  completionTokens:
                    usage?.outputTokens ?? usage?.completionTokens ?? null,
                  durationMs: Date.now() - genStart,
                  finishReason:
                    typeof finishReason === 'string' ? finishReason : null,
                  outcome: 'success',
                  responseText: answerText,
                });
              } catch (err) {
                moduleLogger.warn(
                  {
                    context: {
                      error: err instanceof Error ? err.message : String(err),
                    },
                  },
                  'Failed to record agent llm_call',
                );
              }

              // Append the generated answer + its sources to this search's log,
              // and cache the payload so a repeated query replays it.
              if (answerText.trim().length > 0) {
                await recordAnswer(answerText, sources);
                void cacheAnswer(sources, answerText);
              }

              moduleLogger.info(
                { context: { sources: sources.length } },
                'Search answer stream finished',
              );
            },
            cancel() {
              void reader.cancel();
            },
          });

          return new Response(stream, { headers: STREAM_HEADERS });
        } catch (error) {
          moduleLogger.error(
            {
              context: {
                error: error instanceof Error ? error.message : String(error),
              },
            },
            'Search answer stream failed',
          );
          return new Response('Failed to generate answer', { status: 500 });
        }
      },
    },
  },
});
