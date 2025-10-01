import { Avatar } from '@base-ui-components/react/avatar';

export type Props = {
  title: string;
  thumbnailUrl?: string | null;
  channelName: string;
  channelImageUrl?: string | null;
  timestamp?: string;
  duration?: string;
  progress?: number;
};

export function VideoCompactCard({
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
        <div className="-translate-y-1/2 absolute top-1/2 right-0 left-0 aspect-video overflow-hidden rounded-lg border-top-highlight bg-zinc-900">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt={title}
              className="size-full object-cover"
            />
          ) : null}
        </div>
        <div className="absolute right-1.5 bottom-1.5 left-1.5 flex flex-col items-end gap-1">
          {duration ? (
            <div className="flex h-4 items-center justify-center rounded-full bg-zinc-950/80 px-1.5 font-medium font-time text-[10px] text-white leading-none tracking-tight backdrop-blur-sm">
              {duration}
            </div>
          ) : null}
          {progress ? (
            <div className="h-[3px] w-full rounded-sm bg-white/20 backdrop-blur-sm">
              <div className="relative h-full rounded-md bg-indigo-500/40">
                <div
                  className="h-full rounded-md bg-gradient-to-r from-indigo-500/0 to-indigo-500/90"
                  style={{ width: `${Math.min(progress, 100)}%` }}
                />
                <div
                  className="absolute top-0 right-0 bottom-0 w-2 rounded-md shadow-[0px_2px_12px_0px_#6366f1] backdrop-blur-sm"
                  style={{ right: `${100 - Math.min(progress, 100)}%` }}
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-between pb-px">
        <h4 className="line-clamp-2 font-bold text-sm text-white">{title}</h4>
        <div className="flex items-center gap-1.5">
          <Avatar.Root className="size-4 shrink-0 overflow-hidden rounded-full">
            <Avatar.Image
              src={channelImageUrl || undefined}
              alt={channelName}
              className="size-full object-cover"
            />
            <Avatar.Fallback className="flex size-full items-center justify-center bg-gray-200 text-[8px] text-gray-600">
              {channelName.charAt(0).toUpperCase()}
            </Avatar.Fallback>
          </Avatar.Root>
          <p className="overflow-hidden text-ellipsis whitespace-nowrap text-xs text-zinc-400">
            {channelName}
          </p>
          {timestamp ? (
            <p className="whitespace-nowrap text-xs text-zinc-400">
              &middot; {timestamp}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
