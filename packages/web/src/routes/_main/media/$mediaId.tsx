import { AlertDialog } from '@base-ui-components/react/alert-dialog';
import { UploadViewSource } from '@letschurch/db/types';
import { useStore } from '@nanostores/react';
import { IconMessageCircle2, IconSearch, IconX } from '@tabler/icons-react';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, Link, useLocation } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { CommentsSection } from '@/components/comments-section';
import LcButton from '@/components/lc-button';
import { LcModal, ModalHeader } from '@/components/lc-modal';
import MainLayout from '@/components/main-layout';
// import { MediaCarousel } from '@/components/media-carousel';
import { MediaHeader } from '@/components/media-header';
import { MediaInfoTabs } from '@/components/media-info-tabs';
import { MobileDrawer } from '@/components/mobile-drawer';
import { Player } from '@/components/player';
import { Transcript } from '@/components/transcript';
import { TranscriptSearchResults } from '@/components/transcript-search-results';
import { TranscriptSidebar } from '@/components/transcript-sidebar';
import { WindowSplitter } from '@/components/window-splitter';
import { useIsLoggedIn } from '@/hooks/use-is-logged-in';
import { IncomingIdSchema } from '@/schemas/common';
import { useSetBackgroundImage } from '@/stores/header';
import {
  $isSearchActive,
  $searchQuery,
  $searchResults,
  performSearch,
  resetSearch,
} from '@/stores/transcript-search';
import {
  DEFAULT_TRANSCRIPT_WIDTH,
  getInitialTranscriptWidth,
  setTranscriptWidth as saveTranscriptWidth,
} from '@/stores/transcript-width';
import { trpcClient, useTRPC } from '@/trpc/react';
import { useVideoLayout } from '@/util/use-video-layout';

