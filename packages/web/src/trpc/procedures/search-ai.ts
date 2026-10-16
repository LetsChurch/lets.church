import { AiAnswer, db } from '@letschurch/db';
import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { digDeeperInputSchema, runDigDeeperTurn } from '@/ai/dig-deeper.server';
import {
  runSearchAnswer,
  searchAnswerInputSchema,
} from '@/ai/search-answer.server';

import { relayAnswer } from '../answer-relay';
import { publicProcedure } from '../trpc';

// The AI answer procedures. Both stream and are routed through
// `httpBatchStreamLink` on the client (see trpc/react.tsx); their request
// bodies are capped per procedure (see trpc/body-limits.ts).
export const searchAiProcedures = {
  // The search results' AI answer card and the media page's "ask about this
  // video" (input.uploadId).
  answer: publicProcedure
    .input(searchAnswerInputSchema)
    .mutation(async function* ({ ctx, input, signal }) {
      yield* relayAnswer(
        await runSearchAnswer(input, {
          headers: ctx.req.headers,
          signal: signal ?? new AbortController().signal,
          appUserId: ctx.session?.appUserId ?? null,
        }),
      );
    }),

  // One Dig Deeper conversation turn.
  digDeeper: publicProcedure
    .input(digDeeperInputSchema)
    .mutation(async function* ({ ctx, input, signal }) {
      yield* relayAnswer(
        await runDigDeeperTurn(input, {
          headers: ctx.req.headers,
          signal: signal ?? new AbortController().signal,
          appUserId: ctx.session?.appUserId ?? null,
        }),
      );
    }),

  // Thumbs up/down on an AI answer — a search overview, a single-video ask, or
  // a Dig Deeper turn (null clears). The answer id is the random uuid the
  // stream's terminal frame gave the viewing browser, so holding it is the
  // capability for an anonymous answer; an answer saved for a signed-in viewer
  // can only be rated by that user (principle 4). A miss or a mismatch is the
  // same NOT_FOUND so ids can't be probed.
  rateAnswer: publicProcedure
    .input(
      z.object({
        answerId: z.uuid(),
        rating: z.enum(['LIKE', 'DISLIKE']).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const answer = await db.query.AiAnswer.findFirst({
        columns: { id: true, appUserId: true },
        where: (t, { eq }) => eq(t.id, input.answerId),
      });
      if (
        !answer ||
        (answer.appUserId !== null &&
          answer.appUserId !== ctx.session?.appUserId)
      ) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      await db
        .update(AiAnswer)
        .set({
          rating: input.rating,
          ratedAt: input.rating ? new Date() : null,
        })
        .where(eq(AiAnswer.id, answer.id));

      return { rating: input.rating };
    }),
};
