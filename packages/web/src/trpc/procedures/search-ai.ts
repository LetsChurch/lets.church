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
    .mutation(async function* ({ ctx, input }) {
      yield* relayAnswer(
        await runSearchAnswer(input, {
          headers: ctx.req.headers,
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
        }),
      );
    }),
};
