import { parseAnswerStream } from './answer-stream';
import type { DigDeeperMessage } from './dig-deeper-client';

export const DIG_DEEPER_MAX_MESSAGES = 40;

const MAX_HISTORY_MESSAGE_CHARS = 8_000;
const MAX_HISTORY_SOURCES = 12;

export type DigDeeperHistoryTurn = {
  question: string;
  raw: string;
  status: 'cancelled' | 'done' | 'error' | 'streaming';
};

// Preserve the source map behind numbered overview citations when carrying a
// settled turn into the next request. Without this, the model would see `[1]`
// in the prior answer but not know which media moment it referred to.
function assistantHistoryContent(raw: string): string {
  const { answer, sources } = parseAnswerStream(raw);
  if (sources.length === 0) return answer.slice(0, MAX_HISTORY_MESSAGE_CHARS);

  const sourceLines = sources.slice(0, MAX_HISTORY_SOURCES).map((source, i) => {
    const title = (source.title ?? source.channelName ?? 'Untitled source')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 160);
    const channel = source.channelName
      ?.replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100);
    return `[${i + 1}] ${title}${channel ? ` — ${channel}` : ''} [upload:${source.id}@${source.startSeconds}]`;
  });
  const sourceContext = `\n\nSources from this answer:\n${sourceLines.join('\n')}`;
  const answerBudget = Math.max(
    0,
    MAX_HISTORY_MESSAGE_CHARS - sourceContext.length,
  );
  return answer.slice(0, answerBudget) + sourceContext;
}

/**
 * Build a rolling conversation for the next request. Failed, cancelled, and
 * in-flight turns keep their user question but never promote partial output to
 * an authoritative assistant message. Oldest whole turns are dropped first so
 * the new user message always fits under the server's hard message limit.
 */
export function buildDigDeeperMessages(
  turns: ReadonlyArray<DigDeeperHistoryTurn>,
  currentQuestion: string,
): DigDeeperMessage[] {
  const turnMessages = turns.map((turn): DigDeeperMessage[] => {
    const messages: DigDeeperMessage[] = [
      { role: 'user', content: turn.question },
    ];
    if (turn.status !== 'done') return messages;

    const assistantContent = assistantHistoryContent(turn.raw);
    if (assistantContent.trim()) {
      messages.push({ role: 'assistant', content: assistantContent });
    }
    return messages;
  });

  const kept: DigDeeperMessage[][] = [];
  let remaining = DIG_DEEPER_MAX_MESSAGES - 1;
  for (let i = turnMessages.length - 1; i >= 0; i--) {
    const exchange = turnMessages[i];
    if (exchange.length > remaining) break;
    kept.unshift(exchange);
    remaining -= exchange.length;
  }

  return [...kept.flat(), { role: 'user', content: currentQuestion }];
}
