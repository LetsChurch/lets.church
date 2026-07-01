import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

// System prompt for grounded, cited Scripture answers. Unlike the sermon library
// (proprietary content the model doesn't know), the Bible is a fixed authoritative
// text the model knows well — so the job is a SOUND answer anchored to REAL,
// linkable verse citations, framed from the site's confessional position.
const INSTRUCTIONS = `You are the study assistant for lets.bible, a Bible reading and study site. Answer the user's question about Scripture — its teaching, meaning, and application — clearly and faithfully.

Framing:
- Answer from a confessional, Reformed, Protestant, Scripture-centric position (the position of Let's Church): the Apostles', Nicene, Chalcedonian, and Athanasian Creeds; the Five Solas; and the inerrancy of Scripture. Do not answer from or advocate opposing frameworks (Roman Catholicism, Eastern Orthodoxy, cults, other religions, or secular materialism); you may accurately describe such views but evaluate from the position above.
- Be warm and pastoral, but concise and concrete. Lead with a direct answer, then support it.

Grounding and citations (most important):
- Ground your answer in Scripture. Some relevant passages are provided below; use them, and you may also draw on your knowledge of the biblical text — but every substantive claim about what the Bible teaches must be supported by a specific verse.
- Cite verses INLINE in the exact form [Book Chapter:Verse], e.g. [John 3:16], [Romans 8:28], [1 Corinthians 13:4]. Cite real references only — never invent a reference or quote a verse that does not exist. Prefer the standard English book name.
- Quote sparingly and accurately; the reader can open any citation to read the full text.

Scope:
- Answer questions about the Bible, Christian doctrine, and the Christian life. If the question is clearly not about Scripture or faith, decline in ONE short sentence (e.g. "That's outside what I can help with here."). Do not pad or speculate.
- Write in plain, readable prose — a few short paragraphs. Do NOT use markdown headings, bold, or bullet lists (they won't render). Do not open with a heading or restate the question.`;

const bodySchema = z.object({
  q: z.string().trim().min(1).max(500),
  translation: z.string().default('BSB'),
});

const STREAM_HEADERS = {
  'Content-Type': 'text/plain; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  // Disable proxy buffering so tokens flush as they arrive.
  'X-Accel-Buffering': 'no',
};

// Answers are deterministic for a given (model, day, translation, query), so
// cache them in Valkey (day-scoped TTL) and replay on repeat — a refresh or a
// second visitor asking the same thing skips retrieval + generation entirely.
const ANSWER_CACHE_TTL_SECONDS = 60 * 60 * 24;

export const Route = createFileRoute('/api/answer')({
  component: () => null,
  server: {
    handlers: {
      // TODO(abuse): unauthenticated + expensive per call (retrieval + LLM gen).
      // Add a rate limit / proof-of-work guard before ungating widely (mirror
      // docs/search-answer-abuse-mitigation.md).
      POST: async ({ request }) => {
        let parsed: z.infer<typeof bodySchema>;
        try {
          parsed = bodySchema.parse(await request.json());
        } catch {
          return new Response('Invalid request body', { status: 400 });
        }

        // Lazy server-only imports (keep the LLM/search deps out of the client
        // bundle; this route file is part of the shared route tree).
        const [
          { answerModel, ANSWER_MODEL },
          { searchVerses },
          { streamText },
          { cacheGet, cacheSet },
        ] = await Promise.all([
          import('@/ai/model'),
          import('@/search/search'),
          import('ai'),
          import('@/util/cache'),
        ]);

        // Cache hit: replay the stored answer (skips retrieval + generation).
        // Keyed by (model, day, translation, query) — the answer depends on
        // nothing else.
        const cacheKey = `letsbible-answer:v1:${ANSWER_MODEL}:${new Date()
          .toISOString()
          .slice(0, 10)}:${parsed.translation}:${parsed.q}`;
        const cached = await cacheGet(cacheKey);
        if (cached) {
          return new Response(cached, { headers: STREAM_HEADERS });
        }

        // Retrieve grounding verses (BM25 + popularity). Also the citation
        // anchors the model quotes/links.
        const hits = await searchVerses({
          q: parsed.q,
          translationId: parsed.translation,
          size: 12,
        });

        if (hits.length === 0) {
          const message =
            "I couldn't find anything in Scripture matching that. Try a different wording or a specific reference.";
          await cacheSet(cacheKey, message, ANSWER_CACHE_TTL_SECONDS);
          return new Response(message, { headers: STREAM_HEADERS });
        }

        const passages = hits
          .map((h) => `[${h.name} ${h.chapter}:${h.verse}] ${h.text}`)
          .join('\n');

        const result = streamText({
          model: answerModel,
          system: INSTRUCTIONS,
          prompt: `Question: ${parsed.q}\n\nRelevant passages (${parsed.translation}):\n${passages}\n\nAnswer the question, citing verses inline as [Book Chapter:Verse].`,
          onError: ({ error }) => {
            console.error(
              'lets.bible answer streamText error:',
              error instanceof Error ? error.message : String(error),
            );
          },
        });

        // Tee the stream: forward tokens to the client as they arrive AND
        // accumulate the full text so we can cache it once generation completes.
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            let full = '';
            try {
              for await (const chunk of result.textStream) {
                full += chunk;
                controller.enqueue(encoder.encode(chunk));
              }
            } catch (err) {
              console.error(
                'lets.bible answer stream error:',
                err instanceof Error ? err.message : String(err),
              );
            }
            controller.close();
            // Best-effort: cache the completed answer (only a non-empty result,
            // so a truncated/failed generation isn't cached as the answer).
            if (full.trim().length > 0) {
              await cacheSet(cacheKey, full, ANSWER_CACHE_TTL_SECONDS);
            }
          },
        });

        return new Response(stream, { headers: STREAM_HEADERS });
      },
    },
  },
});
