import { Link } from '@tanstack/react-router';
import { Avatar } from '@/components/avatar';

export type ChannelCardProps = {
  channelSlug: string;
  name: string;
  description?: string | null;
  avatarUrl?: string | null;
  subscriberCount: number;
};

export function ChannelCard({
  channelSlug,
  name,
  description,
  avatarUrl,
  subscriberCount,
}: ChannelCardProps) {
  const subscriberText =
    subscriberCount === 1
      ? '1 subscriber'
      : `${subscriberCount.toLocaleString()} subscribers`;

  const initials = name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .toUpperCase();

  return (
    <div className="group relative rounded-lg border-fancy-pants bg-white p-6 transition-all hover:shadow-lg dark:bg-zinc-900">
      <Link
        to="/channel/$slug"
        params={{ slug: channelSlug }}
        className="after:absolute after:inset-0"
      >
        <span className="sr-only">{name}</span>
      </Link>
      <div className="flex gap-4">
        <Avatar
          src={avatarUrl ?? undefined}
          alt={name}
          fallbackText={initials}
          className="size-20 shrink-0"
          fallbackClassName="bg-gradient-to-br from-brand/80 to-brand text-2xl font-semibold"
        />
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="truncate font-semibold text-lg text-primary">
            {name}
          </h3>
          {description ? (
            <p className="line-clamp-2 text-secondary text-sm">{description}</p>
          ) : null}
          <p className="text-muted text-xs">{subscriberText}</p>
        </div>
      </div>
    </div>
  );
}
