import { atom } from 'nanostores';

// State for the media-page "ask a question about this video" feature. Kept as
// module-level nanostores atoms (like `transcript-search.ts`) so the segmented
// Ask button (media-actions), the transcript "Ask AI" row, and the answer card
// (main column) — which don't share a React parent — can coordinate.

// Whether the ask card (compose input + answer) is shown in the main column.
export const $videoAskActive = atom<boolean>(false);

// The asked question, which drives the streamed answer. Null while the card is
// in its bare input state (open, nothing asked yet).
export const $videoAskQuestion = atom<string | null>(null);

// A monotonic counter; bumped to request the card focus its compose input (e.g.
// when the "Ask" button opens it). A counter so repeated requests re-fire.
export const $focusVideoAskInput = atom<number>(0);

/**
 * Open the ask card in its input state and focus the input (the "Ask" button).
 * Clears any current answer so the card always returns to the bare input.
 */
export function openVideoAsk(): void {
  $videoAskActive.set(true);
  $videoAskQuestion.set(null);
  $focusVideoAskInput.set($focusVideoAskInput.get() + 1);
}

/** Ask a question — opens the card (if needed) and streams the answer. */
export function askVideoQuestion(question: string): void {
  const q = question.trim();
  if (!q) return;
  $videoAskActive.set(true);
  $videoAskQuestion.set(q);
}

/** Close the ask card and clear its state (dismiss, or on leaving the video). */
export function closeVideoAsk(): void {
  $videoAskActive.set(false);
  $videoAskQuestion.set(null);
}
