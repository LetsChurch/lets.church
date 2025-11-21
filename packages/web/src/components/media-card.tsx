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
  size?: 'default' | 'small';
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
  size = 'default',
}: Props) {
  const _isSmall = size === 'small';

  return (
    <div className="group relative space-y-3">
      <div className="relative aspect-video">
        <div className="-translate-y-1/2 absolute top-1/2 right-0 left-0 aspect-video overflow-hidden rounded-lg border-fancy-pants bg-zinc-100 dark:bg-zinc-900">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt={title ?? 'Untitled'}
              className="size-full object-cover transition-transform duration-300 ease-out-expo will-change-transform group-hover:scale-[1.01]"
            />
          ) : null}
        </div>
        {progress ? (
          <div className="absolute inset-0 bg-gradient-to-t from-gray-950/70 to-50% to-transparent" />
        ) : null}
        <div className="absolute right-3 bottom-3 left-3 flex flex-col items-end gap-1">
          {duration ? (
            <div className="flex h-4 items-center justify-center rounded-full bg-gray-950/50 px-1.5 font-medium font-time text-[10px] text-shadow text-white leading-none tracking-tight backdrop-blur-sm dark:bg-white/50 dark:text-gray-950">
              {duration}
            </div>
          ) : null}
          {progress ? (
            <div className="h-[3px] w-full rounded-[3px] bg-white/20">
              <div
                className="h-full rounded-[3px] bg-brand/60"
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
          fallbackText={(channelName || 'Channel').charAt(0).toUpperCase()}
          className="size-8 flex-shrink-0 bg-white"
          fallbackClassName="bg-gray-200 text-gray-600"
        />
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="line-clamp-1 font-medium text-primary text-sm">
            <Link
              to="/media/$mediaId"
              params={{ mediaId }}
              className="after:absolute after:inset-0"
            >
              {title ?? 'Untitled'}
            </Link>
          </h3>
          <div className="flex items-center gap-1">
            <p className="overflow-hidden text-ellipsis whitespace-nowrap text-secondary text-xs">
              {channelName || 'Channel Name'}
            </p>
            {timestamp ? (
              <>
                <div className="size-[3px] shrink-0 rounded-[2px] bg-zinc-400 opacity-50" />
                <p className="whitespace-nowrap font-time text-secondary text-xs">
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
