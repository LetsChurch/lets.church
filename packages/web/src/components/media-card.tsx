import { IconHeadphones } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';

import { Avatar } from '@/components/avatar';

export type Props = {
  mediaId: string;
  title?: string | null;
  thumbnailUrl?: string | null;
  channelName?: string;
  channelAvatarUrl?: string | null;
  duration?: string;
  timestamp?: string;
  progress?: number;
  resumeAtSeconds?: number;
  playlistId?: string;
};

export function MediaCard({
  mediaId,
  title,
  thumbnailUrl,
  channelName,
  channelAvatarUrl,
  duration,
  timestamp,
  progress,
  resumeAtSeconds,
  playlistId,
}: Props) {
  return (
    <div className="group relative space-y-3">
      <div className="relative aspect-video">
        <div className="border-fancy-pants absolute top-1/2 right-0 left-0 aspect-video -translate-y-1/2 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-900">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt={title ?? 'Untitled'}
              className="ease-out-expo size-full object-cover transition-transform duration-300 will-change-transform group-hover:scale-[1.01]"
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
        {progress ? (
          <div className="absolute inset-0 bg-linear-to-t from-gray-950/70 to-transparent to-50%" />
        ) : null}
        <div className="absolute right-3 bottom-3 left-3 flex flex-col items-end gap-1">
          {duration ? (
            <div className="text-shadow flex h-4 items-center justify-center rounded-full bg-gray-950/50 px-1.5 text-[10px] leading-none font-medium tracking-tight text-white tabular-nums backdrop-blur-sm dark:bg-white/50 dark:text-gray-950">
              {duration}
            </div>
          ) : null}
          {progress ? (
            <div className="h-[3px] w-full rounded-[3px] bg-white/20">
              <div
                className="bg-brand/60 h-full rounded-[3px]"
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex flex-row items-center gap-2">
        <Avatar
          src={channelAvatarUrl || undefined}
          alt={channelName || 'Channel'}
          className="size-8 shrink-0 bg-white"
          fallbackClassName="bg-gray-200 text-gray-600"
        />
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="text-primary line-clamp-1 text-sm font-medium">
            <Link
              to="/media/$mediaId"
              params={{ mediaId }}
              search={playlistId ? { list: playlistId } : undefined}
              hash={
                resumeAtSeconds === undefined
                  ? undefined
                  : `t=${resumeAtSeconds}`
              }
              className="after:absolute after:inset-0"
            >
              {title ?? 'Untitled'}
            </Link>
          </h3>
          <div className="flex items-center gap-1">
            <p className="text-secondary overflow-hidden text-xs text-ellipsis whitespace-nowrap">
              {channelName || 'Channel Name'}
            </p>
            {timestamp ? (
              <>
                <div className="size-[3px] shrink-0 rounded-xs bg-zinc-400 opacity-50" />
                <p className="text-secondary text-xs whitespace-nowrap">
                  {timestamp}
                </p>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
