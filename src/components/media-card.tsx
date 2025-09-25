import { Avatar } from '@base-ui-components/react/avatar';

export type Props = {
  title?: string | null;
  thumbnailUrl?: string | null;
  channelName?: string;
  channelAvatarUrl?: string | null;
};

export function MediaCard({
  title,
  thumbnailUrl,
  channelName,
  channelAvatarUrl,
}: Props) {
  return (
    <div className="space-y-3">
      <div className="aspect-video overflow-hidden rounded-lg border border-top-highlight bg-card">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={title ?? 'Untitled'}
            className="size-full object-cover"
          />
        ) : null}
      </div>
      <div className="flex flex-row items-center gap-2">
        <Avatar.Root className="size-8 flex-shrink-0 overflow-hidden rounded-full bg-white">
          <Avatar.Image
            src={channelAvatarUrl || undefined}
            alt={channelName || 'Channel'}
            className="size-full object-cover"
          />
          <Avatar.Fallback className="flex size-full items-center justify-center bg-gray-200 text-gray-600">
            {(channelName || 'Channel').charAt(0).toUpperCase()}
          </Avatar.Fallback>
        </Avatar.Root>
        <div className="space-y-1">
          <h3 className="line-clamp-1 font-medium text-primary text-sm">
            {title ?? 'Untitled'}
          </h3>
          <p className="text-secondary text-xs">
            {channelName || 'Channel Name'}
          </p>
        </div>
      </div>
    </div>
  );
}
