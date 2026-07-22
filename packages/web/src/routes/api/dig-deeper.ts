import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import {
  type AnswerSource,
  type AnswerStreamTerminalReason,
  answerSourceKey,
  channelChunk,
  SOURCES_DELIMITER,
  terminalChunk,
} from '@/ai/answer-stream';
import { DIG_DEEPER_MAX_MESSAGES } from '@/ai/dig-deeper-history';
import {
  finishDigDeeperStream,
  publicDigDeeperChunk,
} from '@/ai/dig-deeper-stream';
import { IncomingIdSchema } from '@/schemas/common';
import logger from '@/util/logger';

const moduleLogger = logger.child({ module: 'routes/api/dig-deeper' });

// Tool-call budget per turn — the same generous cap as the search-answer dig
// loop: the chat always runs the multi-strategy detective tools (hybrid + grep +
// window recall), so it needs room to search several ways and reconcile.
const CHAT_STEP_BUDGET = 12;

// Hard wall-clock cap on a single turn's generation (ms), mirroring the dig path.
const TURN_DEADLINE_MS = 120_000;

const messageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(8_000),
});

const bodySchema = z.object({
  // The full conversation so far, oldest-first, ending with the current user
  // turn. History is client-held for now (no server persistence yet) and resent
  // each turn so follow-ups resolve pronouns/references against prior turns.
  messages: z.array(messageSchema).min(1).max(DIG_DEEPER_MAX_MESSAGES),
  // Per-tab thread + stable per-browser id. The resource id participates in
  // abuse control; neither identifier is trusted as authentication.
  threadId: z.string().min(1).max(128),
  resourceId: z.string().min(1).max(128),
});

const STREAM_HEADERS = {
  'Content-Type': 'text/plain; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  'X-Accel-Buffering': 'no',
};

