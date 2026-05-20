import { useStore } from '@nanostores/react';
import bSearch from 'binary-search';
import { useEffect, useMemo, useRef } from 'react';
import { $currentTime, $setPlayAt } from '@/stores/player';
import { formatTime } from '@/util/format';

type TranscriptLine = {
  start: number;
  text: string;
};

type Props = {
  transcript: Array<TranscriptLine>;
  isTranscriptProcessing?: boolean;
};

export function Transcript({
  transcript,
  isTranscriptProcessing = false,
}: Props) {
  const currentTime = useStore($currentTime);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentI = useMemo(() => {
    const i = bSearch(
      transcript,
      currentTime,
      (tl, ct) => tl.start / 1000 - ct,
    );

    if (i < 0) {
      return -i - 2;
    }

    return i;
  }, [transcript, currentTime]);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const line = containerRef.current.querySelector(
      `[data-start="${transcript[currentI]?.start}"]`,
    );

    line?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      // @ts-expect-error: not typed in TypeScript
      container: 'nearest',
    });
  }, [currentI, transcript]);

  const handleClick = (start: number) => {
    $setPlayAt.set(start / 1000);
  };

  // Show processing state if transcript is still being generated
  if (isTranscriptProcessing || transcript.length === 0) {
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
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
        {/* <div /> */}
        {/* <h4 className="font-bold text-base text-primary leading-[1.4]"> */}
        {/*   Section Heading */}
        {/* </h4> */}

        {transcript.map((line, i) => (
          <button
            key={line.start}
            type="button"
            className="group contents cursor-pointer appearance-none text-left"
            onClick={() => handleClick(line.start)}
          >
            <div
              className={`pt-1 text-[10px] tabular-nums leading-[1.4] tracking-[-0.2px] ${
                i === currentI
                  ? 'text-brand'
                  : 'text-primary/50 group-hover:text-primary/70'
              }`}
              data-start={line.start}
            >
              {formatTime(line.start)}
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="text-primary text-sm leading-[1.4]">{line.text}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
