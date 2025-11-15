import { Link } from '@tanstack/react-router';
import type { PropsWithChildren } from 'react';
import { Avatar } from '@/components/avatar';
import { formatTime } from '@/util/format';

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
        <div className="-translate-y-1/2 absolute top-1/2 right-0 left-0 aspect-video overflow-hidden rounded-lg border-fancy-pants bg-zinc-100 dark:bg-zinc-900">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt={title}
              className="size-full object-cover"
            />
          ) : null}
        </div>
        <div className="absolute right-1.5 bottom-1.5 left-1.5 flex flex-col items-end gap-1 md:right-2 md:bottom-2 md:left-2">
          {duration ? (
            <div className="flex h-4 items-center justify-center rounded-full bg-gray-950/50 px-1.5 font-medium font-time text-[10px] text-shadow text-white leading-none tracking-tight backdrop-blur-sm md:h-5 md:px-2 md:text-xs dark:bg-white/50 dark:text-gray-950">
              {duration}
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 pb-px">
        <div className="space-y-2">
          <h4 className="line-clamp-2 font-bold text-primary text-sm md:text-base lg:text-lg">
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
              <div className="font-mono text-muted text-xs">
                {formatTime(transcriptSegment.start)}
              </div>
              <div
                className="text-primary/80 text-sm"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: escaped ElasticSearch output
                dangerouslySetInnerHTML={{ __html: transcriptSegment.text }}
              />
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5 md:gap-2">
          <Avatar
            src={channelImageUrl || undefined}
            alt={channelName}
            fallbackText={channelName.charAt(0).toUpperCase()}
            className="size-4 shrink-0 md:size-5 lg:size-6"
            fallbackClassName="bg-gray-200 text-gray-600 text-[8px] md:text-[10px] lg:text-xs"
          />
          <p className="overflow-hidden text-ellipsis whitespace-nowrap text-muted text-xs md:text-sm">
            {channelName}
          </p>
          {timestamp ? (
            <p className="whitespace-nowrap text-muted text-xs md:text-sm">
              &middot; {timestamp}
            </p>
          ) : null}
        </div>
        {children}
      </div>
    </div>
  );
}
