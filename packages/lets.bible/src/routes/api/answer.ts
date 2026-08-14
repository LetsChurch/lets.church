import { readRequestBody, RequestBodyTooLargeError } from '@letschurch/util';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import {
  answerRateLimitResponse,
  enforceAnswerRateLimit,
} from '@/util/rate-limit';

const bodySchema = z.object({
  q: z.string().trim().min(1).max(500),
  translation: z.string().trim().min(1).max(32).default('BSB'),
  // Manual "find the verse / search by meaning" override from the answer card:
  // forces the verse-finder detective loop even when the recollection gate
  // wouldn't have auto-triggered it.
  deepen: z.boolean().optional(),
});

// Worst-case UTF-8 for the 500-character query, translation, and JSON framing.
export const ANSWER_MAX_BODY_BYTES = 2_304;

const STREAM_HEADERS = {
  'Content-Type': 'text/plain; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  // Disable proxy buffering so tokens flush as they arrive.
  'X-Accel-Buffering': 'no',
};

// Answers are deterministic for a given (model, day, translation, query, mode),
// so cache them in Valkey (day-scoped TTL) and replay on repeat.
const ANSWER_CACHE_TTL_SECONDS = 60 * 60 * 24;

// Tool-call budget for the verse-finder (dig) loop — enough for a couple of
// retrieval strategies (semantic + exact grep + a reference lookup) and a
// re-query after a pivot. Bounded as a cost control.
const DIG_STEP_BUDGET = 10;

// Read a string / count field off a tool's (untyped) input/output for the
// SERVER-authored reasoning narration — the parts are a broad union.
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
// never the model's prose — so the streamed "thinking" stays legible.
function describeToolCall(toolName: string, input: unknown): string {
  switch (toolName) {
    case 'semanticVerses': {
      const q = strField(input, 'query');
      return q
        ? `Searching all translations by meaning for “${q}”…`
        : 'Searching by meaning…';
    }
    case 'semanticPassages': {
      const q = strField(input, 'query');
      return q
        ? `Searching whole passages for the thought “${q}”…`
        : 'Searching whole passages by meaning…';
    }
    case 'grepVerse': {
      const p = strField(input, 'phrase');
      return p
        ? `Searching all translations for the exact wording “${p}”…`
        : 'Searching for the exact wording…';
    }
    case 'lookupReference': {
      const r = strField(input, 'reference');
      return r ? `Looking up ${r}…` : 'Looking up a reference…';
    }
    case 'crossRefs': {
      const r = strField(input, 'reference');
      return r
        ? `Pulling cross-references for ${r}…`
        : 'Pulling cross-references…';
    }
    default:
      return 'Searching Scripture…';
  }
}
function describeToolResult(toolName: string, output: unknown): string {
  switch (toolName) {
    case 'semanticVerses': {
      const n = arrLen(output, 'verses') ?? 0;
      return n > 0
        ? `Found ${n} candidate verse${n === 1 ? '' : 's'} by meaning.`
        : 'No verses matched by meaning.';
    }
    case 'semanticPassages': {
      const n = arrLen(output, 'passages') ?? 0;
      return n > 0
        ? `Found ${n} candidate passage${n === 1 ? '' : 's'}.`
        : 'No multi-verse passages matched.';
    }
    case 'grepVerse': {
      const n = arrLen(output, 'matches') ?? 0;
      return n > 0
        ? `Found the wording in ${n} verse${n === 1 ? '' : 's'}.`
        : 'No exact wording match — a paraphrase, or possibly not in the Bible.';
    }
    case 'lookupReference': {
      const n = arrLen(output, 'verses') ?? 0;
      return n > 0 ? 'Read that reference.' : 'That reference has no verse.';
    }
    case 'crossRefs': {
      const n = arrLen(output, 'crossReferences') ?? 0;
      return n > 0
        ? `Found ${n} cross-reference${n === 1 ? '' : 's'}.`
        : 'No cross-references.';
    }
    default:
      return 'Done.';
  }
}

