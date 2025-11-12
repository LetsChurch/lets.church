import { Avatar } from '@/components/avatar';

export type Props = {
  title: string;
  thumbnailUrl?: string | null;
  channelName: string;
  channelImageUrl?: string | null;
  timestamp?: string;
  duration?: string;
  progress?: number;
};

export function MediaCompactCard({
  title,
  thumbnailUrl,
  channelName,
  channelImageUrl,
  timestamp,
  duration,
  progress,
}: Props) {
  return (
    <div className="flex cursor-pointer items-stretch gap-3">
      <div className="relative aspect-video h-16 shrink-0">
        <div className="-translate-y-1/2 absolute top-1/2 right-0 left-0 aspect-video overflow-hidden rounded-lg border-fancy-pants bg-zinc-900">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt={title}
              className="size-full object-cover"
            />
          ) : null}
        </div>
        {progress ? (
          <div className="absolute inset-0 bg-gradient-to-t from-gray-950/70 to-50% to-transparent" />
        ) : null}
        <div className="absolute right-1.5 bottom-1.5 left-1.5 flex flex-col items-end gap-1">
          {duration ? (
            <div className="flex h-4 items-center justify-center rounded-full bg-zinc-950/80 px-1.5 font-medium font-time text-[10px] text-primary leading-none tracking-tight backdrop-blur-sm">
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
      <div className="flex min-w-0 flex-1 flex-col justify-between pb-px">
        <h4 className="line-clamp-2 font-bold text-primary text-sm">{title}</h4>
        <div className="flex items-center gap-1.5">
          <Avatar
            src={channelImageUrl || undefined}
            alt={channelName}
            fallbackText={channelName.charAt(0).toUpperCase()}
            className="size-4 shrink-0"
            fallbackClassName="bg-gray-200 text-gray-600 text-[8px]"
          />
          <p className="overflow-hidden text-ellipsis whitespace-nowrap text-muted text-xs">
            {channelName}
          </p>
          {timestamp ? (
            <p className="whitespace-nowrap text-muted text-xs">
              &middot; {timestamp}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