export const Route = createFileRoute('/_main/media/$mediaId')({
  component: RouteComponent,
  params: {
    parse: (params) => ({
      mediaId: IncomingIdSchema.parse(params.mediaId),
    }),
    stringify: (params) => ({
      mediaId: params.mediaId,
    }),
  },
  loader: async ({ context: { queryClient, trpc }, params }) => {
    const [media, viewData, transcript, rating, comments] = await Promise.all([
      queryClient.ensureQueryData(
        trpc.media.getMediaById.queryOptions({
          mediaId: params.mediaId,
        }),
      ),
      trpcClient.media.createUploadView.mutate({
        uploadRecordId: params.mediaId,
        source: UploadViewSource.WEBSITE,
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

    // Exclude the probe field from media to avoid serialization issues
    const { probe: _probe, ...mediaWithoutProbe } = media;

    return {
      media: mediaWithoutProbe,
      viewHash: viewData?.viewHash ?? '',
      transcript: transcript ?? [],
      rating,
      comments,
    };
  },
  head: ({ loaderData }) => {
    const media = loaderData?.media;

    if (!media) {
      return {};
    }

    const title = media.title
      ? `${media.title} - Let's Church`
      : "Let's Church";
    const description =
      media.description ||
      `Watch ${media.title || 'this video'} on Let's Church`;

    // TODO: centralize the public url logic
    const url =
      typeof window !== 'undefined'
        ? window.location.href
        : `https://lets.church/media/${media.id}`;
    const imageUrl = media.fullSizeThumbnailUrl || media.posterThumbnailUrl;

    return {
      meta: [
        // Basic meta tags
        {
          title,
        },
        {
          name: 'description',
          content: description,
        },
        // OpenGraph tags
        {
          property: 'og:url',
          content: url,
        },
        {
          property: 'og:type',
          content: 'video.other',
        },
        {
          property: 'og:title',
          content: title,
        },
        {
          property: 'og:description',
          content: description,
        },
        ...(imageUrl
          ? [
              {
                property: 'og:image',
                content: imageUrl,
              },
            ]
          : []),
        ...(media.width
          ? [
              {
                property: 'og:image:width',
                content: media.width.toString(),
              },
            ]
          : []),
        ...(media.height
          ? [
              {
                property: 'og:image:height',
                content: media.height.toString(),
              },
            ]
          : []),
        {
          property: 'og:site_name',
          content: "Let's Church",
        },
        // Twitter Card tags
        {
          name: 'twitter:card',
          content: 'summary_large_image',
        },
        {
          property: 'twitter:domain',
          content: 'lets.church',
        },
        {
          property: 'twitter:url',
          content: url,
        },
        {
          name: 'twitter:title',
          content: title,
        },
        {
          name: 'twitter:description',
          content: description,
        },
        ...(imageUrl
          ? [
              {
                name: 'twitter:image',
                content: imageUrl,
              },
            ]
          : []),
        // Additional video metadata
        ...(media.lengthSeconds
          ? [
              {
                property: 'video:duration',
                content: media.lengthSeconds.toString(),
              },
            ]
          : []),
        ...(media.publishedAt
          ? [
              {
                property: 'article:published_time',
                content: new Date(media.publishedAt).toISOString(),
              },
            ]
          : []),
      ],
      links: [
        {
          rel: 'canonical',
          href: `https://lets.church/media/${media.id}`,
        },
      ],
    };
  },
});

function MobileTranscriptDrawerContent({
  transcript,
}: {
  transcript: Array<{ start: number; text: string }>;
}) {
  const isSearchActive = useStore($isSearchActive);
  const searchQuery = useStore($searchQuery);
  const searchResults = useStore($searchResults);

  const handleSearchClick = () => {
    $isSearchActive.set(true);
  };

  const handleCloseSearch = () => {
    resetSearch();
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    $searchQuery.set(query);
    void performSearch(query, transcript);
  };

  const hasQuery = searchQuery.trim().length > 0;

  return (
    <>
      <div className="flex h-10 items-center gap-2 border-zinc-200 border-b border-solid px-5 dark:border-zinc-800">
        {isSearchActive ? (
          <>
            <div className="relative flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={handleSearchChange}
                placeholder="Search transcript..."
                className="w-full rounded-md border border-gray-600 bg-transparent px-3 py-1.5 pr-8 text-primary text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                // biome-ignore lint/a11y/noAutofocus: this is rendered by user interaction
                autoFocus
              />
              {hasQuery ? (
                <div className="-translate-y-1/2 absolute top-1/2 right-2 text-gray-400 text-xs">
                  {searchResults.length}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={handleCloseSearch}
              className="flex size-7 items-center justify-center rounded-lg hover:bg-white/10"
              aria-label="Close search"
            >
              <IconX size={16} className="text-primary/80" />
            </button>
          </>
        ) : (
          <>
            <div className="flex grow items-baseline gap-2 pb-0.5">
              <MobileDrawer.Title className="font-bold text-base text-primary">
                Transcript
              </MobileDrawer.Title>
            </div>
            <button
              type="button"
              className="flex size-7 items-center justify-center rounded-lg hover:bg-white/10"
              onClick={handleSearchClick}
            >
              <IconSearch size={16} className="text-primary/80" />
            </button>
          </>
        )}
      </div>

      <div className="fade-bottom flex min-h-0 flex-1 flex-col overflow-hidden">
        {isSearchActive && hasQuery ? (
          <TranscriptSearchResults />
        ) : (
          <Transcript transcript={transcript} />
        )}
      </div>
    </>
  );
}

function RouteComponent() {
  const params = Route.useParams();
  const location = useLocation();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const isLoggedIn = useIsLoggedIn();
  const [transcriptDialogOpen, setTranscriptDialogOpen] = useState(false);
  const [commentsDialogOpen, setCommentsDialogOpen] = useState(false);
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [loginDialogAction, setLoginDialogAction] = useState<
    'rate' | 'save' | 'follow' | 'comment'
  >('rate');
  const [unfollowConfirmOpen, setUnfollowConfirmOpen] = useState(false);
  const loaderData = Route.useLoaderData();
  const viewHash = loaderData?.viewHash ?? '';
  const transcript = loaderData?.transcript ?? [];
  const [initialTimestamp, setInitialTimestamp] = useState<number | undefined>(
    undefined,
  );
  const [transcriptWidth, setTranscriptWidth] = useState(
    getInitialTranscriptWidth(),
  );

  // Parse timestamp from URL hash on mount
  useEffect(() => {
    if (location.hash) {
      const hashParams = new URLSearchParams(location.hash);
      const t = hashParams.get('t');

      if (t) {
        const timestamp = Number.parseFloat(t);
        if (!Number.isNaN(timestamp)) {
          setInitialTimestamp(timestamp);
        }
      }
    }
  }, [location.hash]);

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

  const followMutation = useMutation({
    mutationFn: trpc.home.followChannel.mutationOptions().mutationFn,
    onMutate: async () => {
      const queryKey = trpc.media.getMediaById.queryKey({
        mediaId: params.mediaId,
      });

      await queryClient.cancelQueries({ queryKey });
      const previousMedia = queryClient.getQueryData(queryKey);

      queryClient.setQueryData(queryKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          channel: {
            ...old.channel,
            isFollowing: true,
            subscriberCount: old.channel.subscriberCount + 1,
          },
        };
      });

      return { previousMedia };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousMedia) {
        queryClient.setQueryData(
          trpc.media.getMediaById.queryKey({
            mediaId: params.mediaId,
          }),
          context.previousMedia,
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.media.getMediaById.queryKey({
          mediaId: params.mediaId,
        }),
      });
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: trpc.home.unfollowChannel.mutationOptions().mutationFn,
    onMutate: async () => {
      const queryKey = trpc.media.getMediaById.queryKey({
        mediaId: params.mediaId,
      });

      await queryClient.cancelQueries({ queryKey });
      const previousMedia = queryClient.getQueryData(queryKey);

      queryClient.setQueryData(queryKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          channel: {
            ...old.channel,
            isFollowing: false,
            subscriberCount: Math.max(0, old.channel.subscriberCount - 1),
          },
        };
      });

      return { previousMedia };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousMedia) {
        queryClient.setQueryData(
          trpc.media.getMediaById.queryKey({
            mediaId: params.mediaId,
          }),
          context.previousMedia,
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.media.getMediaById.queryKey({
          mediaId: params.mediaId,
        }),
      });
    },
  });

  const saveMutation = useMutation({
    mutationFn: trpc.library.saveMedia.mutationOptions().mutationFn,
    onMutate: async () => {
      const queryKey = trpc.media.getMediaById.queryKey({
        mediaId: params.mediaId,
      });

      await queryClient.cancelQueries({ queryKey });
      const previousMedia = queryClient.getQueryData(queryKey);

      // TODO: should we do more of this, and less of the separate queries for mutable data?
      queryClient.setQueryData(queryKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          isSaved: !old.isSaved,
        };
      });

      return { previousMedia };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousMedia) {
        queryClient.setQueryData(
          trpc.media.getMediaById.queryKey({
            mediaId: params.mediaId,
          }),
          context.previousMedia,
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.media.getMediaById.queryKey({
          mediaId: params.mediaId,
        }),
      });
    },
  });

  const handleRate = (rating: 'LIKE' | 'DISLIKE') => {
    // Check if user is logged in before attempting to rate
    if (!isLoggedIn) {
      setLoginDialogAction('rate');
      setLoginDialogOpen(true);
      return;
    }

    rateMutation.mutate({
      mediaId: params.mediaId,
      rating,
    });
  };

  const handleFollowToggle = () => {
    // Check if user is logged in before attempting to follow
    if (!isLoggedIn) {
      setLoginDialogAction('follow');
      setLoginDialogOpen(true);
      return;
    }

    if (media.channel.isFollowing) {
      setUnfollowConfirmOpen(true);
    } else {
      followMutation.mutate({
        channelId: media.channel.id,
      });
    }
  };

  const handleUnfollowConfirm = () => {
    unfollowMutation.mutate({
      channelId: media.channel.id,
    });
    setUnfollowConfirmOpen(false);
  };

  const handleSaveToggle = () => {
    // Check if user is logged in before attempting to save
    if (!isLoggedIn) {
      setLoginDialogAction('save');
      setLoginDialogOpen(true);
      return;
    }

    saveMutation.mutate({
      mediaId: params.mediaId,
    });
  };

  useSetBackgroundImage(media.fullSizeThumbnailUrl ?? undefined);

  const aspectWidth = media.width ?? 1920;
  const aspectHeight = media.height ?? 1080;

  const layout = useVideoLayout({
    aspectWidth,
    aspectHeight,
    transcriptSidebarWidth: transcriptWidth,
  });

  const handleTranscriptWidthChange = (width: number) => {
    setTranscriptWidth(width);
    layout.setTranscriptWidth(width);
    saveTranscriptWidth(width);
  };

  return (
    <MainLayout containerClassName="mx-4">
      {/* Main Content Area */}
      <div
        className="grid"
        style={{
          gridTemplateColumns: layout.showSidebar
            ? `${layout.containerWidth}px auto ${transcriptWidth}px`
            : '1fr',
        }}
      >
        <div
          className="mb-10 min-w-0"
          style={{ width: `${layout.containerWidth}px` }}
        >
          {/* TODO: remove mb-10 when related content is implemented */}
          <div className="mb-10 w-full">
            <Player
              key={params.mediaId}
              uploadRecordId={params.mediaId}
              viewHash={viewHash}
              mediaSource={media.mediaSource}
              audioSource={media.audioSource}
              posterThumbnailUrl={media.posterThumbnailUrl}
              videoWidth={layout.videoWidth}
              videoHeight={layout.videoHeight}
              peaksJsonUrl={media.peaksJsonUrl}
              lengthSeconds={media.lengthSeconds}
              videoClassName={layout.showSidebar ? null : 'sticky top-0'}
              initialTimestamp={initialTimestamp}
            />

            <MediaHeader
              title={media.title}
              channel={media.channel}
              ratingData={ratingData}
              onRate={handleRate}
              onFollowToggle={handleFollowToggle}
              isSaved={media.isSaved}
              onSaveToggle={handleSaveToggle}
              shareData={{
                title: media.title ?? 'Untitled',
                url: typeof window !== 'undefined' ? window.location.href : '',
              }}
              downloadData={{
                enabled: media.downloadsEnabled,
                urls: media.downloadUrls,
              }}
              mediaDimensions={
                media.width && media.height
                  ? { width: media.width, height: media.height }
                  : undefined
              }
              hasVideo={!!media.mediaSource}
              hasAudio={!!media.audioSource}
            />

            <MediaInfoTabs
              descriptionHtml={media.descriptionHtml}
              viewCount={media._count.uploadViews}
              publishedAt={media.publishedAt}
              createdAt={media.createdAt}
              showTranscriptTab={!layout.showSidebar}
              showCommentsTab={!layout.showSidebar}
              commentsEnabled={media.userCommentsEnabled}
              onTranscriptClick={() => setTranscriptDialogOpen(true)}
              onCommentsClick={() => setCommentsDialogOpen(true)}
            />

            {layout.showSidebar ? (
              <CommentsSection
                mediaId={params.mediaId}
                onLoginRequired={() => {
                  setLoginDialogAction('comment');
                  setLoginDialogOpen(true);
                }}
                commentsEnabled={media.userCommentsEnabled}
              />
            ) : null}

            {/* TODO */}
            {/* <div className="mt-10 pb-4"> */}
            {/*   <h2 className="mb-4 font-bold text-lg text-primary"> */}
            {/*     Related Content */}
            {/*   </h2> */}
            {/*   <MediaCarousel */}
            {/*     items={[1, 2, 3, 4, 5, 6].map((i) => ({ */}
            {/*       id: `${i}`, */}
            {/*       title: `Related Video ${i}`, */}
            {/*       thumbnailUrl: null, */}
            {/*       channelName: 'Channel Name', */}
            {/*       channelAvatarUrl: null, */}
            {/*       duration: '10:23', */}
            {/*       timestamp: '2 days ago', */}
            {/*       progress: i === 1 ? 45 : undefined, */}
            {/*     }))} */}
            {/*     fadeMargin="-mx-4 px-4" */}
            {/*     fadeSize={16} */}
            {/*     buttonPositioning="inside" */}
            {/*   /> */}
            {/* </div> */}
          </div>
        </div>

        {layout.showSidebar ? (
          <>
            <WindowSplitter
              initialWidth={transcriptWidth}
              minWidth={250}
              maxWidth={800}
              defaultWidth={DEFAULT_TRANSCRIPT_WIDTH}
              onWidthChange={handleTranscriptWidthChange}
            />
            <div style={{ width: `${transcriptWidth}px` }}>
              <TranscriptSidebar transcript={transcript} />
            </div>
          </>
        ) : null}
      </div>

      {/* Mobile Transcript Dialog */}
      <MobileDrawer.Root
        open={transcriptDialogOpen}
        onOpenChange={setTranscriptDialogOpen}
      >
        <MobileDrawer.Portal>
          <MobileDrawer.Content className="h-[85vh]">
            <MobileTranscriptDrawerContent transcript={transcript} />
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
            <div className="flex h-10 items-center justify-center gap-2 border-zinc-200 border-b border-solid px-5 dark:border-zinc-800">
              <div className="flex grow items-baseline gap-2 pb-0.5">
                <MobileDrawer.Title className="font-bold text-base text-primary">
                  Comments
                </MobileDrawer.Title>
              </div>
              <MobileDrawer.Close className="flex size-7 items-center justify-center rounded-lg hover:bg-white/10">
                <IconMessageCircle2 size={16} className="text-primary/80" />
              </MobileDrawer.Close>
            </div>

            <div className="fade-bottom flex-1 overflow-hidden">
              <div className="h-full overflow-y-auto">
                <CommentsSection
                  mediaId={params.mediaId}
                  onLoginRequired={() => {
                    setLoginDialogAction('comment');
                    setLoginDialogOpen(true);
                  }}
                  showContainer={false}
                  commentsEnabled={media.userCommentsEnabled}
                />
              </div>
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
            <AlertDialog.Title className="mb-2 font-bold text-lg text-primary">
              Login Required
            </AlertDialog.Title>
            <AlertDialog.Description className="mb-6 text-primary/70 text-sm">
              {loginDialogAction === 'rate'
                ? 'You need to be logged in to rate this content.'
                : loginDialogAction === 'save'
                  ? 'You need to be logged in to save this content to your library.'
                  : loginDialogAction === 'follow'
                    ? 'You need to be logged in to follow this channel.'
                    : 'You need to be logged in to comment on this content.'}{' '}
              Please sign in to continue.
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
                {media.channel.name}
              </span>
              ? You will no longer see their content in your feed.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setUnfollowConfirmOpen(false)}
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
    </MainLayout>
  );
}