export const Route = createFileRoute('/api/dig-deeper')({
  component: () => null,
  server: {
    handlers: {
      // Conversational "Dig Deeper" search. Unlike /api/search-answer (single
      // query, gated + cached), this is multi-turn and ALWAYS runs the deep tool
      // loop: every turn threads the prior conversation as `messages`, streams the
      // reasoning/answer/discovered-source channels the client already parses, and
      // hydrates each [upload:…] citation into a per-turn source card. No answer
      // cache — a follow-up like "what about infants?" is only meaningful with its
      // history, so a raw-query cache would collide across conversations.
      POST: async ({ request }) => {
        let parsed: z.infer<typeof bodySchema>;
        try {
          parsed = bodySchema.parse(await request.json());
        } catch {
          return new Response('Invalid request body', { status: 400 });
        }

        // The last message must be the current user turn.
        const last = parsed.messages[parsed.messages.length - 1];
        if (last.role !== 'user') {
          return new Response('Last message must be from the user', {
            status: 400,
          });
        }

        // Every chat turn runs the expensive multi-tool loop, so charge the
        // shared limiter before importing retrieval/model dependencies.
        const { aiRateLimitResponse, enforceAiRateLimit } =
          await import('@/ai/abuse-control');
        const rateLimit = await enforceAiRateLimit({
          headers: request.headers,
          resourceId: parsed.resourceId,
          kind: 'dig-deeper',
        });
        if (!rateLimit.allowed) {
          moduleLogger.warn(
            {
              context: {
                limitedBy: rateLimit.limitedBy,
                retryAfterSeconds: rateLimit.retryAfterSeconds,
              },
            },
            'Dig Deeper request rate limited',
          );
          return aiRateLimitResponse(rateLimit);
        }

        // Server-only deps loaded lazily so pg / opensearch / db never enter the
        // client bundle (this route file is part of the shared route tree).
        const [
          { CHAT_INSTRUCTIONS, detectiveTools },
          { SEARCH_AGENT_MODEL, agentModel },
          { recordLlmCall },
          { hydrateUploads },
          { streamText, stepCountIs },
        ] = await Promise.all([
          import('@/ai/agent'),
          import('@/ai/model'),
          import('@letschurch/temporal/util/llm'),
          import('@/trpc/search/hydrate'),
          import('ai'),
        ]);

        const encoder = new TextEncoder();

        try {
          const genStart = Date.now();
          const result = streamText({
            model: agentModel,
            system: CHAT_INSTRUCTIONS,
            messages: parsed.messages,
            tools: detectiveTools,
            stopWhen: stepCountIs(CHAT_STEP_BUDGET),
            abortSignal: request.signal,
            timeout: TURN_DEADLINE_MS,
            onError: ({ error }) => {
              moduleLogger.error(
                {
                  context: {
                    error:
                      error instanceof Error ? error.message : String(error),
                  },
                },
                'streamText error during dig-deeper generation',
              );
            },
          });

          const reader = result.fullStream.getReader();
          let consumerCancelled = false;

          const stream = new ReadableStream<Uint8Array>({
            async start(controller) {
              // Wire format matches the search-answer dig path: an empty up-front
              // sources block, then CHANNEL_MARK-tagged segments — 'r' public
              // progress, 'a' answer, 's' hydrated AnswerSource[], and one final
              // 't' terminal frame. The terminal distinguishes true completion
              // from a timeout/error that merely closed the byte stream.
              controller.enqueue(
                encoder.encode(JSON.stringify([]) + SOURCES_DELIMITER),
              );

              let answerText = '';
              let failure: AnswerStreamTerminalReason | null = null;

              // Sources the model actually cited, hydrated (avatar + title +
              // thumbnail) for the per-turn cards. Populated from [upload:id@sec]
              // tokens as the answer streams. Citation identity includes the
              // timestamp: one upload can support several distinct moments.
              // Best-effort — a hydrate miss leaves the bare [source] link.
              const digSources: AnswerSource[] = [];
              const seenSourceKeys = new Set<string>();
              const flushes: Array<Promise<void>> = [];
              const CITE_RE = /\[upload:([1-9A-HJ-NP-Za-km-z]+)@(\d+)\]/g;
              const flushNewSources = async () => {
                const pending: Array<{ outId: string; sec: number }> = [];
                for (const m of answerText.matchAll(CITE_RE)) {
                  const outId = m[1];
                  const sec = Number(m[2]);
                  const key = answerSourceKey({ id: outId, startSeconds: sec });
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
                if (
                  fresh.length > 0 &&
                  !consumerCancelled &&
                  !request.signal.aborted
                ) {
                  controller.enqueue(
                    encoder.encode(channelChunk('s', JSON.stringify(fresh))),
                  );
                }
              };

              let deadlineTimer: ReturnType<typeof setTimeout> | null = null;
              const deadline = new Promise<'deadline'>((resolve) => {
                deadlineTimer = setTimeout(
                  () => resolve('deadline'),
                  TURN_DEADLINE_MS,
                );
              });
              let pending = reader.read();
              try {
                streamLoop: while (true) {
                  if (consumerCancelled || request.signal.aborted) {
                    failure = 'cancelled';
                    break;
                  }
                  const res = await Promise.race([pending, deadline]);
                  if (res === 'deadline') {
                    failure = 'timeout';
                    void reader.cancel('Dig Deeper turn deadline exceeded');
                    break;
                  }
                  if (res.done) break;

                  const output = publicDigDeeperChunk(res.value);
                  if (output?.kind === 'error') {
                    failure = 'provider-error';
                    moduleLogger.warn(
                      { context: { error: String(output.error) } },
                      'dig-deeper fullStream error part',
                    );
                    void reader.cancel('Dig Deeper provider error');
                    break streamLoop;
                  }
                  if (output?.kind === 'chunk') {
                    if (output.channel === 'a') {
                      answerText += output.text;
                    }
                    if (!consumerCancelled && !request.signal.aborted) {
                      controller.enqueue(
                        encoder.encode(
                          channelChunk(output.channel, output.text),
                        ),
                      );
                    }
                    if (output.channel === 'a') {
                      flushes.push(flushNewSources());
                    }
                  }
                  // Raw `reasoning-delta` parts map to null above and never cross
                  // the public stream boundary.
                  pending = reader.read();
                }
              } catch (err) {
                failure =
                  consumerCancelled || request.signal.aborted
                    ? 'cancelled'
                    : 'stream-error';
                if (failure !== 'cancelled') {
                  moduleLogger.warn(
                    {
                      context: {
                        error: err instanceof Error ? err.message : String(err),
                      },
                    },
                    'Error reading dig-deeper stream',
                  );
                }
              } finally {
                if (deadlineTimer) clearTimeout(deadlineTimer);
              }

              if (consumerCancelled || request.signal.aborted) {
                failure = 'cancelled';
              }

              let finishReason: string | null = null;
              if (failure === null) {
                const resolved = await Promise.resolve(
                  result.finishReason,
                ).catch(() => null);
                finishReason = typeof resolved === 'string' ? resolved : null;
              }

              const terminal = finishDigDeeperStream({
                answerText,
                failure,
                finishReason,
              });

              // Drain in-flight hydrations, then a final sweep for a citation
              // completed in the last delta — all before close, so no enqueue
              // lands on a closed controller.
              await Promise.allSettled(flushes);
              if (terminal.status !== 'cancelled') await flushNewSources();

              if (!consumerCancelled && !request.signal.aborted) {
                controller.enqueue(encoder.encode(terminalChunk(terminal)));
                controller.close();
              }
              void reader.cancel();

              try {
                const usage =
                  terminal.status === 'cancelled'
                    ? null
                    : ((await Promise.resolve(result.usage as unknown).catch(
                        () => null,
                      )) as {
                        inputTokens?: number;
                        outputTokens?: number;
                        promptTokens?: number;
                        completionTokens?: number;
                      } | null);
                await recordLlmCall({
                  model: SEARCH_AGENT_MODEL,
                  activity: 'searchDigDeeperAgent',
                  promptTokens:
                    usage?.inputTokens ?? usage?.promptTokens ?? null,
                  completionTokens:
                    usage?.outputTokens ?? usage?.completionTokens ?? null,
                  durationMs: Date.now() - genStart,
                  finishReason,
                  outcome:
                    terminal.status === 'done'
                      ? 'success'
                      : `dig_${terminal.reason.replaceAll('-', '_')}`,
                  responseText: answerText,
                });
              } catch (err) {
                moduleLogger.warn(
                  {
                    context: {
                      error: err instanceof Error ? err.message : String(err),
                    },
                  },
                  'Failed to record dig-deeper llm_call',
                );
              }

              moduleLogger.info(
                {
                  context: {
                    turns: parsed.messages.length,
                    sources: digSources.length,
                    terminal: terminal.status,
                    reason: terminal.status === 'done' ? null : terminal.reason,
                  },
                },
                'Dig-deeper turn finished',
              );
            },
            cancel() {
              consumerCancelled = true;
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
            'Dig-deeper stream failed',
          );
          return new Response('Failed to generate answer', { status: 500 });
        }
      },
    },
  },
});
