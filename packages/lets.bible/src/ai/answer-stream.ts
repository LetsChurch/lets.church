// Shared streaming protocol between the /api/answer route and the AiAnswer
// component. Kept dependency-free so the client can import it without pulling in
// server-only modules.
//
// lets.bible has NO up-front sources array (unlike the web app): Scripture
// citations are inline `[Book Chapter:Verse]` tokens rendered as reader links,
// so there is nothing to send ahead of the body. The response body is therefore
// EITHER:
//   • plain answer markdown (the cheap single-shot topical path), OR
//   • on the verse-finder "dig" path, a sequence of channel-tagged segments so
//     the streamed reasoning and the settled answer render separately.
// Each dig segment is `CHANNEL_MARK + ('r' | 'a') + text` — 'r' = reasoning
// (server-authored, from observable tool calls), 'a' = answer. The client
// detects the dig shape by the presence of CHANNEL_MARK; without it the whole
// body is plain answer markdown.

// ASCII Unit Separator — segments channel-tagged chunks on the dig path. It
// can't appear in the model's markdown, so the client can split cleanly.
export const CHANNEL_MARK = String.fromCharCode(0x1f);

// 'r' = reasoning (the loop's narrated searching/pivoting), 'a' = answer.
export type StreamChannel = 'r' | 'a';

/** Frame a channel-tagged chunk for the dig-path body. */
export function channelChunk(channel: StreamChannel, text: string): string {
  return CHANNEL_MARK + channel + text;
}
