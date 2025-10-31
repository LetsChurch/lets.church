import { Avatar } from '@base-ui-components/react/avatar';
import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { AvatarCarousel } from '@/components/avatar-carousel';
import { EmptyState } from '@/components/empty-state';
import Header from '@/components/header';
import { MediaCard } from '@/components/media-card';
import { MediaGrid } from '@/components/media-grid';
import { useIsLoggedIn } from '@/hooks/use-is-logged-in';
import { trpcClient, useTRPC } from '@/trpc/react';
import { cn } from '@/util/cn';

type ChannelListItemProps = {
  channel: {
    id: string;
    name: string;
    avatarUrl?: string | null;
    followerCount?: number;
  };
  isFollowed?: boolean;
  isFollowing?: boolean;
  isUnfollowing?: boolean;
  isLoggedIn: boolean;
  onFollow?: (channelId: string) => void;
  onUnfollow?: (channelId: string) => void;
};

function ChannelListItem({
  channel,
  isFollowed = false,
  isFollowing = false,
  isUnfollowing = false,
  isLoggedIn,
  onFollow,
  onUnfollow,
}: ChannelListItemProps) {
  return (
    <div
      key={channel.id}
      className="flex items-center justify-between rounded-lg bg-surface-100 p-4"
    >
      <div className="flex items-center space-x-3">
        <Avatar.Root className="size-10 overflow-hidden rounded-full border-top-highlight">
          <Avatar.Image
            src={channel.avatarUrl || undefined}
            alt={channel.name}
            className="size-full object-cover"
          />
          <Avatar.Fallback
            className={cn(
              'flex size-full items-center justify-center rounded-full bg-zinc-900 font-bold text-primary',
              isFollowed ? 'text-sm' : 'text-lg',
            )}
          >
            {channel.name.charAt(0).toUpperCase()}
          </Avatar.Fallback>
        </Avatar.Root>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-bold text-primary text-sm">
            {channel.name}
          </h3>
          {!isFollowed && channel.followerCount !== undefined ? (
            <p className="text-primary text-xs opacity-60">
              {channel.followerCount} followers
            </p>
          ) : null}
        </div>
      </div>
      {isFollowed ? (
        <button
          type="button"
          onClick={() => onUnfollow?.(channel.id)}
          disabled={isUnfollowing}
          className="flex h-7 items-center justify-center rounded-full border border-white/10 bg-white/15 px-2.5 py-1.5 font-semibold text-primary/80 text-xs backdrop-blur-sm disabled:opacity-50"
        >
          Following
        </button>
      ) : isLoggedIn ? (
        <button
          type="button"
          onClick={() => onFollow?.(channel.id)}
          disabled={isFollowing}
          className="flex h-7 items-center justify-center rounded-full border border-white/10 bg-brand px-[10px] py-[6px] font-semibold text-primary text-xs disabled:opacity-50"
        >
          {isFollowing ? 'Following' : 'Follow'}
        </button>
      ) : (
        <Link
          to="/auth/register"
          className="flex h-8 items-center rounded-full border-top-highlight bg-brand px-3 font-bold text-primary text-sm"
        >
          Follow
        </Link>
      )}
    </div>
  );
}

export const Route = createFileRoute('/_main/following')({
  component: RouteComponent,
  loader: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );

    await context.queryClient.ensureQueryData(
      context.trpc.home.getSuggestedChannels.queryOptions({ limit: 15 }),
    );

    if (hasSession) {
      await context.queryClient.ensureQueryData(
        context.trpc.home.getFollowedChannels.queryOptions(),
      );
      await context.queryClient.ensureQueryData(
        context.trpc.home.getSubscriptionUploads.queryOptions({ limit: 60 }),
      );
    }

    return {};
  },
});

