import type {
  AnswerStreamTerminal,
  AnswerStreamTerminalReason,
  StreamChannel,
} from './answer-stream';

export type PublicDigDeeperChunk =
  | { kind: 'chunk'; channel: Exclude<StreamChannel, 's' | 't'>; text: string }
  | { kind: 'error'; error: unknown }
  | null;

function field(obj: unknown, key: string): unknown {
  return obj && typeof obj === 'object' && key in obj
    ? (obj as Record<string, unknown>)[key]
    : null;
}

function stringField(obj: unknown, key: string): string | null {
  const value = field(obj, key);
  return typeof value === 'string' ? value : null;
}

function arrayLength(obj: unknown, key: string): number {
  const value = field(obj, key);
  return Array.isArray(value) ? value.length : 0;
}

export function describeDigDeeperToolCall(
  toolName: string,
  input: unknown,
): string {
  switch (toolName) {
    case 'grepTranscript': {
      const phrase = stringField(input, 'phrase');
      return phrase
        ? `Searching transcripts for the exact quote “${phrase}”…`
        : 'Searching transcripts for an exact quote…';
    }
    case 'recallWindows': {
      const query = stringField(input, 'query');
      return query
        ? `Searching by meaning for: “${query}”…`
        : 'Searching by meaning…';
    }
    case 'searchMedia': {
      const query = stringField(input, 'query');
      return query
        ? `Searching the library for “${query}”…`
        : 'Searching the library…';
    }
    case 'aggregateMedia': {
      const query = stringField(input, 'query');
      return query ? `Counting matches for “${query}”…` : 'Counting matches…';
    }
    case 'resolveChannel':
      return 'Resolving a ministry/channel name…';
    default:
      return 'Searching…';
  }
}

export function describeDigDeeperToolResult(
  toolName: string,
  output: unknown,
): string {
  switch (toolName) {
    case 'grepTranscript': {
      const count = arrayLength(output, 'matches');
      return count > 0
        ? `Found ${count} exact quote match${count === 1 ? '' : 'es'}.`
        : 'No exact matches for that quote.';
    }
    case 'recallWindows': {
      const count = arrayLength(output, 'spans');
      return count > 0
        ? `Recall surfaced ${count} candidate passage${count === 1 ? '' : 's'}.`
        : 'No semantically similar passages surfaced.';
    }
    case 'searchMedia': {
      const count = arrayLength(output, 'results');
      return count > 0
        ? `Found ${count} related video${count === 1 ? '' : 's'}.`
        : 'No related videos.';
    }
    case 'aggregateMedia': {
      const count = field(output, 'count');
      return typeof count === 'number'
        ? `${count} total match${count === 1 ? '' : 'es'}.`
        : 'Counted matches.';
    }
    default:
      return 'Done.';
  }
}

/**
 * Convert an ai-sdk fullStream part into public output. Raw provider reasoning
 * is intentionally dropped: only allowlisted, server-authored tool status and
 * answer text may cross this boundary.
 */
export function publicDigDeeperChunk(part: unknown): PublicDigDeeperChunk {
  const type = stringField(part, 'type');
  if (type === 'tool-call') {
    return {
      kind: 'chunk',
      channel: 'r',
      text: `${describeDigDeeperToolCall(
        stringField(part, 'toolName') ?? '',
        field(part, 'input'),
      )}\n`,
    };
  }
  if (type === 'tool-result') {
    return {
      kind: 'chunk',
      channel: 'r',
      text: `${describeDigDeeperToolResult(
        stringField(part, 'toolName') ?? '',
        field(part, 'output'),
      )}\n`,
    };
  }
  if (type === 'text-delta') {
    return {
      kind: 'chunk',
      channel: 'a',
      text: stringField(part, 'text') ?? '',
    };
  }
  if (type === 'error') {
    return { kind: 'error', error: field(part, 'error') };
  }
  // Includes `reasoning-delta`: never expose provider deliberation.
  return null;
}

export function finishDigDeeperStream(args: {
  answerText: string;
  failure: AnswerStreamTerminalReason | null;
  finishReason: string | null;
}): AnswerStreamTerminal {
  if (args.failure) {
    return args.failure === 'cancelled'
      ? { status: 'cancelled', reason: args.failure }
      : { status: 'error', reason: args.failure };
  }
  if (args.finishReason === 'length') {
    return { status: 'error', reason: 'truncated' };
  }
  if (args.finishReason !== 'stop') {
    return { status: 'error', reason: 'provider-error' };
  }
  if (!args.answerText.trim()) {
    return { status: 'error', reason: 'empty-answer' };
  }
  return { status: 'done' };
}
