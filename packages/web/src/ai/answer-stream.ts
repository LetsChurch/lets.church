// Shared protocol between the /api/search-answer route and the AnswerPanel.
// The streamed response is: <JSON AnswerSource[]><DELIMITER><body>. The delimiter
// is an ASCII Record Separator (0x1e) — it can't appear in the model's markdown,
// so the client can split the sources block from the body cleanly. Kept
// dependency free so the client can import it without pulling in server-only
// modules.
//
// The <body> is EITHER plain answer markdown (the cheap answer/overview path) OR,
// on the detective "dig" path, a sequence of channel-tagged segments so the
// reasoning stream and the settled answer can be rendered separately. Each
// segment is `CHANNEL_MARK + ('r' | 'a' | 's' | 't') + text` — 'r' = server-
// authored progress from observable tool calls, 'a' = answer, 's' = a JSON
// `AnswerSource[]` of sources the detective discovered, and 't' = an explicit
// terminal result. The client detects the dig shape by CHANNEL_MARK; without it
// the body is a legacy/plain answer.

export const SOURCES_DELIMITER = String.fromCharCode(0x1e);

// ASCII Unit Separator — segments channel-tagged chunks on the dig path. Like
// the record separator it can't appear in markdown, so it splits cleanly.
export const CHANNEL_MARK = String.fromCharCode(0x1f);

// 'r' = server-authored search progress, 'a' = answer, 's' = discovered-source
// metadata (JSON AnswerSource[]) the client merges, and 't' = the terminal state.
// A terminal frame lets the client distinguish a complete answer from a stream
// that merely reached EOF after a timeout/provider failure.
export type StreamChannel = 'r' | 'a' | 's' | 't';

/** Frame a channel-tagged chunk for the dig-path body. */
export function channelChunk(channel: StreamChannel, text: string): string {
  return CHANNEL_MARK + channel + text;
}

export type AnswerSource = {
  /** Outgoing (base58) upload id — links to /media/$mediaId. */
  id: string;
  title: string | null;
  channelName: string | null;
  /** Channel avatar (already a public/imgproxy URL), or null. */
  avatarUrl: string | null;
  /** Upload thumbnail (public URL), used as the hover-preview poster. */
  thumbnailUrl: string | null;
  /** Timestamp (seconds) of the most relevant passage, for the deep link. */
  startSeconds: number;
};

export type AnswerStreamTerminalReason =
  | 'cancelled'
  | 'empty-answer'
  | 'provider-error'
  | 'stream-error'
  | 'timeout'
  | 'truncated';

export type AnswerStreamTerminal =
  | { status: 'done' }
  | {
      status: 'cancelled' | 'error';
      reason: AnswerStreamTerminalReason;
    };

export type ParsedAnswerStream = {
  answer: string;
  reasoning: string;
  sources: AnswerSource[];
  terminal: AnswerStreamTerminal | null;
};

/** A citation is one media moment, not merely one upload. */
export function answerSourceKey(
  source: Pick<AnswerSource, 'id' | 'startSeconds'>,
) {
  return `${source.id}@${source.startSeconds}`;
}

/** Frame the explicit terminal marker for a streamed answer. */
export function terminalChunk(terminal: AnswerStreamTerminal): string {
  return channelChunk('t', JSON.stringify(terminal));
}

function isAnswerStreamTerminal(value: unknown): value is AnswerStreamTerminal {
  if (!value || typeof value !== 'object' || !('status' in value)) return false;
  const status = (value as { status?: unknown }).status;
  if (status === 'done') return true;
  if (status !== 'cancelled' && status !== 'error') return false;
  const reason = (value as { reason?: unknown }).reason;
  return (
    reason === 'cancelled' ||
    reason === 'empty-answer' ||
    reason === 'provider-error' ||
    reason === 'stream-error' ||
    reason === 'timeout' ||
    reason === 'truncated'
  );
}

// Drop a trailing PARTIAL citation token (mid-stream, before its closing `]`)
// and stray empty brackets so neither flashes in the prose. Complete [upload:…]
// tokens are kept for the renderer to linkify.
function cleanupPartialCitations(text: string): string {
  return text.replace(/\s*\[upload:[^\]]*$/, '').replace(/\s*\[\s*\]/g, '');
}

/**
 * Parse the shared answer wire format. Partial source/terminal JSON is ignored
 * until its network frame is complete; callers can safely reparse after every
 * received chunk.
 */
export function parseAnswerStream(raw: string): ParsedAnswerStream {
  const idx = raw.indexOf(SOURCES_DELIMITER);
  if (idx === -1) {
    return { answer: '', reasoning: '', sources: [], terminal: null };
  }

  let sources: AnswerSource[] = [];
  try {
    const parsed = JSON.parse(raw.slice(0, idx));
    if (Array.isArray(parsed)) sources = parsed;
  } catch {
    // The up-front sources block is not fully received yet.
  }

  const body = raw.slice(idx + SOURCES_DELIMITER.length);
  if (!body.includes(CHANNEL_MARK)) {
    return {
      answer: cleanupPartialCitations(body),
      reasoning: '',
      sources,
      terminal: null,
    };
  }

  let reasoning = '';
  let answer = '';
  let terminal: AnswerStreamTerminal | null = null;
  for (const seg of body.split(CHANNEL_MARK)) {
    if (!seg) continue;
    const channel = seg[0];
    const text = seg.slice(1);
    if (channel === 'r') reasoning += text;
    else if (channel === 'a') answer += text;
    else if (channel === 's') {
      try {
        const parsed: unknown = JSON.parse(text);
        if (Array.isArray(parsed)) {
          for (const source of parsed as AnswerSource[]) {
            if (
              source &&
              typeof source.id === 'string' &&
              typeof source.startSeconds === 'number' &&
              !sources.some(
                (existing) =>
                  answerSourceKey(existing) === answerSourceKey(source),
              )
            ) {
              sources.push(source);
            }
          }
        }
      } catch {
        // A partial source frame completes on a later network read.
      }
    } else if (channel === 't') {
      try {
        const parsed: unknown = JSON.parse(text);
        if (isAnswerStreamTerminal(parsed)) terminal = parsed;
      } catch {
        // A partial terminal frame completes on a later network read.
      }
    }
  }

  return {
    answer: cleanupPartialCitations(answer),
    reasoning: reasoning.trimEnd(),
    sources,
    terminal,
  };
}
