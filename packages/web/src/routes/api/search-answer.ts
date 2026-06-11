import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { type AnswerSource, SOURCES_DELIMITER } from '@/ai/answer-stream';
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

        // Server-only deps loaded lazily so Mastra / pg never enter the client
        // bundle (this route file is part of the shared route tree).
        const [
          { searchAgent },
          { runAgentMediaSearch },
          { classifyAnswerMode },
          { SEARCH_AGENT_MODEL },
          { runMediaKnnProbe },
          { recordLlmCall },
          { getSession },
          { hydrateUploads },
          { db, SearchLogEntry, UploadRecord },
          { eq, sql },
          { cacheGetJson, cacheSetJson },
          { parseSearchQuery },
          { resolveChannelSlugs },
        ] = await Promise.all([
          import('@/ai/agent'),
          import('@/ai/tools/search-media'),
          import('@/ai/answer-gate'),
          import('@/ai/model'),
          import('@letschurch/opensearch'),
          import('@letschurch/temporal/util/llm'),
          import('@/util/auth'),
          import('@/trpc/search/hydrate'),
          import('@letschurch/db'),
          import('drizzle-orm'),
          import('@/util/cache'),
          import('@/trpc/search/parse-query'),
          import('@/trpc/search/channels'),
        ]);

        const session = await getSession();
        const resource = session?.appUserId ?? `anon:${parsed.resourceId}`;

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
        // The wire format is `<sources JSON><DELIMITER><answer markdown>`. Used
        // for cache hits and declines (the live agent path streams it instead).
        const payloadResponse = (
          answerSources: AnswerSource[],
          answer: string,
        ) =>
          new Response(
            encoder.encode(
              JSON.stringify(answerSources) + SOURCES_DELIMITER + answer,
            ),
            { headers: STREAM_HEADERS },
          );

        // Answer cache (day-scoped TTL, like the parse). Keyed by the
        // CONVERSATION (resource + thread) as well as the query/filters: the
        // agent reads thread memory, so a follow-up ("what about his early
        // ministry?") resolves against prior turns. Keying by query alone would
        // replay one thread's context-dependent answer into another thread or
        // user — wrong, and a cross-conversation bleed. The cost is losing
        // cross-user dedup of identical queries; an identical query within the
        // same conversation (re-render / refresh / back-nav) still hits.
        const answerCacheKey = `search-answer:v1:${SEARCH_AGENT_MODEL}:${new Date()
          .toISOString()
          .slice(
            0,
            10,
          )}:${resource}:${parsed.threadId}:${filterSig}:${parsed.query.trim()}`;
        const cacheAnswer = (answerSources: AnswerSource[], answer: string) =>
          cacheSetJson(
            answerCacheKey,
            { sources: answerSources, answer },
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
        }>(answerCacheKey);
        if (cachedAnswer) {
          void recordAnswer(cachedAnswer.answer, cachedAnswer.sources);
          moduleLogger.info(
            { context: { query: parsed.query, cached: true } },
            'Served cached search answer',
          );
          return payloadResponse(cachedAnswer.sources, cachedAnswer.answer);
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

          // Nothing retrieved at all — there's nothing to answer OR overview,
          // so this is the only genuine decline.
          if (sources.length === 0) {
            moduleLogger.info(
              { context: { query: parsed.query, reason: 'no-results' } },
              'Answer gated off',
            );
            return declineResponse();
          }

          // The parser separates an answer-worthy need ("what does Scripture
          // say about X", a question) from a browse/topic/navigational query
          // (a bare keyword, a channel name) — `questions` is populated only for
          // the former. We frame an answer on its reformulated question, and let
          // a topic query default to an overview rather than a decline.
          const parsedQuery = await parsePromise;
          const reformulated = parsedQuery?.questions[0]?.trim();
          const framingQuestion =
            reformulated || parsed.question?.trim() || parsed.query;
          const isAnswerWorthy = Boolean(
            reformulated || parsed.question?.trim(),
          );

          // --- Decide ANSWER vs OVERVIEW vs DECLINE. ---
          // answer  → directly answer the question from the sources.
          // overview→ sources are on-topic but don't fully answer; summarize the
          //           related material (grounded, no fabricated answer).
          // decline → retrieval missed / off-topic; say we couldn't find it
          //           rather than pivoting to unrelated material.
          let mode: 'answer' | 'overview' | 'decline' = 'answer';

          // 1. Absolute kNN cosine floor (cheap, no LLM): if nothing in the
          //    library is even semantically close, decline outright — there's
          //    nothing worth overviewing.
          if (queryVector) {
            try {
              const score = await runMediaKnnProbe({
                queryVector,
                uploadIds: internalUploadId ? [internalUploadId] : undefined,
              });
              const cosine = score == null ? null : 2 * score - 1;
              moduleLogger.info(
                { context: { query: parsed.query, score, cosine } },
                'Answer relevance probe',
              );
              if (cosine != null && cosine < RELEVANCE_COSINE_FLOOR) {
                mode = 'decline';
              }
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

          // Intent override: a browse/topic query (no reformulated question)
          // should read as a grounded overview of what the matches cover, never
          // a definitive "answer". The gate still owns the decline decision above;
          // here we only soften answer→overview when the query wasn't a question.
          if (!isAnswerWorthy && mode === 'answer') {
            mode = 'overview';
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
- Begin with a concise, direct answer in one or two sentences. Do NOT open with a heading, title, or a restatement of the question.
- After that, add any supporting detail, lists, or short sections that help.
- Write in Markdown.
- A passage prefixed with a name (e.g. "Conley Owens: …") is attributed to that speaker — you may name them and attribute their statements. Passages with no name prefix are unattributed; do not guess who is speaking.
- Cite your sources inline with bracketed numbers that match the list below (e.g. place [1] or [2] immediately after the sentence it supports). Only cite numbers that appear in the list; never invent a citation or a source.

Sources:
${sourcesBlock}`
              : `Topic: ${framingQuestion}

The numbered sources below are on this topic but don't form a single direct answer. Give the reader a brief, grounded overview of what the library covers on it. Do NOT fabricate specifics the sources don't support.${scopeNote}${videoContext}

Formatting rules:
- Lead straight into what the sources cover on this topic (you may note in passing if coverage is partial). Do NOT open with an apology, a heading, or a restatement of the topic, and do NOT pivot to material that isn't about the topic.
- Keep it to 2–4 sentences. Write in Markdown. Use ONLY the sources below; do not search again.
- Cite sources inline with bracketed numbers that match the list (e.g. [1], [2]). Only cite numbers that appear in the list; never invent a citation or a source.

Sources:
${sourcesBlock}`;

          const genStart = Date.now();
          const result = await searchAgent.stream(prompt, {
            memory: { thread: parsed.threadId, resource },
            // Allow several tool calls per answer (multi-source synthesis).
            maxSteps: 8,
          });

          // Bridge Mastra's text stream into a DOM byte stream for the Response.
          // Mastra's textStream does NOT reliably emit `done` (it stays open
          // after generation), so we drive completion off result.finishReason
          // (resolves when the run actually ends). Without this the response
          // hangs forever ("thinking…").
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

              // Record the agent generation in `llm_call`. Mastra owns the
              // actual OpenRouter request (so the tracked wrappers don't see
              // it) — log it manually from the resolved usage/finishReason.
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
