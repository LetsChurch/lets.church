export function TrendingUploadCard({
  id,
  title,
  thumbnailUrl,
  channelName,
  duration = '36:21',
}: {
  id: string;
  title?: string | null;
  thumbnailUrl?: string | null;
  channelName: string;
  duration?: string;
}) {
  return (
    <div key={id} className="group flex gap-3">
      <div className="border-fancy-pants relative aspect-video w-24 flex-shrink-0 overflow-hidden rounded-lg border bg-zinc-100 dark:bg-zinc-900">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={title ?? 'Untitled'}
            className="ease-out-expo size-full object-cover transition-transform duration-300 will-change-transform group-hover:scale-[1.01]"
          />
        ) : null}
        <div className="text-primary absolute right-1 bottom-1 rounded bg-black/80 px-1 text-xs">
          {duration}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
        <h3 className="text-primary line-clamp-2 text-sm font-medium">
          {title ?? 'Untitled'}
        </h3>
        <p className="text-secondary text-xs">{channelName}</p>
      </div>
    </div>
  );
}
