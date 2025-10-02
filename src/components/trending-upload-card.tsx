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
    <div key={id} className="flex gap-3">
      <div className="relative aspect-video w-24 flex-shrink-0 overflow-hidden rounded-lg border border-top-highlight bg-card">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={title ?? 'Untitled'}
            className="size-full object-cover"
          />
        ) : null}
        <div className="absolute right-1 bottom-1 rounded bg-black/80 px-1 text-primary text-xs">
          {duration}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
        <h3 className="line-clamp-2 font-medium text-primary text-sm">
          {title ?? 'Untitled'}
        </h3>
        <p className="text-secondary text-xs">{channelName}</p>
      </div>
    </div>
  );
}
