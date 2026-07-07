import { Link } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

import { Avatar } from '@/components/avatar';
import { formatTime } from '@/util/format';

type PlaylistItem = {
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

type PlaylistSidebarProps = {
  listId: string;
  listType: 'playlist' | 'series';
  listTitle?: string;
  items: PlaylistItem[];
  currentMediaId: string;
};

export function PlaylistSidebar({
  listId,
  listType,
  listTitle,
  items,
  currentMediaId,
}: PlaylistSidebarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const currentIndex = items.findIndex((item) => item.id === currentMediaId);

  // Auto-scroll to current item on mount and when currentMediaId changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Use setTimeout to ensure DOM has updated
    const timeoutId = setTimeout(() => {
      const currentElement = container.querySelector('[data-current="true"]');
      if (currentElement) {
        currentElement.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        });
      }
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [currentMediaId]);

  return (
    <>
      {/* Sidebar Header */}
      <div className="flex flex-col gap-1 border-b border-zinc-200 px-5 py-2.5 dark:border-zinc-800">
        <h3 className="text-primary text-sm font-medium">
          {listTitle ?? (listType === 'playlist' ? 'Playlist' : 'Series')}
        </h3>
        <p className="text-secondary text-xs">
          {currentIndex >= 0 ? currentIndex + 1 : '?'} / {items.length}
        </p>
      </div>

      {/* Playlist Items */}
      <div className="flex-1 overflow-y-auto" ref={containerRef}>
        {items.map((item) => {
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
                {/* Thumbnail */}
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

                {/* Item Info */}
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
      </div>
    </>
  );
}