function RouteComponent() {
  const isLoggedIn = useIsLoggedIn();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: suggestedChannels } = useSuspenseQuery(
    trpc.home.getSuggestedChannels.queryOptions({ limit: 15 }),
  );

  const { data: followedChannels } = useQuery({
    ...trpc.home.getFollowedChannels.queryOptions(),
    enabled: isLoggedIn,
  });

  const { data: subscriptionUploads } = useQuery({
    ...trpc.home.getSubscriptionUploads.queryOptions({ limit: 60 }),
    enabled: isLoggedIn,
  });

  const initialSuggestedChannels = useRef(suggestedChannels ?? []).current;

  const [localFollowedIds, setLocalFollowedIds] = useState<Set<string>>(
    () => new Set(followedChannels?.map((c) => c.id) ?? []),
  );
  const [followingChannels, setFollowingChannels] = useState<Set<string>>(
    new Set(),
  );
  const [unfollowingChannels, setUnfollowingChannels] = useState<Set<string>>(
    new Set(),
  );

  const handleFollow = async (channelId: string) => {
    if (followingChannels.has(channelId)) return;

    setFollowingChannels((prev) => new Set(prev).add(channelId));
    setLocalFollowedIds((prev) => new Set(prev).add(channelId));

    try {
      await trpcClient.home.followChannel.mutate({ channelId });
      await queryClient.invalidateQueries({
        queryKey: trpc.home.getFollowedChannels.queryKey(),
      });
    } catch (_error) {
      setLocalFollowedIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(channelId);
        return newSet;
      });
    } finally {
      setFollowingChannels((prev) => {
        const newSet = new Set(prev);
        newSet.delete(channelId);
        return newSet;
      });
    }
  };

  const handleUnfollow = async (channelId: string) => {
    if (unfollowingChannels.has(channelId)) return;

    setUnfollowingChannels((prev) => new Set(prev).add(channelId));
    setLocalFollowedIds((prev) => {
      const newSet = new Set(prev);
      newSet.delete(channelId);
      return newSet;
    });

    try {
      await trpcClient.home.unfollowChannel.mutate({ channelId });
      await queryClient.invalidateQueries({
        queryKey: trpc.home.getFollowedChannels.queryKey(),
      });
    } catch (_error) {
      setLocalFollowedIds((prev) => new Set(prev).add(channelId));
    } finally {
      setUnfollowingChannels((prev) => {
        const newSet = new Set(prev);
        newSet.delete(channelId);
        return newSet;
      });
    }
  };

  const hasFollowedChannels = followedChannels && followedChannels.length > 0;

  return (
    <>
      <Header />
      <div className="px-16 pb-8">
        <div className="space-y-8">
          {!isLoggedIn ? (
            <EmptyState
              emptyTitle="Create an account to follow channels"
              emptyBody="Follow your favorite channels to get a customized feed and to ensure you don't miss new content!"
              emptyCta="Create Account"
            />
          ) : null}

          {hasFollowedChannels ? (
            <div className="my-6 overflow-hidden border-zinc-800 border-b pb-4">
              <AvatarCarousel items={followedChannels} />
            </div>
          ) : null}

          {hasFollowedChannels && subscriptionUploads ? (
            <MediaGrid>
              {subscriptionUploads.map((upload) => (
                <MediaCard
                  key={upload.id}
                  mediaId={upload.id}
                  title={upload.title}
                  thumbnailUrl={upload.thumbnailUrl}
                  channelName={upload.channel.name}
                  channelAvatarUrl={upload.channel.avatarUrl}
                />
              ))}
            </MediaGrid>
          ) : isLoggedIn && !hasFollowedChannels ? (
            <EmptyState
              emptyTitle="You're not following any channels yet"
              emptyBody="Follow your favorite channels to get a customized feed and to ensure you don't miss new content!"
            />
          ) : null}

          {!hasFollowedChannels && initialSuggestedChannels.length > 0 ? (
            <div>
              <h2 className="mb-4 font-bold text-lg text-primary">
                {isLoggedIn ? 'Suggested Channels' : 'Popular Channels'}
              </h2>
              <div className="space-y-3">
                {initialSuggestedChannels.map((channel) => (
                  <ChannelListItem
                    key={channel.id}
                    channel={channel}
                    isFollowed={localFollowedIds.has(channel.id)}
                    isFollowing={followingChannels.has(channel.id)}
                    isUnfollowing={unfollowingChannels.has(channel.id)}
                    isLoggedIn={isLoggedIn}
                    onFollow={handleFollow}
                    onUnfollow={handleUnfollow}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
