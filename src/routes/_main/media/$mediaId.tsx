import { AlertDialog } from '@base-ui-components/react/alert-dialog';
import { Avatar } from '@base-ui-components/react/avatar';
import { Tabs } from '@base-ui-components/react/tabs';
import {
  IconBookmark,
  IconDots,
  IconFlag,
  IconMessageCircle2,
  IconSearch,
  IconShare2,
  IconThumbDown,
  IconThumbUp,
} from '@tabler/icons-react';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { CommentsSection } from '@/components/comments-section';
import Header from '@/components/header';
import LcButton from '@/components/lc-button';
import LcButtonGroup from '@/components/lc-button-group';
import { MediaCarousel } from '@/components/media-carousel';
import { MobileDrawer } from '@/components/mobile-drawer';
import { Player } from '@/components/player';
import { Transcript } from '@/components/transcript';
import { useIsLoggedIn } from '@/hooks/use-is-logged-in';
import { $headerBackgroundImage } from '@/stores/header';
import { trpcClient, useTRPC } from '@/trpc/react';
import { cn } from '@/util/cn';
import { useVideoLayout } from '@/util/use-video-layout';

export const Route = createFileRoute('/_main/media/$mediaId')({
  component: RouteComponent,
  loader: async ({ context: { queryClient, trpc }, params }) => {
    const [media, viewData, transcript, rating, comments] = await Promise.all([
      queryClient.ensureQueryData(
        trpc.media.getMediaById.queryOptions({
          mediaId: params.mediaId,
        }),
      ),
      trpcClient.media.createUploadView.mutate({
        uploadRecordId: params.mediaId,
      }),
      queryClient.ensureQueryData(
        trpc.media.getTranscript.queryOptions({
          mediaId: params.mediaId,
        }),
      ),
      queryClient.ensureQueryData(
        trpc.media.getMediaRating.queryOptions({
          mediaId: params.mediaId,
        }),
      ),
      queryClient.ensureQueryData(
        trpc.media.getComments.queryOptions({
          mediaId: params.mediaId,
        }),
      ),
    ]);

    return {
      media,
      viewHash: viewData?.viewHash ?? '',
      transcript: transcript ?? [],
      rating,
      comments,
    };
  },
});

