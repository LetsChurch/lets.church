import { Link } from '@tanstack/react-router';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { Avatar } from '@/components/avatar';
import { trpcClient } from '@/trpc/react';
import { formatTime } from '@/util/format';

export type PlaylistItem = {
  id: string;
  title: string | null;
  thumbnailUrl: string | null;
  lengthSeconds: number | null;
  publishedAt: Date | null;
  channel: {
    id: string;
    name: string;
    slug: string;
    avatarUrl: string | null;
  };
};

export type PlaylistPage = {
  items: PlaylistItem[];
  previousCursor: string | null;
  nextCursor: string | null;
};

export type PlaylistPageState = PlaylistPage;

type BoundaryDirection = 'before' | 'after';

export function mergePlaylistItems(
  current: PlaylistItem[],
  incoming: PlaylistItem[],
  direction: BoundaryDirection,
) {
  const ordered =
    direction === 'before'
      ? [...incoming, ...current]
      : [...current, ...incoming];
  const seen = new Set<string>();
  return ordered.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export async function loadPlaylistBoundary(
  state: PlaylistPageState,
  direction: BoundaryDirection,
  loadPage: (cursor: string) => Promise<PlaylistPage | null>,
): Promise<PlaylistPageState> {
  const cursor =
    direction === 'before' ? state.previousCursor : state.nextCursor;
  if (!cursor) return state;

  const page = await loadPage(cursor);
  if (!page) {
    return {
      ...state,
      [direction === 'before' ? 'previousCursor' : 'nextCursor']: null,
    };
  }

  return {
    items: mergePlaylistItems(state.items, page.items, direction),
    previousCursor:
      direction === 'before' ? page.previousCursor : state.previousCursor,
    nextCursor: direction === 'after' ? page.nextCursor : state.nextCursor,
  };
}

export function boundaryScrollTop(
  direction: BoundaryDirection,
  previous: {
    scrollHeight: number;
    scrollTop: number;
  },
  nextScrollHeight: number,
) {
  return direction === 'before'
    ? previous.scrollTop + nextScrollHeight - previous.scrollHeight
    : previous.scrollTop;
}

type PlaylistSidebarProps = {
  listId: string;
  listType: 'playlist' | 'series';
  listTitle?: string;
  initialPage: PlaylistPage;
  currentMediaId: string;
  currentPosition: number | null;
  total: number;
  loadPage?: (cursor: string) => Promise<PlaylistPage | null>;
};

export function PlaylistSidebar({
  listId,
  listType,
  listTitle,
  initialPage,
  currentMediaId,
  currentPosition,
  total,
  loadPage = (cursor) =>
    trpcClient.list.getListContext.query({ listId, cursor }),
}: PlaylistSidebarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const prependScrollRef = useRef<{
    scrollHeight: number;
    scrollTop: number;
  } | null>(null);
  const [pageState, setPageState] = useState(initialPage);
  const [loadingDirection, setLoadingDirection] =
    useState<BoundaryDirection | null>(null);

  useLayoutEffect(() => {
    const previous = prependScrollRef.current;
    const container = containerRef.current;
    if (!previous || !container) return;
    container.scrollTop = boundaryScrollTop(
      'before',
      previous,
      container.scrollHeight,
    );
    prependScrollRef.current = null;
  }, [pageState.items]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const timeoutId = setTimeout(() => {
      const currentElement = container.querySelector('[data-current="true"]');
      currentElement?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [currentMediaId]);

  const loadBoundary = useCallback(
    async (direction: BoundaryDirection) => {
      if (loadingDirection) return;
      const container = containerRef.current;
      if (direction === 'before' && container) {
        prependScrollRef.current = {
          scrollHeight: container.scrollHeight,
          scrollTop: container.scrollTop,
        };
      }

      setLoadingDirection(direction);
      try {
        setPageState(
          await loadPlaylistBoundary(pageState, direction, loadPage),
        );
      } finally {
        setLoadingDirection(null);
      }
    },
    [loadPage, loadingDirection, pageState],
  );

  return (
    <>
      <div className="flex flex-col gap-1 border-b border-zinc-200 px-5 py-2.5 dark:border-zinc-800">
        <h3 className="text-primary text-sm font-medium">
          {listTitle ?? (listType === 'playlist' ? 'Playlist' : 'Series')}
        </h3>
        <p className="text-secondary text-xs">
          {currentPosition ?? '?'} / {total}
        </p>
      </div>

      <div
        className="flex-1 overflow-y-auto"
        data-testid="playlist-scroll-container"
        ref={containerRef}
      >
        {pageState.previousCursor ? (
          <button
            type="button"
            className="text-secondary hover:text-primary w-full border-b border-zinc-200 px-3 py-2 text-xs dark:border-zinc-800"
            disabled={loadingDirection !== null}
            onClick={() => void loadBoundary('before')}
          >
            {loadingDirection === 'before' ? 'Loading…' : 'Load earlier items'}
          </button>
        ) : null}

        {pageState.items.map((item) => {
          const isCurrent = item.id === currentMediaId;
          return (
            <Link
              key={item.id}
              to="/media/$mediaId"
              params={{ mediaId: item.id }}
              search={{ list: listId }}
              data-current={isCurrent ? 'true' : 'false'}
            >
              <div
                className={`flex cursor-pointer gap-2 border-b border-zinc-200 px-3 py-2 hover:bg-white/5 dark:border-zinc-800 ${isCurrent ? 'bg-brand/10' : ''}`}
              >
                <div className="relative h-16 w-28 shrink-0">
                  <div className="size-full overflow-hidden rounded-lg border border-zinc-300 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
                    {item.thumbnailUrl ? (
                      <img
                        src={item.thumbnailUrl}
                        alt={item.title ?? 'Untitled'}
                        className="size-full object-cover"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center">
                        <span className="text-xs text-zinc-400">
                          No thumbnail
                        </span>
                      </div>
                    )}
                  </div>
                  {item.lengthSeconds ? (
                    <div className="text-shadow absolute right-1 bottom-1 flex h-4 items-center justify-center rounded-full bg-gray-950/70 px-1.5 text-[10px] leading-none font-medium tracking-tight text-white tabular-nums backdrop-blur-sm dark:bg-white/50 dark:text-gray-950">
                      {formatTime(item.lengthSeconds * 1000)}
                    </div>
                  ) : null}
                  {isCurrent ? (
                    <div className="bg-brand absolute top-1 left-1 rounded px-1.5 py-0.5 text-[10px] font-bold text-white">
                      NOW PLAYING
                    </div>
                  ) : null}
                </div>

                <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                  <h4 className="text-primary line-clamp-2 text-sm leading-snug font-medium">
                    {item.title ?? 'Untitled'}
                  </h4>
                  <div className="flex items-center gap-1.5">
                    <Avatar
                      src={item.channel.avatarUrl || undefined}
                      alt={item.channel.name}
                      className="size-4 shrink-0"
                      fallbackClassName="bg-gray-200 text-gray-600 text-[8px]"
                    />
                    <p className="text-secondary overflow-hidden text-xs text-ellipsis whitespace-nowrap">
                      {item.channel.name}
                    </p>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}

        {pageState.nextCursor ? (
          <button
            type="button"
            className="text-secondary hover:text-primary w-full px-3 py-2 text-xs"
            disabled={loadingDirection !== null}
            onClick={() => void loadBoundary('after')}
          >
            {loadingDirection === 'after' ? 'Loading…' : 'Load later items'}
          </button>
        ) : null}
      </div>
    </>
  );
}
