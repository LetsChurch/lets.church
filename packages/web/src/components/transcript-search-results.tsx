import { useStore } from '@nanostores/react';
import bSearch from 'binary-search';
import { useMemo, useRef } from 'react';
import { $currentTime, $setPlayAt } from '@/stores/player';
import { $searchResults, type SearchResult } from '@/stores/transcript-search';
import { formatTime } from '@/util/format';

export function TranscriptSearchResults() {
  const searchResults = useStore($searchResults);
  const currentTime = useStore($currentTime);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentI = useMemo(() => {
    const i = bSearch(
      searchResults,
      currentTime,
      (tl: SearchResult, ct) => tl.start / 1000 - ct,
    );

    if (i < 0) {
      return -i - 2;
    }

    return i;
  }, [searchResults, currentTime]);

  const handleClick = (start: number) => {
    $setPlayAt.set(start / 1000);
  };

  // Empty state for no results
  if (searchResults.length === 0) {
    return (
      <div className="flex size-full items-center justify-center p-5">
        <p className="text-gray-500 text-sm">No results found</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="size-full overflow-auto p-5">
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
        {searchResults.map((line: SearchResult, i: number) => (
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
              <p
                className="[&_mark]:-my-0.5 [&_mark]:-mx-1 text-primary text-sm leading-[1.4] [&_mark]:rounded-sm [&_mark]:bg-orange-400/40 [&_mark]:px-1 [&_mark]:py-0.5 [&_mark]:text-primary"
                dangerouslySetInnerHTML={{ __html: line.highlighted }}
              />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
