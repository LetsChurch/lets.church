import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { Avatar } from '@/components/avatar';
import { AvatarCarousel } from '@/components/avatar-carousel';
import { EmptyState } from '@/components/empty-state';
import { LcModal, ModalHeader } from '@/components/lc-modal';
import MainLayout from '@/components/main-layout';
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
  onSignedOutFollow?: () => void;
};

function ChannelListItem({
  channel,
  isFollowed = false,
  isFollowing = false,
  isUnfollowing = false,
  isLoggedIn,
  onFollow,
  onUnfollow,
  onSignedOutFollow,
}: ChannelListItemProps) {
  return (
    <div
      key={channel.id}
      className="flex items-center justify-between rounded-lg bg-surface-100 p-4"
    >
      <div className="flex items-center space-x-3">
        <Avatar
          src={channel.avatarUrl || undefined}
          alt={channel.name}
          fallbackText={channel.name.charAt(0).toUpperCase()}
          className="size-10 border-fancy-pants"
          fallbackClassName={cn(
            'bg-zinc-900 font-bold',
            isFollowed ? 'text-sm' : 'text-lg',
          )}
        />
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
          className="flex h-7 items-center justify-center rounded-full border border-white/10 bg-brand px-2.5 py-1.5 font-semibold text-white text-xs disabled:opacity-50"
        >
          {isFollowing ? 'Following' : 'Follow'}
        </button>
      ) : (
        <button
          type="button"
          onClick={onSignedOutFollow}
          className="flex h-8 items-center rounded-full border-fancy-pants bg-brand px-3 font-bold text-sm text-white"
        >
          Follow
        </button>
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
  const [signInModalOpen, setSignInModalOpen] = useState(false);
  const [unfollowConfirmOpen, setUnfollowConfirmOpen] = useState(false);
  const [channelToUnfollow, setChannelToUnfollow] = useState<{
    id: string;
    name: string;
  } | null>(null);

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

  const handleUnfollowRequest = (channelId: string, channelName: string) => {
    setChannelToUnfollow({ id: channelId, name: channelName });
    setUnfollowConfirmOpen(true);
  };

  const handleUnfollowConfirm = async () => {
    if (!channelToUnfollow) return;
    const channelId = channelToUnfollow.id;

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
      setUnfollowConfirmOpen(false);
      setChannelToUnfollow(null);
    }
  };

  const hasFollowedChannels = followedChannels && followedChannels.length > 0;

  return (
    <>
      <MainLayout>
        <div className="space-y-8">
          {!isLoggedIn ? (
            <div className="px-4 sm:px-0">
              <EmptyState
                emptyTitle="Create an account to follow channels"
                emptyBody="Follow your favorite channels to get a customized feed and to ensure you don't miss new content!"
                emptyCta="Create Account"
              />
            </div>
          ) : null}

          {hasFollowedChannels ? (
            <div className="my-6">
              <div className="overflow-hidden pb-4">
                <AvatarCarousel items={followedChannels} />
              </div>
              <div className="border-zinc-800 border-b px-4 sm:px-0" />
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
            <div className="px-4 sm:px-0">
              <EmptyState
                emptyTitle="You're not following any channels yet"
                emptyBody="Follow your favorite channels to get a customized feed and to ensure you don't miss new content!"
              />
            </div>
          ) : null}

          {!hasFollowedChannels && initialSuggestedChannels.length > 0 ? (
            <div className="px-4 sm:px-0">
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
                    onUnfollow={(channelId) =>
                      handleUnfollowRequest(channelId, channel.name)
                    }
                    onSignedOutFollow={() => setSignInModalOpen(true)}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </MainLayout>

      {/* Sign In Modal */}
      <LcModal.Root open={signInModalOpen} onOpenChange={setSignInModalOpen}>
        <LcModal.Portal>
          <LcModal.Backdrop />
          <LcModal.Popup>
            <ModalHeader title="Create an Account" />
            <p className="mb-6 text-secondary text-sm">
              Create an account to follow channels and get a customized feed
              with your favorite content!
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setSignInModalOpen(false)}
                className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2 font-semibold text-primary text-sm"
              >
                Cancel
              </button>
              <Link
                to="/auth/register"
                className="flex flex-1 items-center justify-center rounded-lg bg-brand px-4 py-2 font-semibold text-sm text-white"
                onClick={() => setSignInModalOpen(false)}
              >
                Create Account
              </Link>
            </div>
          </LcModal.Popup>
        </LcModal.Portal>
      </LcModal.Root>

      {/* Unfollow Confirmation Modal */}
      <LcModal.Root
        open={unfollowConfirmOpen}
        onOpenChange={setUnfollowConfirmOpen}
      >
        <LcModal.Portal>
          <LcModal.Backdrop />
          <LcModal.Popup>
            <ModalHeader title="Unfollow Channel" />
            <p className="mb-6 text-secondary text-sm">
              Are you sure you want to unfollow{' '}
              <span className="font-semibold text-primary">
                {channelToUnfollow?.name}
              </span>
              ? You will no longer see their content in your feed.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setUnfollowConfirmOpen(false);
                  setChannelToUnfollow(null);
                }}
                className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2 font-semibold text-primary text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUnfollowConfirm}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2 font-semibold text-sm text-white"
              >
                Unfollow
              </button>
            </div>
          </LcModal.Popup>
        </LcModal.Portal>
      </LcModal.Root>
    </>
  );
}
