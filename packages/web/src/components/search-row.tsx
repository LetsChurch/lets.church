import { IconHeadphones } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import type { PropsWithChildren } from 'react';

import { Avatar } from '@/components/avatar';
import { formatTime } from '@/util/format';
import { joinAdjacentMarks } from '@/util/highlight';

export type Props = PropsWithChildren<{
  id: string;
  title: string;
  thumbnailUrl?: string | null;
  channelName: string;
  channelImageUrl?: string | null;
  timestamp?: string;
  duration?: string;
  transcriptSegment?: {
    start: number;
    text: string;
  };
}>;

export function SearchRow({
  id,
  title,
  thumbnailUrl,
  channelName,
  channelImageUrl,
  timestamp,
  duration,
  transcriptSegment,
  children,
}: Props) {
  return (
    <div className="group relative flex cursor-pointer items-stretch gap-3 md:gap-4">
      <div className="relative aspect-video h-16 shrink-0 md:h-24 lg:h-32">
        <div className="border-fancy-pants absolute top-1/2 right-0 left-0 aspect-video -translate-y-1/2 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-900">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt={title}
              className="size-full object-cover"
            />
          ) : (
            <div className="from-brand/20 relative flex size-full items-center justify-center bg-linear-to-b via-transparent via-33% to-transparent">
              <IconHeadphones
                size={64}
                className="text-zinc-400 dark:text-zinc-600"
              />
            </div>
          )}
        </div>
        <div className="absolute right-1.5 bottom-1.5 left-1.5 flex flex-col items-end gap-1 md:right-2 md:bottom-2 md:left-2">
          {duration ? (
            <div className="text-shadow flex h-4 items-center justify-center rounded-full bg-gray-950/50 px-1.5 text-[10px] leading-none font-medium tracking-tight text-white tabular-nums backdrop-blur-sm md:h-5 md:px-2 md:text-xs dark:bg-white/50 dark:text-gray-950">
              {duration}
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 pb-px">
        <div className="space-y-2">
          <h4 className="text-primary line-clamp-2 text-sm font-bold md:text-base lg:text-lg">
            <Link
              to="/media/$mediaId"
              params={{ mediaId: id }}
              className="after:absolute after:inset-0"
            >
              {title}
            </Link>
          </h4>
          {transcriptSegment ? (
            <div className="rounded-md bg-gray-950/5 p-2 md:p-3 dark:bg-white/5">
              <div className="text-muted text-xs tabular-nums">
                {formatTime(transcriptSegment.start)}
              </div>
              <div
                className="text-primary/80 text-sm"
                dangerouslySetInnerHTML={{
                  __html: joinAdjacentMarks(transcriptSegment.text),
                }}
              />
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5 md:gap-2">
          <Avatar
            src={channelImageUrl || undefined}
            alt={channelName}
            className="size-4 shrink-0 md:size-5 lg:size-6"
            fallbackClassName="bg-gray-200 text-gray-600 text-[8px] md:text-[10px] lg:text-xs"
          />
          <p className="text-muted overflow-hidden text-xs text-ellipsis whitespace-nowrap md:text-sm">
            {channelName}
          </p>
          {timestamp ? (
            <>
              <div className="size-[3px] shrink-0 rounded-xs bg-zinc-400 opacity-50" />
              <p className="text-muted text-xs whitespace-nowrap md:text-sm">
                {timestamp}
              </p>
            </>
          ) : null}
        </div>
        {children}
      </div>
    </div>
  );
}
