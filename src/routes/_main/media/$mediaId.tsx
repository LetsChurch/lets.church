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
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import Header from '@/components/header';
import LcButton from '@/components/lc-button';
import LcButtonGroup from '@/components/lc-button-group';
import { MediaCarousel } from '@/components/media-carousel';
import { MobileDrawer } from '@/components/mobile-drawer';
import { Transcript } from '@/components/transcript';
import { $headerBackgroundImage } from '@/stores/header';
import { useTRPC } from '@/trpc/react';

export const Route = createFileRoute('/_main/media/$mediaId')({
  component: RouteComponent,
  loader: async ({ context: { queryClient, trpc }, params }) => {
    await queryClient.ensureQueryData(
      trpc.media.getMediaById.queryOptions({
        mediaId: params.mediaId,
      }),
    );
  },
});

function RouteComponent() {
  const params = Route.useParams();
  const trpc = useTRPC();
  const [transcriptDialogOpen, setTranscriptDialogOpen] = useState(false);

  const { data: media } = useSuspenseQuery(
    trpc.media.getMediaById.queryOptions({
      mediaId: params.mediaId,
    }),
  );

  useEffect(() => {
    if (media.fullSizeThumbnailUrl) {
      $headerBackgroundImage.set(media.fullSizeThumbnailUrl);
    }
    return () => {
      $headerBackgroundImage.set(undefined);
    };
  }, [media.fullSizeThumbnailUrl]);

  return (
    <div className="flex h-full w-full flex-col">
      <Header />

      {/* Main Content Area */}
      <div className="lg:media-page-desktop z-5 gap-4 px-4">
        <div className="min-w-0">
          <div className="w-full">
            {/* Video Player */}
            <div className="relative w-full rounded-2xl bg-zinc-900">
              <div className="aspect-media w-full overflow-hidden rounded-2xl bg-black">
                <div className="flex h-full w-full items-center justify-center">
                  <p className="text-sm text-zinc-400">
                    Video Player Placeholder
                  </p>
                </div>
              </div>
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
                        children: (
                          <>
                            <IconThumbUp size={16} />
                            13
                          </>
                        ),
                      },
                      {
                        type: 'button',
                        children: (
                          <>
                            <IconThumbDown size={16} />
                          </>
                        ),
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
                <button
                  type="button"
                  onClick={() => setTranscriptDialogOpen(true)}
                  className="relative pt-1.5 pb-2 lg:hidden"
                >
                  <span className="font-medium text-sm text-white/70 hover:text-white">
                    Transcript
                  </span>
                </button>
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

            {/* Comments Section */}
            <div className="relative isolate mt-6 flex flex-col overflow-hidden rounded-2xl border-top-highlight bg-zinc-900">
              {/* Comments Header */}
              <div className="flex items-center gap-1 border-zinc-800 border-b px-5 pt-1.5 pb-2">
                <span className="font-medium text-sm text-white">Comments</span>
                <div className="flex h-[18px] items-center justify-center rounded-[9px] bg-white/10 px-1.5">
                  <span className="font-bold text-[10px] text-white/70 leading-none">
                    13
                  </span>
                </div>
              </div>

              {/* Comments Content */}
              <div className="p-5">
                <div className="text-sm text-white/70">Comments go here</div>
              </div>
            </div>

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
        <div className="hidden lg:block">
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
            <div className="relative flex-1 overflow-y-auto p-5">
              <Transcript />

              {/* Gradient fade at bottom */}
              <div className="pointer-events-none absolute right-0 bottom-0 left-0 h-8 bg-gradient-to-b from-zinc-900/0 via-80% via-zinc-900/90 to-zinc-900" />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Transcript Dialog */}
      <MobileDrawer.Root
        open={transcriptDialogOpen}
        onOpenChange={setTranscriptDialogOpen}
      >
        <MobileDrawer.Portal>
          <MobileDrawer.Backdrop />
          <MobileDrawer.Content>
            {/* Dialog Header */}
            <div className="flex h-10 items-center justify-center gap-2 border-zinc-800 border-b border-solid px-5">
              <div className="flex grow items-baseline gap-2 pb-0.5">
                <MobileDrawer.Title className="font-bold text-base text-white">
                  Transcript
                </MobileDrawer.Title>
              </div>
              <MobileDrawer.Close className="flex size-7 items-center justify-center rounded-lg backdrop-blur-sm hover:bg-white/10">
                <IconSearch size={16} className="text-white/80" />
              </MobileDrawer.Close>
            </div>

            {/* Transcript Content */}
            <div className="relative flex-1 overflow-y-auto">
              <div className="p-5">
                <Transcript />
              </div>

              {/* Gradient fade at bottom */}
              <div className="pointer-events-none fixed right-0 bottom-0 left-0 h-8 bg-gradient-to-b from-zinc-900/0 via-80% via-zinc-900/90 to-zinc-900" />
            </div>
          </MobileDrawer.Content>
        </MobileDrawer.Portal>
      </MobileDrawer.Root>
    </div>
  );
}