function RouteComponent() {
  const params = Route.useParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const isLoggedIn = useIsLoggedIn();
  const [transcriptDialogOpen, setTranscriptDialogOpen] = useState(false);
  const [commentsDialogOpen, setCommentsDialogOpen] = useState(false);
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const loaderData = Route.useLoaderData();
  const viewHash = loaderData.viewHash;
  const transcript = loaderData.transcript;

  const { data: media } = useSuspenseQuery(
    trpc.media.getMediaById.queryOptions({
      mediaId: params.mediaId,
    }),
  );

  const { data: ratingData } = useSuspenseQuery(
    trpc.media.getMediaRating.queryOptions({
      mediaId: params.mediaId,
    }),
  );

  const rateMutation = useMutation({
    mutationFn: trpc.media.rateMedia.mutationOptions().mutationFn,
    onMutate: async (variables) => {
      const queryKey = trpc.media.getMediaRating.queryKey({
        mediaId: params.mediaId,
      });

      // Cancel any outgoing refetches
      // (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({ queryKey });

      // Snapshot the previous value
      const previousRating = queryClient.getQueryData(queryKey);

      // Optimistically update to the new value
      queryClient.setQueryData(queryKey, (old) => {
        if (!old) return old;

        const result = { ...old };

        // Calculate the delta based on the user's action
        if (old.userRating === variables.rating) {
          // Toggling off - decrement the count
          if (variables.rating === 'LIKE') {
            result.likes = Math.max(0, old.likes - 1);
          } else {
            result.dislikes = Math.max(0, old.dislikes - 1);
          }
          result.userRating = null;
        } else if (old.userRating === null) {
          // First time rating - increment the count
          if (variables.rating === 'LIKE') {
            result.likes = old.likes + 1;
          } else {
            result.dislikes = old.dislikes + 1;
          }
          result.userRating = variables.rating;
        } else {
          // Changing rating - decrement old, increment new
          if (old.userRating === 'LIKE') {
            result.likes = Math.max(0, old.likes - 1);
          } else {
            result.dislikes = Math.max(0, old.dislikes - 1);
          }
          if (variables.rating === 'LIKE') {
            result.likes = old.likes + 1;
          } else {
            result.dislikes = old.dislikes + 1;
          }
          result.userRating = variables.rating;
        }

        return result;
      });

      // Return a context object with the snapshotted value
      return { previousRating };
    },
    onError: (_error, _variables, context) => {
      // Roll back to the previous value on any error
      if (context?.previousRating) {
        queryClient.setQueryData(
          trpc.media.getMediaRating.queryKey({
            mediaId: params.mediaId,
          }),
          context.previousRating,
        );
      }
    },
    onSettled: () => {
      // Always refetch after error or success to ensure we have the latest data
      queryClient.invalidateQueries({
        queryKey: trpc.media.getMediaRating.queryKey({
          mediaId: params.mediaId,
        }),
      });
    },
  });

  const handleRate = (rating: 'LIKE' | 'DISLIKE') => {
    // Check if user is logged in before attempting to rate
    if (!isLoggedIn) {
      setLoginDialogOpen(true);
      return;
    }

    rateMutation.mutate({
      mediaId: params.mediaId,
      rating,
    });
  };

  useEffect(() => {
    if (media.fullSizeThumbnailUrl) {
      $headerBackgroundImage.set(media.fullSizeThumbnailUrl);
    }
    return () => {
      $headerBackgroundImage.set(undefined);
    };
  }, [media.fullSizeThumbnailUrl]);

  const aspectWidth = media.width ?? 1920;
  const aspectHeight = media.height ?? 1080;

  const layout = useVideoLayout({
    aspectWidth,
    aspectHeight,
  });

  return (
    <div className="flex size-full flex-col">
      <Header />

      {/* Main Content Area */}
      <div
        className="z-5 mx-4 grid gap-4"
        style={{
          gridTemplateColumns: layout.showSidebar
            ? `${layout.containerWidth}px calc(var(--spacing) * 92)`
            : '1fr',
        }}
      >
        <div
          className="min-w-0"
          style={{ width: `${layout.containerWidth}px` }}
        >
          <div className="w-full">
            {/* Video Player */}
            <div
              className={cn(
                'z-100 w-full rounded-2xl',
                layout.showSidebar ? 'relative' : 'sticky top-0',
              )}
            >
              <Player
                uploadRecordId={params.mediaId}
                viewHash={viewHash}
                mediaSource={media.mediaSource}
                audioSource={media.audioSource}
                posterThumbnailUrl={media.posterThumbnailUrl}
                videoWidth={layout.videoWidth}
                videoHeight={layout.videoHeight}
                peaksJsonUrl={media.peaksJsonUrl}
                lengthSeconds={media.lengthSeconds}
              />
            </div>

            {/* Media Header */}
            <div className="mt-8 flex flex-col gap-3">
              {/* Title */}
              <h1 className="font-bold text-lg text-white leading-normal">
                {media.title}
              </h1>

              {/* Channel & Actions */}
              <div className="flex items-center gap-2.5 overflow-x-auto">
                {/* Channel Info */}
                <div className="flex flex-shrink-0 items-center gap-1.5">
                  <Avatar.Root className="size-7 overflow-hidden rounded-full border-top-highlight">
                    {media.channel.avatarUrl ? (
                      <Avatar.Image
                        src={media.channel.avatarUrl}
                        alt={media.channel.name}
                      />
                    ) : null}
                    <Avatar.Fallback className="flex size-full items-center justify-center rounded-full bg-indigo-500 font-bold text-white text-xs">
                      {media.channel.name.charAt(0).toUpperCase()}
                    </Avatar.Fallback>
                  </Avatar.Root>
                  <div className="flex flex-col gap-0.5">
                    <div className="font-semibold text-white text-xs">
                      {media.channel.name}
                    </div>
                    <div className="text-[10px] text-zinc-400">
                      {media.channel.subscriberCount.toLocaleString()}{' '}
                      {media.channel.subscriberCount === 1
                        ? 'follower'
                        : 'followers'}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="ml-auto flex flex-shrink-0 items-center gap-2.5">
                  {/* Reactions - Button Group */}
                  {/* <span className="isolate inline-flex items-center rounded-full border-top-highlight bg-white/15 backdrop-blur-sm"> */}
                  {/*   <button */}
                  {/*     type="button" */}
                  {/*     className="relative inline-flex items-center gap-0.5 py-1.5 pr-1.5 pl-2 font-semibold text-white/80 text-xs hover:bg-white/5 focus:z-10" */}
                  {/*   > */}
                  {/*     <IconThumbUp size={16} /> */}
                  {/*     13 */}
                  {/*   </button> */}
                  {/*   <div className="h-7 w-px bg-white/20" /> */}
                  {/*   <button */}
                  {/*     type="button" */}
                  {/*     className="relative inline-flex items-center py-1.5 pr-2 pl-1.5 font-semibold text-white/80 text-xs hover:bg-white/5 focus:z-10" */}
                  {/*   > */}
                  {/*     <IconThumbDown size={16} /> */}
                  {/*   </button> */}
                  {/* </span> */}

                  <LcButtonGroup
                    buttons={[
                      {
                        type: 'button',
                        onClick: () => handleRate('LIKE'),
                        className: cn(
                          ratingData.userRating === 'LIKE' && 'bg-white/10',
                        ),
                        children: (
                          <>
                            <IconThumbUp size={16} />
                            {ratingData.likes}
                          </>
                        ),
                      },
                      {
                        type: 'button',
                        onClick: () => handleRate('DISLIKE'),
                        className: cn(
                          ratingData.userRating === 'DISLIKE' && 'bg-white/10',
                        ),
                        children: <IconThumbDown size={16} />,
                      },
                    ]}
                  />

                  {/* Comments */}
                  <LcButton className="flex items-center gap-0.5">
                    <IconMessageCircle2 size={16} />
                    13
                  </LcButton>

                  {/* Share */}
                  <LcButton className="p-1.5">
                    <IconShare2 size={16} />
                  </LcButton>

                  {/* Divider */}
                  <div className="h-7 w-px bg-zinc-900" />

                  {/* Save */}
                  <LcButton className="flex items-center gap-0.5">
                    <IconBookmark size={16} />
                    Save
                  </LcButton>

                  {/* Follow */}
                  <LcButton className="flex items-center gap-0.5">
                    <IconFlag size={16} />
                    Follow
                  </LcButton>

                  {/* More */}
                  <LcButton className="p-1.5">
                    <IconDots size={16} />
                  </LcButton>
                </div>
              </div>
            </div>

            {/* Info Card */}
            <Tabs.Root
              defaultValue="details"
              className="relative isolate mt-7 flex flex-col overflow-hidden rounded-2xl border-top-highlight bg-zinc-900"
            >
              {/* Tabs */}
              <Tabs.List className="relative top-0 flex gap-4 border-zinc-800 border-b bg-zinc-900 px-5">
                <Tabs.Tab value="details" className="relative pt-1.5 pb-2">
                  <span className="font-medium text-sm text-white/70 data-[selected]:text-white data-[selected]:opacity-100">
                    Details
                  </span>
                </Tabs.Tab>
                <Tabs.Tab value="summary" className="relative pt-1.5 pb-2">
                  <span className="font-medium text-sm text-white/70 data-[selected]:text-white data-[selected]:opacity-100">
                    Summary
                  </span>
                </Tabs.Tab>
                {!layout.showSidebar ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setTranscriptDialogOpen(true)}
                      className="relative pt-1.5 pb-2"
                    >
                      <span className="font-medium text-sm text-white/70 hover:text-white">
                        Transcript
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCommentsDialogOpen(true)}
                      disabled={!media.userCommentsEnabled}
                      className="relative pt-1.5 pb-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="font-medium text-sm text-white/70 hover:text-white">
                        Comments
                      </span>
                    </button>
                  </>
                ) : null}
                <Tabs.Indicator
                  className="glow-md absolute h-0.5 rounded-t-sm bg-indigo-500 backdrop-blur-sm"
                  style={{
                    left: 'var(--active-tab-left)',
                    bottom: 0,
                    width: 'var(--active-tab-width)',
                  }}
                />
              </Tabs.List>

              {/* Details Content */}
              <Tabs.Panel value="details" className="relative text-left">
                <p className="p-5 text-sm text-white leading-[1.4]">
                  {media.description
                    ? media.description
                    : 'No description available'}
                </p>
                <div className="mx-5 border-zinc-800 border-t pt-[18px] pb-5">
                  <div className="flex gap-3">
                    <span className="font-medium text-white/70 text-xs">
                      {media._count.uploadViews.toLocaleString()} views
                    </span>
                    <span className="font-medium text-white/70 text-xs">
                      {new Date(
                        media.publishedAt || media.createdAt,
                      ).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                </div>
              </Tabs.Panel>

              {/* Summary Content */}
              <Tabs.Panel value="summary" className="relative text-left">
                <p className="p-5 text-sm text-white leading-[1.4]">
                  Summary content goes here
                </p>
              </Tabs.Panel>
            </Tabs.Root>

            {/* Comments Section - Desktop Only */}
            {layout.showSidebar ? (
              <CommentsSection
                mediaId={params.mediaId}
                onLoginRequired={() => setLoginDialogOpen(true)}
                commentsEnabled={media.userCommentsEnabled}
              />
            ) : null}

            {/* Related Content */}
            <div className="mt-10 pb-4">
              <h2 className="mb-4 font-bold text-lg text-white">
                Related Content
              </h2>
              <MediaCarousel
                items={[1, 2, 3, 4, 5, 6].map((i) => ({
                  id: `${i}`,
                  title: `Related Video ${i}`,
                  thumbnailUrl: null,
                  channelName: 'Channel Name',
                  channelAvatarUrl: null,
                  duration: '10:23',
                  timestamp: '2 days ago',
                  progress: i === 1 ? 45 : undefined,
                }))}
                fadeMargin="-mx-4 px-4"
                fadeSize={16}
                buttonPositioning="inside"
              />
            </div>
          </div>
        </div>

        {/* Right Sidebar - Transcript */}
        {layout.showSidebar ? (
          <div>
            <div className="sticky top-4 bottom-4 isolate flex h-[calc(100vh-6rem)] flex-col overflow-hidden rounded-2xl border-top-highlight bg-zinc-900">
              {/* Sidebar Header */}
              <div className="flex items-center justify-between border-zinc-800 border-b px-5 py-2.5">
                <h3 className="font-medium text-sm text-white">Transcript</h3>
                <div className="flex items-center">
                  <button
                    type="button"
                    className="rounded-lg p-2 hover:bg-white/10"
                  >
                    <IconSearch size={16} className="text-white/80" />
                  </button>
                </div>
              </div>

              {/* Transcript Items */}
              <div className="relative flex-1 overflow-hidden">
                <Transcript transcript={transcript} />
                {/* Gradient fade at bottom */}
                <div className="pointer-events-none absolute right-0 bottom-0 left-0 h-8 bg-gradient-to-b from-zinc-900/0 via-80% via-zinc-900/90 to-zinc-900" />
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Mobile Transcript Dialog */}
      <MobileDrawer.Root
        open={transcriptDialogOpen}
        onOpenChange={setTranscriptDialogOpen}
      >
        <MobileDrawer.Portal>
          <MobileDrawer.Content>
            {/* Dialog Header */}
            <div className="flex h-10 items-center justify-center gap-2 border-zinc-800 border-b border-solid px-5">
              <div className="flex grow items-baseline gap-2 pb-0.5">
                <MobileDrawer.Title className="font-bold text-base text-white">
                  Transcript
                </MobileDrawer.Title>
              </div>
              <MobileDrawer.Close className="flex size-7 items-center justify-center rounded-lg hover:bg-white/10">
                <IconSearch size={16} className="text-white/80" />
              </MobileDrawer.Close>
            </div>

            {/* Transcript Content */}
            <div className="relative flex-1 overflow-hidden">
              <Transcript transcript={transcript} />

              {/* Gradient fade at bottom */}
              <div className="pointer-events-none absolute right-0 bottom-0 left-0 h-8 bg-gradient-to-b from-zinc-900/0 via-80% via-zinc-900/90 to-zinc-900" />
            </div>
          </MobileDrawer.Content>
        </MobileDrawer.Portal>
      </MobileDrawer.Root>

      {/* Mobile Comments Dialog */}
      <MobileDrawer.Root
        open={commentsDialogOpen}
        onOpenChange={setCommentsDialogOpen}
      >
        <MobileDrawer.Portal>
          <MobileDrawer.Content>
            {/* Dialog Header */}
            <div className="flex h-10 items-center justify-center gap-2 border-zinc-800 border-b border-solid px-5">
              <div className="flex grow items-baseline gap-2 pb-0.5">
                <MobileDrawer.Title className="font-bold text-base text-white">
                  Comments
                </MobileDrawer.Title>
              </div>
              <MobileDrawer.Close className="flex size-7 items-center justify-center rounded-lg hover:bg-white/10">
                <IconMessageCircle2 size={16} className="text-white/80" />
              </MobileDrawer.Close>
            </div>

            {/* Comments Content */}
            <div className="relative flex-1 overflow-hidden">
              <div className="h-full overflow-y-auto">
                <CommentsSection
                  mediaId={params.mediaId}
                  onLoginRequired={() => setLoginDialogOpen(true)}
                  showContainer={false}
                  commentsEnabled={media.userCommentsEnabled}
                />
              </div>

              {/* Gradient fade at bottom */}
              <div className="pointer-events-none absolute right-0 bottom-0 left-0 h-8 bg-gradient-to-b from-zinc-900/0 via-80% via-zinc-900/90 to-zinc-900" />
            </div>
          </MobileDrawer.Content>
        </MobileDrawer.Portal>
      </MobileDrawer.Root>

      {/* Login Required Alert Dialog */}
      <AlertDialog.Root
        open={loginDialogOpen}
        onOpenChange={setLoginDialogOpen}
      >
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm" />
          <AlertDialog.Popup className="-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900 p-6 shadow-xl">
            <AlertDialog.Title className="mb-2 font-bold text-lg text-white">
              Login Required
            </AlertDialog.Title>
            <AlertDialog.Description className="mb-6 text-sm text-white/70">
              You need to be logged in to rate this content. Please sign in to
              continue.
            </AlertDialog.Description>
            <div className="flex justify-end gap-3">
              <AlertDialog.Close>
                <LcButton>Cancel</LcButton>
              </AlertDialog.Close>
              <Link to="/auth/login">
                <LcButton className="bg-indigo-600 hover:bg-indigo-700">
                  Sign In
                </LcButton>
              </Link>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}
