import { formatDate, formatTime } from '@/util/format';

export type FeaturedMediaSearchResultProps = {
  title: string;
  description?: string | null;
  thumbnailUrl?: string | null;
  channelName: string;
  lengthSeconds?: number | null;
  publishedAt?: Date | string | null;
  viewCount: number;
};

export function FeaturedMediaSearchResult({
  title,
  description,
  thumbnailUrl,
  channelName,
  lengthSeconds,
  publishedAt,
  viewCount,
}: FeaturedMediaSearchResultProps) {
  return (
    <div className="flex min-w-0 gap-3">
      <div className="bg-dashboard-raised aspect-video w-28 shrink-0 overflow-hidden rounded-md">
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt="" className="size-full object-cover" />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-primary truncate text-sm font-semibold">
          {title}
        </div>
        <div className="text-secondary mt-0.5 truncate text-xs">
          {channelName}
        </div>
        {description ? (
          <div className="text-secondary mt-1 line-clamp-1 text-xs">
            {description}
          </div>
        ) : null}
        <div className="text-muted mt-1.5 flex flex-wrap items-center gap-x-2 text-[0.7rem]">
          {lengthSeconds ? (
            <span>{formatTime(lengthSeconds * 1000)}</span>
          ) : null}
          <span>
            {viewCount.toLocaleString()} {viewCount === 1 ? 'view' : 'views'}
          </span>
          {publishedAt ? (
            <span>Published {formatDate(publishedAt, 'short')}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
