import { useStore } from '@nanostores/react';
import { IconSparkles, IconX } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';

import { VideoAnswerPanel } from '@/components/answer-panel';
import { $setPlayAt } from '@/stores/player';
import {
  $focusVideoAskInput,
  $videoAskActive,
  $videoAskQuestion,
  askVideoQuestion,
  closeVideoAsk,
} from '@/stores/video-ask';

/**
 * The "ask about this video" card, in the main column under the action bar
 * (above the Details/Overview tabs). Two states:
 *   - input:  a compose box to type a question (opened by the "Ask" button).
 *   - answer: once a question is asked (typed, picked from the dropdown, or the
 *             transcript "Ask AI" row), the question shows as a bold heading and
 *             the answer streams below it; citations seek this page's player.
 * Dismissable, and cleared when the video changes.
 */
export function MediaAskAnswer({ mediaId }: { mediaId: string }) {
  const active = useStore($videoAskActive);
  const question = useStore($videoAskQuestion);
  const focusReq = useStore($focusVideoAskInput);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Clear when switching videos / unmounting so an answer never leaks across.
  useEffect(() => () => closeVideoAsk(), [mediaId]);

  // Focus (and reset) the compose input whenever the "Ask" button opens it.
  useEffect(() => {
    if (focusReq === 0) return;
    setDraft('');
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [focusReq]);

  if (!active) return null;

  if (question) {
    return (
      <div className="relative my-4">
        <button
          type="button"
          onClick={closeVideoAsk}
          aria-label="Dismiss answer"
          className="absolute top-3 right-3 z-10 rounded-lg p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <IconX size={16} />
        </button>
        <VideoAnswerPanel
          key={question}
          mediaId={mediaId}
          question={question}
          onCite={(seconds) => $setPlayAt.set(seconds)}
        />
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        askVideoQuestion(draft);
      }}
      className="border-fancy-pants my-4 flex items-center gap-2 rounded-2xl bg-indigo-500/10 px-3 py-2"
    >
      <IconSparkles
        size={16}
        className="text-brand shrink-0"
        aria-hidden="true"
      />
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Ask a question about this video…"
        className="text-primary placeholder:text-secondary min-w-0 flex-1 bg-transparent text-sm focus:outline-none"
      />
      <button
        type="submit"
        disabled={!draft.trim()}
        className="border-fancy-pants text-primary/80 shrink-0 rounded-full bg-gray-950/10 px-3 py-1 text-sm font-semibold disabled:opacity-50 dark:bg-white/15"
      >
        Ask
      </button>
      <button
        type="button"
        onClick={closeVideoAsk}
        aria-label="Close"
        className="text-secondary hover:text-primary shrink-0 rounded-lg p-1.5 transition-colors hover:bg-white/10"
      >
        <IconX size={16} />
      </button>
    </form>
  );
}
