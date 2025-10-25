import { useStore } from '@nanostores/react';
import bSearch from 'binary-search';
import { useEffect, useMemo, useRef } from 'react';
import { $currentTime, $setPlayAt } from '@/stores/player';

type TranscriptLine = {
  start: number;
  text: string;
};

type Props = {
  transcript: Array<TranscriptLine>;
};

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function Transcript({ transcript }: Props) {
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

  return (
    <div ref={containerRef} className="size-full overflow-auto p-5">
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
        {/* <div /> */}
        {/* <h4 className="font-bold text-base text-white leading-[1.4]"> */}
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
              className={`pt-1 font-mono text-[10px] leading-[1.4] tracking-[-0.2px] ${
                i === currentI
                  ? 'text-indigo-500'
                  : 'text-white/50 group-hover:text-white/70'
              }`}
              data-start={line.start}
            >
              {formatTime(line.start)}
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="text-sm text-white leading-[1.4]">{line.text}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
