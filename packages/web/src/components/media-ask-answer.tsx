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
  // biome-ignore lint/correctness/useExhaustiveDependencies: cleanup keyed on mediaId
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
      className="my-4 flex items-center gap-2 rounded-2xl border-fancy-pants bg-indigo-500/10 px-3 py-2"
    >
      <IconSparkles
        size={16}
        className="shrink-0 text-brand"
        aria-hidden="true"
      />
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Ask a question about this video…"
        className="min-w-0 flex-1 bg-transparent text-primary text-sm placeholder:text-secondary focus:outline-none"
      />
      <button
        type="submit"
        disabled={!draft.trim()}
        className="shrink-0 rounded-full border-fancy-pants bg-gray-950/10 px-3 py-1 font-semibold text-primary/80 text-sm disabled:opacity-50 dark:bg-white/15"
      >
        Ask
      </button>
      <button
        type="button"
        onClick={closeVideoAsk}
        aria-label="Close"
        className="shrink-0 rounded-lg p-1.5 text-secondary transition-colors hover:bg-white/10 hover:text-primary"
      >
        <IconX size={16} />
      </button>
    </form>
  );
}
