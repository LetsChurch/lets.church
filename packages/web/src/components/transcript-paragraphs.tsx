import { useStore } from '@nanostores/react';
import bSearch from 'binary-search';
import { Fragment, memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { $currentTime, $setPlayAt } from '@/stores/player';
import { formatTime } from '@/util/format';

export type TranscriptWord = { word: string; start: number; end: number };

export type TranscriptParagraph = {
  order: number;
  start: number;
  end: number;
  speaker: string | null;
  text: string;
  words: Array<TranscriptWord>;
};

type Props = {
  paragraphs: Array<TranscriptParagraph>;
  isTranscriptProcessing?: boolean;
};

// Memoized so that, as playback ticks, only the paragraph(s) whose
// activeWordIndex/isActive actually changed re-render — not all of the
// (potentially thousands of) word spans.
const ParagraphView = memo(function ParagraphView({
  paragraph,
  activeWordIndex,
  isActive,
  onSeek,
}: {
  paragraph: TranscriptParagraph;
  activeWordIndex: number;
  isActive: boolean;
  onSeek: (start: number) => void;
}) {
  return (
    <>
      {/* Timestamp (seconds → ms for formatTime); click seeks to the paragraph. */}
      <button
        type="button"
        data-p={paragraph.order}
        onClick={() => onSeek(paragraph.start)}
        className={`self-start pt-1 text-left text-[10px] tabular-nums leading-[1.4] tracking-[-0.2px] ${
          isActive
            ? 'text-brand dark:text-primary'
            : 'text-primary/50 hover:text-primary/70'
        }`}
      >
        {formatTime(paragraph.start * 1000)}
      </button>
      <p
        className={`text-sm leading-[1.6] transition-colors ${
          isActive ? 'text-primary' : 'text-primary/60'
        }`}
      >
        {paragraph.words.map((w, i) => (
          <Fragment key={`${i}-${w.start}`}>
            <button
              type="button"
              onClick={() => onSeek(w.start)}
              // No horizontal padding — every word would get it, which
              // visibly inflates inter-word spacing. The bg hugs the letters
              // tightly when active; box size is identical between states so
              // no layout jitter as the highlight advances. Light mode: subtle
              // indigo tint + brand text (indigo-on-white reads well). Dark
              // mode: subtle primary tint with inherited primary text (avoids
              // the muddy brand-on-brand look since brand is also indigo).
              className={`cursor-pointer appearance-none rounded ${
                i === activeWordIndex
                  ? 'bg-brand/20 text-brand dark:bg-primary/20 dark:text-primary'
                  : 'hover:bg-primary/10'
              }`}
            >
              {w.word}
            </button>{' '}
          </Fragment>
        ))}
      </p>
    </>
  );
});

export function TranscriptParagraphs({
  paragraphs,
  isTranscriptProcessing = false,
}: Props) {
  const currentTime = useStore($currentTime);
  const containerRef = useRef<HTMLDivElement>(null);

  // Flattened word starts (seconds) for binary search; each maps back to its
  // paragraph + word position.
  const flat = useMemo(() => {
    const arr: Array<{
      start: number;
      paragraphIndex: number;
      wordIndex: number;
    }> = [];
    paragraphs.forEach((p, pi) => {
      p.words.forEach((w, wi) => {
        arr.push({ start: w.start, paragraphIndex: pi, wordIndex: wi });
      });
    });
    return arr;
  }, [paragraphs]);

  const active = useMemo(() => {
    if (flat.length === 0) return { paragraphIndex: -1, wordIndex: -1 };
    // currentTime is in seconds (NOT ms — the legacy VTT path divides by 1000).
    let i = bSearch(flat, currentTime, (w, ct) => w.start - ct);
    if (i < 0) i = -i - 2; // last word whose start <= currentTime
    if (i < 0) return { paragraphIndex: -1, wordIndex: -1 };
    return {
      paragraphIndex: flat[i]?.paragraphIndex ?? -1,
      wordIndex: flat[i]?.wordIndex ?? -1,
    };
  }, [flat, currentTime]);

  // Auto-scroll the active paragraph into view when it changes.
  useEffect(() => {
    if (active.paragraphIndex < 0 || !containerRef.current) return;
    const order = paragraphs[active.paragraphIndex]?.order;
    containerRef.current
      .querySelector(`[data-p="${order}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [active.paragraphIndex, paragraphs]);

  const handleSeek = useCallback((start: number) => {
    $setPlayAt.set(start);
  }, []);

  if (isTranscriptProcessing || paragraphs.length === 0) {
    return (
      <div className="flex size-full items-center justify-center p-5">
        <div className="flex max-w-sm flex-col items-center gap-4 text-center">
          {isTranscriptProcessing ? (
            <>
              <div className="size-10 animate-spin rounded-full border-4 border-zinc-200 border-t-brand dark:border-zinc-800 dark:border-t-brand" />
              <div className="flex flex-col gap-2">
                <p className="font-medium text-primary text-sm">
                  Transcript Processing
                </p>
                <p className="text-secondary text-xs">
                  The transcript for this media is currently being generated.
                  Check back soon.
                </p>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="font-medium text-primary text-sm">
                No Transcript Available
              </p>
              <p className="text-secondary text-xs">
                A transcript has not been generated for this media.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="size-full overflow-auto p-5">
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-3">
        {paragraphs.map((p, pi) => (
          <ParagraphView
            key={p.order}
            paragraph={p}
            activeWordIndex={
              pi === active.paragraphIndex ? active.wordIndex : -1
            }
            isActive={pi === active.paragraphIndex}
            onSeek={handleSeek}
          />
        ))}
      </div>
    </div>
  );
}