export const Route = createFileRoute('/api/answer')({
  component: () => null,
  server: {
    handlers: {
      POST: async ({ request }) => {
        let parsed: z.infer<typeof bodySchema>;
        try {
          const body = await readRequestBody(request, ANSWER_MAX_BODY_BYTES);
          parsed = bodySchema.parse(JSON.parse(body));
        } catch (error) {
          if (error instanceof RequestBodyTooLargeError) {
            return new Response('Request body too large', { status: 413 });
          }
          return new Response('Invalid request body', { status: 400 });
        }

        const rateLimit = await enforceAnswerRateLimit({
          headers: request.headers,
          query: parsed.q,
          translation: parsed.translation,
          deepen: parsed.deepen === true,
        });
        if (!rateLimit.allowed) return answerRateLimitResponse(rateLimit);

        // Lazy server-only imports (keep the LLM/search/db deps out of the
        // client bundle; this route file is part of the shared route tree).
        // `@/ai/model` throws at import when OPENAI_API_KEY is unset, so a bare
        // dev instance with no key degrades to an empty answer (the card hides)
        // rather than 500ing.
        let mods: {
          answerModel: typeof import('@/ai/model').answerModel;
          ANSWER_MODEL: string;
          hybridSearchVerses: typeof import('@/search/search').hybridSearchVerses;
          streamText: typeof import('ai').streamText;
          stepCountIs: typeof import('ai').stepCountIs;
          cacheGet: typeof import('@/util/cache').cacheGet;
          cacheSet: typeof import('@/util/cache').cacheSet;
          recollectionGate: typeof import('@/ai/gate').recollectionGate;
          classifyVerseRecollection: typeof import('@/ai/gate').classifyVerseRecollection;
          classifyScriptureAnswerable: typeof import('@/ai/gate').classifyScriptureAnswerable;
          detectiveTools: typeof import('@/ai/agent').detectiveTools;
          INSTRUCTIONS: string;
          VERSE_DETECTIVE_INSTRUCTIONS: string;
          channelChunk: typeof import('@/ai/answer-stream').channelChunk;
        };
        try {
          const [model, search, ai, cache, gate, agent, stream] =
            await Promise.all([
              import('@/ai/model'),
              import('@/search/search'),
              import('ai'),
              import('@/util/cache'),
              import('@/ai/gate'),
              import('@/ai/agent'),
              import('@/ai/answer-stream'),
            ]);
          mods = {
            answerModel: model.answerModel,
            ANSWER_MODEL: model.ANSWER_MODEL,
            hybridSearchVerses: search.hybridSearchVerses,
            streamText: ai.streamText,
            stepCountIs: ai.stepCountIs,
            cacheGet: cache.cacheGet,
            cacheSet: cache.cacheSet,
            recollectionGate: gate.recollectionGate,
            classifyVerseRecollection: gate.classifyVerseRecollection,
            classifyScriptureAnswerable: gate.classifyScriptureAnswerable,
            detectiveTools: agent.detectiveTools,
            INSTRUCTIONS: agent.INSTRUCTIONS,
            VERSE_DETECTIVE_INSTRUCTIONS: agent.VERSE_DETECTIVE_INSTRUCTIONS,
            channelChunk: stream.channelChunk,
          };
        } catch (err) {
          // No API key / AI disabled: return an empty stream so the card hides
          // rather than showing an error.
          console.warn(
            'lets.bible answer: AI unavailable, returning empty answer:',
            err instanceof Error ? err.message : String(err),
          );
          return new Response('', { headers: STREAM_HEADERS });
        }

        const {
          answerModel,
          ANSWER_MODEL,
          hybridSearchVerses,
          streamText,
          stepCountIs,
          cacheGet,
          cacheSet,
          recollectionGate,
          classifyVerseRecollection,
          classifyScriptureAnswerable,
          detectiveTools,
          INSTRUCTIONS,
          VERSE_DETECTIVE_INSTRUCTIONS,
          channelChunk,
        } = mods;

        const encoder = new TextEncoder();
        const day = new Date().toISOString().slice(0, 10);

        // Frame a cached payload {answer, reasoning?} into the wire body: the
        // channel-tagged dig form when reasoning is present, else plain markdown.
        const digBody = (answer: string, reasoning: string | null) =>
          reasoning
            ? channelChunk('r', reasoning) + channelChunk('a', answer)
            : answer;

        // Cache keyed by (model, day, translation, mode, query). The `deepen`
        // discriminator keeps a manual "find the verse" result from colliding
        // with the auto cheap answer for the same query.
        const cacheKey = `letsbible-answer:v2:${ANSWER_MODEL}:${day}:${parsed.translation}:${
          parsed.deepen ? 'deepen:' : ''
        }${parsed.q}`;

        const cached = await cacheGet(cacheKey);
        if (cached) {
          try {
            const payload = JSON.parse(cached) as {
              answer: string;
              reasoning?: string | null;
            };
            return new Response(
              encoder.encode(
                digBody(payload.answer, payload.reasoning ?? null),
              ),
              { headers: STREAM_HEADERS },
            );
          } catch {
            // Legacy plain-string cache entry (pre-v2 shape) — replay as-is.
            return new Response(cached, { headers: STREAM_HEADERS });
          }
        }

        // --- Decide whether to run the verse-finder detective loop. ---
        // The deterministic gate digs outright on a reference+wording phrase;
        // otherwise the nano classifier tie-breaks the ambiguous case. A manual
        // "find the verse" (deepen) always digs.
        let wantDig = false;
        const decision = recollectionGate(parsed.q);
        if (decision === 'dig' || parsed.deepen === true) {
          wantDig = true;
        } else if (decision === 'ambiguous') {
          wantDig = await classifyVerseRecollection(parsed.q);
        }

        // ================= DIG PATH (verse-finder) =================
        if (wantDig) {
          const digPrompt = `The user is trying to RE-FIND or VERIFY a specific verse they half-remember (their wording, reference, or translation may be WRONG):

"${parsed.q}"

They are currently reading the ${parsed.translation} translation. Find the actual verse — or determine the phrase isn't in the Bible — and report it per the verse-finder playbook. You MUST call semanticVerses; also call grepVerse with the distinctive remembered wording, and lookupReference when they named a reference. Name the reference and translation from what the TOOLS return, never from the user's guess. If the phrase isn't Scripture, say so plainly and, when apt, point to the real related verse — never invent a citation.`;

          const digResult = streamText({
            model: answerModel,
            system: VERSE_DETECTIVE_INSTRUCTIONS,
            prompt: digPrompt,
            tools: detectiveTools,
            stopWhen: stepCountIs(DIG_STEP_BUDGET),
            onError: ({ error }) => {
              console.error(
                'lets.bible verse-finder streamText error:',
                error instanceof Error ? error.message : String(error),
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
              let answerText = '';
              let reasoningText = '';
              const emitReasoning = (line: string) => {
                reasoningText += (reasoningText ? '\n' : '') + line;
                controller.enqueue(
                  encoder.encode(channelChunk('r', `${line}\n`)),
                );
              };
              const deadline = Date.now() + 120_000;
              const idle = (ms: number) =>
                new Promise<'idle'>((resolve) => {
                  setTimeout(() => resolve('idle'), ms);
                });
              // Route one fullStream part to its channel. Shared by the main
              // loop and the final drain so the last delta is handled identically.
              const handlePart = (
                part: NonNullable<
                  Awaited<ReturnType<typeof reader.read>>['value']
                >,
              ) => {
                switch (part.type) {
                  case 'tool-call':
                    emitReasoning(describeToolCall(part.toolName, part.input));
                    break;
                  case 'tool-result':
                    emitReasoning(
                      describeToolResult(part.toolName, part.output),
                    );
                    break;
                  case 'reasoning-delta':
                    reasoningText += part.text;
                    controller.enqueue(
                      encoder.encode(channelChunk('r', part.text)),
                    );
                    break;
                  case 'text-delta':
                    answerText += part.text;
                    controller.enqueue(
                      encoder.encode(channelChunk('a', part.text)),
                    );
                    break;
                  case 'error':
                    console.warn(
                      'lets.bible dig fullStream error part:',
                      String(part.error),
                    );
                    break;
                  default:
                    break;
                }
              };
              let pending = reader.read();
              try {
                while (true) {
                  const res = await Promise.race([pending, idle(1_000)]);
                  if (res === 'idle') {
                    if (generationDone || Date.now() > deadline) break;
                    continue;
                  }
                  if (res.done) break;
                  handlePart(res.value);
                  pending = reader.read();
                }
                // Final bounded drain: `finishReason` (→ generationDone) can
                // resolve alongside the last delta still held in `pending`;
                // without this that delta is dropped from BOTH the stream and the
                // cached answer, truncating it. Keep reusing the same `pending`
                // so no in-flight chunk is discarded.
                const drainDeadline = Date.now() + 2_000;
                while (Date.now() <= drainDeadline) {
                  const res = await Promise.race([pending, idle(200)]);
                  if (res === 'idle' || res.done) break;
                  handlePart(res.value);
                  pending = reader.read();
                }
              } catch (err) {
                console.warn(
                  'lets.bible dig stream read error (closing with partial):',
                  err instanceof Error ? err.message : String(err),
                );
              }
              controller.close();
              void reader.cancel();
              if (answerText.trim().length > 0) {
                await cacheSet(
                  cacheKey,
                  JSON.stringify({
                    answer: answerText,
                    reasoning: reasoningText || null,
                  }),
                  ANSWER_CACHE_TTL_SECONDS,
                );
              }
            },
            cancel() {
              void reader.cancel();
            },
          });

          return new Response(digStream, { headers: STREAM_HEADERS });
        }

        // ================= CHEAP PATH (topical) =================
        // Off-topic (not about Scripture/faith) → one-line decline, no
        // generation. Fail-soft to answerable inside the gate.
        const answerable = await classifyScriptureAnswerable(parsed.q);
        if (!answerable) {
          const message = "That's outside what I can help with here.";
          await cacheSet(
            cacheKey,
            JSON.stringify({ answer: message, reasoning: null }),
            ANSWER_CACHE_TTL_SECONDS,
          );
          return new Response(message, { headers: STREAM_HEADERS });
        }

        // Retrieve grounding verses via hybrid (lexical + semantic) search so a
        // paraphrased question surfaces the right passages to cite.
        const hits = await hybridSearchVerses({
          q: parsed.q,
          translationId: parsed.translation,
          size: 12,
        });

        if (hits.length === 0) {
          const message =
            "I couldn't find anything in Scripture matching that. Try a different wording or a specific reference.";
          await cacheSet(
            cacheKey,
            JSON.stringify({ answer: message, reasoning: null }),
            ANSWER_CACHE_TTL_SECONDS,
          );
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

        // Tee the stream: forward tokens as they arrive AND accumulate the full
        // text to cache once generation completes.
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
            if (full.trim().length > 0) {
              await cacheSet(
                cacheKey,
                JSON.stringify({ answer: full, reasoning: null }),
                ANSWER_CACHE_TTL_SECONDS,
              );
            }
          },
        });

        return new Response(stream, { headers: STREAM_HEADERS });
      },
    },
  },
});
