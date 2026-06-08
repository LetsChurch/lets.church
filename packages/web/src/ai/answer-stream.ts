// Shared protocol between the /api/search-answer route and the AnswerPanel.
// The streamed response is: <answer markdown><DELIMITER><JSON AnswerSource[]>.
// The delimiter is an ASCII Record Separator (0x1e) — it can't appear in the
// model's markdown, so the client can split the stream cleanly. Kept dependency
// free so the client can import it without pulling in server-only modules.

export const SOURCES_DELIMITER = String.fromCharCode(0x1e);

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
