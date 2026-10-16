import type { AnswerStreamEvent } from '@/trpc/answer-relay';

import { type AnswerStreamTerminal, parseAnswerStream } from './answer-stream';

export type DigDeeperMessage = {
  role: 'assistant' | 'user';
  content: string;
};

export type DigDeeperTurnRequest = (args: {
  messages: DigDeeperMessage[];
  threadId: string;
  resourceId: string;
  signal: AbortSignal;
  onText: (raw: string) => void;
}) => Promise<AnswerStreamTerminal>;

export class DigDeeperRateLimitError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(
      `You're asking a little too quickly. Please try again in about ${retryAfterSeconds} seconds.`,
    );
    this.name = 'DigDeeperRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Fold one Dig Deeper turn's streamed events into the raw answer wire text,
 * reporting progress through `onText`, and return its explicit terminal frame.
 * A stream that ends without one is an error: it can mean the provider, proxy,
 * or server stopped with a partial answer, and must never be presented as a
 * successful completion.
 */
export async function readDigDeeperTurn(
  events: AsyncIterable<AnswerStreamEvent>,
  onText: (raw: string) => void,
): Promise<AnswerStreamTerminal> {
  let raw = '';
  for await (const event of events) {
    if (event.type === 'rate-limited') {
      throw new DigDeeperRateLimitError(event.retryAfterSeconds);
    }
    raw += event.text;
    onText(raw);
  }
  return (
    parseAnswerStream(raw).terminal ?? {
      status: 'error',
      reason: 'stream-error',
    }
  );
}

/** Run one Dig Deeper turn over the streaming `search.digDeeper` procedure. */
export const requestDigDeeperTurn: DigDeeperTurnRequest = async ({
  messages,
  threadId,
  resourceId,
  signal,
  onText,
}) => {
  // Loaded on demand so this module (and its tests) don't pull in the app's
  // tRPC client setup.
  const { trpcClient } = await import('@/trpc/react');
  const events = await trpcClient.search.digDeeper.mutate(
    { messages, threadId, resourceId },
    { signal },
  );
  return readDigDeeperTurn(events, onText);
};
