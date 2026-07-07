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
    <div className="group flex cursor-pointer items-stretch gap-3">
      <div className="relative aspect-video h-16 shrink-0">
        <div className="border-fancy-pants absolute top-1/2 right-0 left-0 aspect-video -translate-y-1/2 overflow-hidden rounded-lg bg-zinc-900">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt={title}
              className="ease-out-expo size-full object-cover transition-transform duration-300 will-change-transform group-hover:scale-[1.01]"
            />
          ) : null}
        </div>
        {progress ? (
          <div className="absolute inset-0 bg-linear-to-t from-gray-950/70 to-transparent to-50%" />
        ) : null}
        <div className="absolute right-1.5 bottom-1.5 left-1.5 flex flex-col items-end gap-1">
          {duration ? (
            <div className="text-primary flex h-4 items-center justify-center rounded-full bg-zinc-950/80 px-1.5 text-[10px] leading-none font-medium tracking-tight tabular-nums backdrop-blur-sm">
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
      <div className="flex min-w-0 flex-1 flex-col justify-between pb-px">
        <h4 className="text-primary line-clamp-2 text-sm font-bold">{title}</h4>
        <div className="flex items-center gap-1.5">
          <Avatar
            src={channelImageUrl || undefined}
            alt={channelName}
            className="size-4 shrink-0"
            fallbackClassName="bg-gray-200 text-gray-600 text-[8px]"
          />
          <p className="text-muted overflow-hidden text-xs text-ellipsis whitespace-nowrap">
            {channelName}
          </p>
          {timestamp ? (
            <p className="text-muted text-xs whitespace-nowrap">
              &middot; {timestamp}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
