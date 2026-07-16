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
// segment is `CHANNEL_MARK + ('r' | 'a') + text` — 'r' = reasoning (server-
// authored, from observable tool calls), 'a' = answer. The client detects the
// dig shape by the presence of CHANNEL_MARK; without it the body is plain answer.

export const SOURCES_DELIMITER = String.fromCharCode(0x1e);

// ASCII Unit Separator — segments channel-tagged chunks on the dig path. Like
// the record separator it can't appear in markdown, so it splits cleanly.
export const CHANNEL_MARK = String.fromCharCode(0x1f);

// 'r' = reasoning (the loop's narrated searching/pivoting), 'a' = answer.
export type StreamChannel = 'r' | 'a';

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
