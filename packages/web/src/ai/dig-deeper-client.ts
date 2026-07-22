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
 * Read one Dig Deeper response to its explicit terminal frame. A bare EOF is an
 * error: it can mean the provider, proxy, or server stopped with a partial
 * answer, and must never be presented as a successful completion.
 */
export const requestDigDeeperTurn: DigDeeperTurnRequest = async ({
  messages,
  threadId,
  resourceId,
  signal,
  onText,
}) => {
  const response = await fetch('/api/dig-deeper', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, threadId, resourceId }),
    signal,
  });
  if (response.status === 429) {
    const parsedRetryAfter = Number(response.headers.get('Retry-After'));
    throw new DigDeeperRateLimitError(
      Number.isFinite(parsedRetryAfter) && parsedRetryAfter > 0
        ? Math.ceil(parsedRetryAfter)
        : 10,
    );
  }
  if (!response.ok || !response.body) {
    throw new Error(`Bad response: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let raw = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    raw += decoder.decode(value, { stream: true });
    onText(raw);
  }
  const finalText = decoder.decode();
  if (finalText) {
    raw += finalText;
    onText(raw);
  }

  return (
    parseAnswerStream(raw).terminal ?? {
      status: 'error',
      reason: 'stream-error',
    }
  );
};
