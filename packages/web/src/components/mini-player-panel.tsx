import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';
import { IconSparkles, IconTextCaption } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { memo, useEffect, useRef, useState } from 'react';

import { VideoAnswerPanel } from '@/components/answer-panel';
import {
  type TranscriptParagraph,
  TranscriptParagraphs,
} from '@/components/transcript-paragraphs';
import type { NowPlayingMedia } from '@/stores/now-playing';
import { seekTo } from '@/stores/player';
import { useTRPC } from '@/trpc/react';
import { cn } from '@/util/cn';
import { mediaPagePath } from '@/util/media-path';

/*
 * The extra views the persistent mini player can grow to show (see
 * persistent-player.tsx): the live transcript and "ask about this video". Both
 * drive the one persistent <Player> through the same global stores the media
 * page uses ($currentTime / seekTo), so seeking and word highlighting work
 * exactly as they do there.
 */

export type MiniPanel = 'transcript' | 'ask';

const toggleClassName = cn(
  'text-secondary flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md text-sm transition-colors',
  'hover:text-primary hover:bg-zinc-100 dark:hover:bg-white/10',
  'focus-visible:outline-2 focus-visible:outline-indigo-500',
  'data-[pressed]:text-primary data-[pressed]:bg-zinc-100 data-[pressed]:font-medium dark:data-[pressed]:bg-white/10',
);

export function MiniPanelToggles({
  value,
  onValueChange,
  className,
}: {
  value: MiniPanel | null;
  onValueChange: (value: MiniPanel | null) => void;
  className?: string;
}) {
  return (
    <ToggleGroup
      aria-label="Show alongside the player"
      value={value ? [value] : []}
      onValueChange={(next) => onValueChange((next[0] as MiniPanel) ?? null)}
      className={cn('flex gap-1', className)}
    >
      <Toggle value="transcript" className={toggleClassName}>
        <IconTextCaption size={16} aria-hidden />
        Transcript
      </Toggle>
      <Toggle value="ask" className={toggleClassName}>
        <IconSparkles
          size={16}
          aria-hidden
          className="text-indigo-500 dark:text-indigo-300"
        />
        Ask
      </Toggle>
    </ToggleGroup>
  );
}

const NO_PARAGRAPHS: Array<TranscriptParagraph> = [];

// Memoized: the host re-renders on every timeupdate, and the transcript tracks
// playback on its own (through $currentTime).
export const MiniPanelContent = memo(function MiniPanelContent({
  panel,
  media,
}: {
  panel: MiniPanel;
  media: NowPlayingMedia;
}) {
  // Once visited, Ask stays mounted (hidden) while the transcript shows, so
  // flipping between the two never drops a question or aborts its answer.
  const [askVisited, setAskVisited] = useState(panel === 'ask');
  if (panel === 'ask' && !askVisited) setAskVisited(true);

  return (
    <>
      {panel === 'transcript' ? <MiniTranscript media={media} /> : null}
      {askVisited ? (
        <div className={cn('size-full', panel !== 'ask' && 'hidden')}>
          <MiniAsk key={media.id} media={media} />
        </div>
      ) : null}
    </>
  );
});

function MiniTranscript({ media }: { media: NowPlayingMedia }) {
  const trpc = useTRPC();
  // Usually already cached from the media page.
  // `isTranscriptProcessing` is a snapshot from when the media page was left;
  // paragraphs arriving since then mean it's done.
  const { data, isPending } = useQuery({
    ...trpc.media.getTranscriptParagraphs.queryOptions({ mediaId: media.id }),
    refetchInterval: (query) =>
      media.isTranscriptProcessing && !query.state.data?.length ? 60000 : false,
  });
  const paragraphs = data ?? NO_PARAGRAPHS;

  if (isPending) {
    return (
      <div className="flex size-full items-center justify-center">
        <div className="border-t-brand dark:border-t-brand size-8 animate-spin rounded-full border-4 border-zinc-200 dark:border-zinc-800" />
      </div>
    );
  }

  return (
    <div className="fade-bottom size-full overflow-hidden">
      <TranscriptParagraphs
        paragraphs={paragraphs}
        linkPath={mediaPagePath(media.shortId, media.listId)}
        isTranscriptProcessing={
          media.isTranscriptProcessing && paragraphs.length === 0
        }
      />
    </div>
  );
}

function MiniAsk({ media }: { media: NowPlayingMedia }) {
  const [draft, setDraft] = useState('');
  // Counted so asking the same question again (e.g. after a failed answer)
  // still re-streams.
  const [question, setQuestion] = useState<{ text: string; n: number } | null>(
    null,
  );
  const inputRef = useRef<HTMLInputElement>(null);

  // Opening "Ask" is a request to type a question, but on touch screens
  // focusing would throw the keyboard up over the panel unasked.
  useEffect(() => {
    if (window.matchMedia('(pointer: fine)').matches) {
      inputRef.current?.focus();
    }
  }, []);

  return (
    <div className="flex size-full flex-col">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const q = draft.trim();
          if (q) setQuestion((prev) => ({ text: q, n: (prev?.n ?? 0) + 1 }));
        }}
        className="flex shrink-0 items-center gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800"
      >
        <IconSparkles size={16} className="text-brand shrink-0" aria-hidden />
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Ask a question about this video"
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
      </form>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {question ? (
          <VideoAnswerPanel
            key={question.n}
            // Same id the media page asks with, so both share one thread.
            mediaId={media.shortId}
            question={question.text}
            onCite={seekTo}
            variant="plain"
          />
        ) : (
          <p className="text-secondary text-sm">
            Answers cite moments in the video; select one to jump there.
          </p>
        )}
      </div>
    </div>
  );
}
