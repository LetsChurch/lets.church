import { useStore } from '@nanostores/react';
import {
  IconArticle,
  IconBadge4k,
  IconBadgeCc,
  IconBadgeHd,
  IconBookmark,
  IconBookmarkFilled,
  IconBrandFacebook,
  IconBrandX,
  IconCheck,
  IconChevronDown,
  IconCode,
  IconDeviceTvOld,
  IconJson,
  IconDotsVertical,
  IconDownload,
  IconEdit,
  IconShare2,
  IconSparkles,
  IconThumbDown,
  IconThumbDownFilled,
  IconThumbUp,
  IconThumbUpFilled,
  IconVolume,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import posthog from 'posthog-js';
import { useCallback, useState } from 'react';

import { Avatar } from '@/components/avatar';
import LcButton from '@/components/lc-button';
import LcButtonGroup from '@/components/lc-button-group';
import {
  LcMenu,
  MenuItemButton,
  MenuItemLink,
  MenuItemRouterLink,
} from '@/components/lc-menu';
import { LcModal, ModalHeader } from '@/components/lc-modal';
import { LcTooltip } from '@/components/lc-tooltip';
import { useAbortController } from '@/hooks/use-abort-controller';
import { useOverflowItems } from '@/hooks/use-overflow-items';
import { IncomingIdSchema } from '@/schemas/common';
import { $currentTime } from '@/stores/player';
import { askVideoQuestion, openVideoAsk } from '@/stores/video-ask';
import { useTRPC } from '@/trpc/react';
import { abortableSetTimeout } from '@/util/abortable-timeout';
import { cn } from '@/util/cn';

type MediaDownloadKind =
  | 'VIDEO_4K'
  | 'VIDEO_1080P'
  | 'VIDEO_720P'
  | 'VIDEO_480P'
  | 'AUDIO'
  | 'TRANSCRIPT_VTT'
  | 'TRANSCRIPT_TXT'
  | 'TRANSCRIPT_JSON';

type OverflowKey = 'rate' | 'share' | 'save' | 'ask' | 'download' | 'edit';

type MediaActionsProps = {
  ratingData: {
    likes: number;
    dislikes: number;
    userRating: 'LIKE' | 'DISLIKE' | null;
  };
  onRate: (rating: 'LIKE' | 'DISLIKE') => void;
  shareData: {
    title: string;
    url: string;
  };
  downloadData?: {
    enabled: boolean;
    urls: Array<{ kind: MediaDownloadKind; label: string; url: string }>;
  };
  channelData: {
    id: string;
    name: string;
    slug: string;
    avatarUrl: string | null;
    subscriberCount: number;
    isFollowing: boolean;
  };
  onFollowToggle: () => void;
  isSaved: boolean;
  onSaveToggle: () => void;
  mediaDimensions?: {
    width: number;
    height: number;
  };
  hasVideo?: boolean;
  hasAudio?: boolean;
  uploadId?: string;
  canEditUpload?: boolean;
  mediaTitle?: string | null;
  publishedAt?: Date | string | null;
  lengthSeconds?: number | null;
};

const windowConfig = Object.entries({
  width: 550,
  height: 400,
  location: 'no',
  toolbar: 'no',
  status: 'no',
  directories: 'no',
  menubar: 'no',
  scrollbars: 'yes',
  resizable: 'no',
  centerscreen: 'yes',
  chrome: 'yes',
})
  .map(([k, v]) => `${k}=${v}`)
  .join(',');

function getDownloadIcon(kind: MediaDownloadKind) {
  switch (kind) {
    case 'VIDEO_4K':
      return <IconBadge4k size={16} />;
    case 'VIDEO_1080P':
    case 'VIDEO_720P':
      return <IconBadgeHd size={16} />;
    case 'VIDEO_480P':
      return <IconDeviceTvOld size={16} />;
    case 'AUDIO':
      return <IconVolume size={16} />;
    case 'TRANSCRIPT_VTT':
      return <IconBadgeCc size={16} />;
    case 'TRANSCRIPT_TXT':
      return <IconArticle size={16} />;
    case 'TRANSCRIPT_JSON':
      return <IconJson size={16} />;
    default:
      return <IconDeviceTvOld size={16} />;
  }
}

export function MediaActions({
  ratingData,
  onRate,
  shareData,
  downloadData,
  channelData,
  onFollowToggle,
  isSaved,
  onSaveToggle,
  mediaDimensions,
  hasVideo = true,
  hasAudio = false,
  uploadId,
  canEditUpload = false,
  mediaTitle,
  publishedAt,
  lengthSeconds,
}: MediaActionsProps) {
  const abortController = useAbortController();
  const currentTime = useStore($currentTime);
  const [shareModalOpen, setShareModalOpen] = useState(false);

  const baseEventProps = useCallback(
    () => ({
      upload_id: uploadId,
      media_title: mediaTitle ?? null,
      channel_id: channelData.id,
      channel_name: channelData.name,
      published_at:
        publishedAt instanceof Date
          ? publishedAt.toISOString()
          : (publishedAt ?? null),
      length_seconds: lengthSeconds ?? null,
      playback_position_seconds: Math.floor(currentTime),
    }),
    [
      uploadId,
      mediaTitle,
      channelData.id,
      channelData.name,
      publishedAt,
      lengthSeconds,
      currentTime,
    ],
  );
  const [frozenTime, setFrozenTime] = useState<number>(0);
  const [includeTimestamp, setIncludeTimestamp] = useState(true);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  // Per-video suggested questions for the Ask dropdown. Generated server-side
  // (gpt-6-luna) once and cached in Valkey, so this fires on mount —
  // pre-generating as the page loads — and the menu has them ready with no delay.
  const trpc = useTRPC();
  const { data: suggestedQuestions = [], isLoading: isLoadingQuestions } =
    useQuery({
      ...trpc.media.getSuggestedQuestions.queryOptions({
        mediaId: uploadId ?? '',
      }),
      enabled: Boolean(uploadId),
      staleTime: Number.POSITIVE_INFINITY,
    });
  // Controlled so picking a question can close the menu (our custom MenuItemButton
  // onClick overrides Base UI's default close-on-select).
  const [askMenuOpen, setAskMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  // Format time as MM:SS or H:MM:SS
  const formatTime = useCallback((seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Helper function to add timestamp to URL (uses frozen time from when modal opened)
  const getUrlWithTimestamp = useCallback(
    (url: string) => {
      if (!frozenTime || frozenTime < 1) {
        return url;
      }

      // Parse the URL to handle existing hash
      const urlObj = new URL(url);
      // Round to nearest second
      const timestamp = Math.floor(frozenTime);
      // Set the hash with timestamp
      urlObj.hash = `t=${timestamp}`;

      return urlObj.toString();
    },
    [frozenTime],
  );

  // Get the share URL based on checkbox state
  const getShareUrl = useCallback(
    (url: string) => {
      return includeTimestamp ? getUrlWithTimestamp(url) : url;
    },
    [includeTimestamp, getUrlWithTimestamp],
  );

  const handleShare = async () => {
    // Freeze the current time when modal opens
    setFrozenTime(currentTime);
    // Reset copy success state
    setCopySuccess(null);
    // Always show modal
    setShareModalOpen(true);
  };

  const handleNativeShare = async () => {
    const shareUrl = getShareUrl(shareData.url);
    const shareDataToShare = {
      ...shareData,
      url: shareUrl,
    };

    try {
      await navigator.share(shareDataToShare);
      posthog.capture('media_shared', {
        ...baseEventProps(),
        platform: 'native',
        share_url: shareUrl,
        includes_timestamp: includeTimestamp,
        timestamp_seconds: includeTimestamp ? Math.floor(frozenTime) : null,
      });
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        // User cancelled, keep modal open
        return;
      }

      console.error('Error sharing:', error);
    }
  };

  const openShareWindow = (url: string, platform: string) => {
    // Keep modal open after opening share window
    window.open(url, '', windowConfig);
    posthog.capture('media_shared', {
      ...baseEventProps(),
      platform,
      share_url: getShareUrl(shareData.url),
      includes_timestamp: includeTimestamp,
      timestamp_seconds: includeTimestamp ? Math.floor(frozenTime) : null,
    });
  };

  const handleCopy = async () => {
    try {
      const shareUrl = getShareUrl(shareData.url);
      await navigator.clipboard.writeText(shareUrl);
      setCopySuccess('link');
      posthog.capture('media_shared', {
        ...baseEventProps(),
        platform: 'copy_link',
        share_url: shareUrl,
        includes_timestamp: includeTimestamp,
        timestamp_seconds: includeTimestamp ? Math.floor(frozenTime) : null,
      });
      abortableSetTimeout(
        () => {
          setCopySuccess(null);
        },
        1500,
        abortController.signal,
      );
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  const handleCopyEmbed = async (type: 'video' | 'audio') => {
    try {
      // Get URL based on checkbox state
      const shareUrl = getShareUrl(shareData.url);

      // Extract the mediaId from the URL
      const mediaId = shareUrl
        .split('/media/')[1]
        ?.split('?')[0]
        ?.split('#')[0];
      const baseEmbedUrl = shareUrl.replace(
        `/media/${mediaId}`,
        `/embed/media/${mediaId}`,
      );

      // Parse URL to handle query params and hash properly
      const embedUrlObj = new URL(baseEmbedUrl);
      embedUrlObj.searchParams.set('type', type);
      const embedUrl = embedUrlObj.toString();

      let embedCode: string;

      if (type === 'audio') {
        // Audio embed: fixed height, 100% width
        embedCode = `<iframe src="${embedUrl}" style="width: 100%; height: 150px;" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture"></iframe>`;
      } else {
        // Video embed: aspect ratio based on media dimensions
        const width = mediaDimensions?.width ?? 1920;
        const height = mediaDimensions?.height ?? 1080;
        const aspectRatio = `${width} / ${height}`;
        embedCode = `<iframe src="${embedUrl}" style="width: 100%; aspect-ratio: ${aspectRatio};" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture"></iframe>`;
      }
      await navigator.clipboard.writeText(embedCode);
      setCopySuccess(`embed-${type}`);
      posthog.capture('media_shared', {
        ...baseEventProps(),
        platform: `embed_${type}`,
        share_url: embedUrl,
        includes_timestamp: includeTimestamp,
        timestamp_seconds: includeTimestamp ? Math.floor(frozenTime) : null,
      });
      abortableSetTimeout(
        () => {
          setCopySuccess(null);
        },
        1500,
        abortController.signal,
      );
    } catch (error) {
      console.error('Failed to copy embed code to clipboard:', error);
    }
  };

  const downloads = downloadData?.enabled ? downloadData.urls : [];
  // Dashboard routes are keyed by UUID; these ids may be short public ids
  // (and uploadId may be either form, from the URL).
  const editParams =
    canEditUpload && uploadId
      ? {
          channelId: IncomingIdSchema.parse(channelData.id),
          uploadId: IncomingIdSchema.parse(uploadId),
        }
      : null;

  const { containerRef, triggerRef, itemRef, hidden, idealWidth } =
    useOverflowItems(
      [
        'rate',
        'share',
        'save',
        'ask',
        ...(downloads.length > 0 ? (['download'] as const) : []),
        ...(editParams ? (['edit'] as const) : []),
      ],
      ['edit', 'download', 'save', 'share'],
    );
  // Once everything fits again the More trigger hides, so close its menu (and
  // keep it closed, rather than reopening the next time something overflows).
  if (moreMenuOpen && hidden.size === 0) setMoreMenuOpen(false);

  // Hidden items stay mounted (out of the flow, invisible and inert) so the
  // hook can still measure them; `null` is the More trigger, shown only when
  // something has overflowed.
  const slotProps = (key: OverflowKey | null) => {
    const isHidden = key ? hidden.has(key) : hidden.size === 0;
    return {
      inert: isHidden,
      className: cn(
        'shrink-0 whitespace-nowrap',
        isHidden && 'invisible absolute',
      ),
    };
  };

  const toggleSave = () => {
    posthog.capture(
      isSaved ? 'media_unsaved' : 'media_saved',
      baseEventProps(),
    );
    onSaveToggle();
  };

  const downloadItems = downloads.map((download) => (
    <MenuItemLink
      key={download.url}
      href={download.url}
      download
      icon={getDownloadIcon(download.kind)}
      onClick={() => {
        posthog.capture('media_downloaded', {
          ...baseEventProps(),
          download_kind: download.kind,
          download_label: download.label,
        });
      }}
    >
      Download {download.label}
    </MenuItemLink>
  ));

  return (
    <LcTooltip.Provider>
      {/* Wraps onto a second row on narrow screens instead of scrolling
          sideways: a horizontal scroller hid actions people didn't know were
          there. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {/* Channel + Follow */}
        <div className="flex min-w-0 items-center gap-1.5">
          <Link
            to="/channel/$slug"
            params={{ slug: channelData.slug }}
            className="shrink-0 transition-opacity hover:opacity-80"
            // The name beside it is the keyboard stop for the same link.
            tabIndex={-1}
          >
            <Avatar
              src={channelData.avatarUrl}
              alt={channelData.name}
              className="border-fancy-pants size-7"
              fallbackClassName="bg-brand font-bold text-xs"
            />
          </Link>
          <div className="flex min-w-0 flex-col gap-0.5">
            <Link
              to="/channel/$slug"
              params={{ slug: channelData.slug }}
              title={channelData.name}
              className="text-primary block max-w-[24ch] truncate text-xs font-semibold transition-opacity hover:opacity-80"
            >
              {channelData.name}
            </Link>
            <div className="flex items-center gap-1 text-[10px] text-zinc-400">
              <span>
                {channelData.subscriberCount.toLocaleString()}{' '}
                {channelData.subscriberCount === 1 ? 'follower' : 'followers'}
              </span>
              <span aria-hidden>·</span>
              <button
                type="button"
                className={cn(
                  // after: pads the hit area out to a usable tap target
                  // without changing the compact text-link look. It grows
                  // sideways and down only, so it never covers the channel
                  // name link directly above.
                  'focus-visible:ring-brand relative rounded-sm font-semibold transition-colors outline-none after:absolute after:-inset-x-2 after:top-0 after:-bottom-2 focus-visible:ring-2',
                  channelData.isFollowing
                    ? 'hover:text-primary text-zinc-400'
                    : 'text-brand hover:text-primary',
                )}
                onClick={() => {
                  posthog.capture(
                    channelData.isFollowing
                      ? 'channel_unfollowed'
                      : 'channel_followed',
                    baseEventProps(),
                  );
                  onFollowToggle();
                }}
              >
                {channelData.isFollowing ? 'Following' : 'Follow'}
              </button>
            </div>
          </div>
        </div>

        {/* Items that don't fit move into the More menu (Edit first, then
            Download, Save and Share). The ideal-width basis (content width
            until measured) lets the row drop below the channel before
            anything is hidden; flex-wrap is the last resort if even the
            always-shown items don't fit. */}
        <div
          ref={containerRef}
          style={{ flexBasis: idealWidth }}
          className="relative flex min-w-0 flex-auto flex-wrap items-center gap-2.5 py-1"
        >
          <div ref={itemRef('rate')} {...slotProps('rate')}>
            {/* Ratings */}
            <LcButtonGroup
              buttons={[
                {
                  type: 'button',
                  onClick: () => {
                    const isRemoving = ratingData.userRating === 'LIKE';
                    posthog.capture(
                      isRemoving ? 'media_like_removed' : 'media_liked',
                      baseEventProps(),
                    );
                    onRate('LIKE');
                  },
                  className: cn(
                    ratingData.userRating === 'LIKE' &&
                      'bg-gray-950/15 dark:bg-white/10',
                  ),
                  tooltip: 'Like',
                  children: (
                    <>
                      {ratingData.userRating === 'LIKE' ? (
                        <IconThumbUpFilled size={16} />
                      ) : (
                        <IconThumbUp size={16} />
                      )}
                      {ratingData.likes}
                    </>
                  ),
                },
                {
                  type: 'button',
                  onClick: () => {
                    const isRemoving = ratingData.userRating === 'DISLIKE';
                    posthog.capture(
                      isRemoving ? 'media_dislike_removed' : 'media_disliked',
                      baseEventProps(),
                    );
                    onRate('DISLIKE');
                  },
                  className: cn(
                    ratingData.userRating === 'DISLIKE' &&
                      'bg-gray-950/15 dark:bg-white/10',
                  ),
                  tooltip: 'Dislike',
                  children:
                    ratingData.userRating === 'DISLIKE' ? (
                      <IconThumbDownFilled
                        size={16}
                        className="relative -top-px"
                      />
                    ) : (
                      <IconThumbDown size={16} />
                    ),
                },
              ]}
            />
          </div>

          <div ref={itemRef('share')} {...slotProps('share')}>
            {/* Share */}
            <LcTooltip
              content="Share"
              render={(props) => (
                <LcButton {...props} className="p-2" onClick={handleShare}>
                  <IconShare2 size={16} />
                </LcButton>
              )}
            />
          </div>

          <div ref={itemRef('save')} {...slotProps('save')}>
            {/* Save */}
            <LcTooltip
              content={isSaved ? 'Saved' : 'Save'}
              render={(props) => (
                <LcButton
                  {...props}
                  aria-label="Save"
                  aria-pressed={isSaved}
                  className={cn(
                    'p-2',
                    isSaved && 'bg-gray-950/15 dark:bg-white/10',
                  )}
                  onClick={toggleSave}
                >
                  {isSaved ? (
                    <IconBookmarkFilled size={16} />
                  ) : (
                    <IconBookmark size={16} />
                  )}
                </LcButton>
              )}
            />
          </div>

          <div ref={itemRef('ask')} {...slotProps('ask')}>
            {/* Ask — main segment focuses the transcript search; the caret opens
                AI-generated, video-specific suggested questions. */}
            <LcMenu.Root open={askMenuOpen} onOpenChange={setAskMenuOpen}>
              <div className="border-fancy-pants text-primary/80 isolate inline-flex shrink-0 overflow-clip rounded-full bg-gray-950/10 text-sm font-semibold dark:bg-white/15">
                <button
                  type="button"
                  onClick={openVideoAsk}
                  className="hover:text-primary inline-flex items-center gap-1 px-3 py-1.5 transition-colors hover:bg-gray-950/5 dark:hover:bg-white/10"
                >
                  <IconSparkles size={16} />
                  Ask
                </button>
                <LcMenu.Trigger
                  render={(props) => (
                    <button
                      {...props}
                      type="button"
                      aria-label="Suggested questions"
                      className="hover:text-primary data-[popup-open]:text-primary -ml-px inline-flex items-center border-l border-gray-950/5 px-1.5 py-1.5 transition-colors hover:bg-gray-950/5 data-[popup-open]:bg-gray-950/5 dark:border-white/10 dark:hover:bg-white/10 dark:data-[popup-open]:bg-white/10"
                    >
                      <IconChevronDown size={16} />
                    </button>
                  )}
                />
              </div>
              <LcMenu.Portal>
                <LcMenu.Positioner sideOffset={8} align="end">
                  <LcMenu.Popup className="max-w-[20rem]">
                    <div className="text-secondary px-3 pt-1.5 pb-1 text-xs font-medium">
                      Ask about this video
                    </div>
                    {suggestedQuestions.length > 0 ? (
                      suggestedQuestions.map((q) => (
                        <MenuItemButton
                          key={q}
                          onClick={() => {
                            askVideoQuestion(q);
                            setAskMenuOpen(false);
                          }}
                        >
                          {/* Own layout (not the icon prop) so multi-line
                              questions stay left-aligned with the icon at the
                              first line, without fighting the menu item's
                              default items-center. */}
                          <span className="flex w-full items-start gap-2 text-left">
                            <IconSparkles
                              size={14}
                              className="text-brand mt-0.5 shrink-0"
                            />
                            {q}
                          </span>
                        </MenuItemButton>
                      ))
                    ) : (
                      <div className="text-secondary px-3 py-2 text-sm">
                        {isLoadingQuestions
                          ? 'Thinking of questions…'
                          : 'No suggestions for this video.'}
                      </div>
                    )}
                  </LcMenu.Popup>
                </LcMenu.Positioner>
              </LcMenu.Portal>
            </LcMenu.Root>
          </div>

          {downloads.length > 0 ? (
            <div ref={itemRef('download')} {...slotProps('download')}>
              {/* Download */}
              <LcMenu.Root>
                <LcMenu.Trigger
                  render={(props) => (
                    <LcButton {...props} className="p-2" aria-label="Download">
                      <IconDownload size={16} />
                    </LcButton>
                  )}
                />
                <LcMenu.Portal>
                  <LcMenu.Positioner sideOffset={8} align="start">
                    <LcMenu.Popup>{downloadItems}</LcMenu.Popup>
                  </LcMenu.Positioner>
                </LcMenu.Portal>
              </LcMenu.Root>
            </div>
          ) : null}

          {editParams ? (
            <div ref={itemRef('edit')} {...slotProps('edit')}>
              <Link
                to="/dashboard/channels/$channelId/uploads/$uploadId"
                params={editParams}
                className="border-fancy-pants text-primary/80 hover:text-primary inline-flex items-center gap-0.5 rounded-full bg-gray-950/10 px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-gray-950/15 active:scale-[0.97] dark:bg-white/15 dark:hover:bg-white/20"
              >
                <IconEdit size={16} />
                Edit
              </Link>
            </div>
          ) : null}

          {/* More: whatever no longer fits on the row */}
          <div ref={triggerRef} {...slotProps(null)}>
            <LcMenu.Root open={moreMenuOpen} onOpenChange={setMoreMenuOpen}>
              <LcMenu.Trigger
                render={(props) => (
                  <LcButton
                    {...props}
                    className="p-2"
                    aria-label="More actions"
                  >
                    <IconDotsVertical size={16} />
                  </LcButton>
                )}
              />
              <LcMenu.Portal>
                <LcMenu.Positioner sideOffset={8} align="end">
                  <LcMenu.Popup>
                    {hidden.has('share') ? (
                      <MenuItemButton
                        icon={<IconShare2 size={16} />}
                        onClick={() => {
                          setMoreMenuOpen(false);
                          handleShare();
                        }}
                      >
                        Share
                      </MenuItemButton>
                    ) : null}
                    {hidden.has('save') ? (
                      <MenuItemButton
                        icon={
                          isSaved ? (
                            <IconBookmarkFilled size={16} />
                          ) : (
                            <IconBookmark size={16} />
                          )
                        }
                        onClick={() => {
                          setMoreMenuOpen(false);
                          toggleSave();
                        }}
                      >
                        {isSaved ? 'Remove from saved' : 'Save'}
                      </MenuItemButton>
                    ) : null}
                    {hidden.has('download') ? downloadItems : null}
                    {hidden.has('edit') && editParams ? (
                      <>
                        {hidden.size > 1 ? <LcMenu.Separator /> : null}
                        <MenuItemRouterLink
                          to="/dashboard/channels/$channelId/uploads/$uploadId"
                          params={editParams}
                          icon={<IconEdit size={16} />}
                        >
                          Edit
                        </MenuItemRouterLink>
                      </>
                    ) : null}
                  </LcMenu.Popup>
                </LcMenu.Positioner>
              </LcMenu.Portal>
            </LcMenu.Root>
          </div>
        </div>
      </div>

      {/* Share Modal */}
      <LcModal.Root open={shareModalOpen} onOpenChange={setShareModalOpen}>
        <LcModal.Portal>
          <LcModal.Backdrop />
          <LcModal.Popup>
            <ModalHeader title="Share" />

            <div className="flex flex-col gap-4 p-6">
              {/* Social Share Buttons */}
              <div className="flex items-center justify-center gap-6">
                {/* Native Share - only show if available */}
                {typeof navigator !== 'undefined' &&
                navigator.canShare?.(shareData) ? (
                  <button
                    type="button"
                    onClick={handleNativeShare}
                    className="flex flex-col items-center gap-2 transition-opacity hover:opacity-70"
                  >
                    <div className="flex size-12 items-center justify-center rounded-full bg-linear-to-br from-purple-600 to-blue-600">
                      <IconShare2 size={24} className="text-primary" />
                    </div>
                    <span className="text-primary text-xs">Share</span>
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() => {
                    const shareUrl = getShareUrl(shareData.url);
                    openShareWindow(
                      `https://www.facebook.com/sharer/sharer.php?${new URLSearchParams(
                        {
                          u: shareUrl,
                          quote: shareData.title,
                        },
                      )}`,
                      'facebook',
                    );
                  }}
                  className="flex flex-col items-center gap-2 transition-opacity hover:opacity-70"
                >
                  <div className="flex size-12 items-center justify-center rounded-full bg-blue-600">
                    <IconBrandFacebook size={24} className="text-primary" />
                  </div>
                  <span className="text-primary text-xs">Facebook</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const shareUrl = getShareUrl(shareData.url);
                    openShareWindow(
                      `https://twitter.com/share?${new URLSearchParams({
                        url: shareUrl,
                        text: shareData.title,
                      })}`,
                      'x',
                    );
                  }}
                  className="flex flex-col items-center gap-2 transition-opacity hover:opacity-70"
                >
                  <div className="flex size-12 items-center justify-center rounded-full bg-black">
                    <IconBrandX size={24} className="text-primary" />
                  </div>
                  <span className="text-primary text-xs">X</span>
                </button>
              </div>

              {/* Embed Options */}
              {(hasVideo || hasAudio) && (
                <div className="flex items-center justify-center gap-6">
                  {hasVideo ? (
                    <button
                      type="button"
                      onClick={() => handleCopyEmbed('video')}
                      className="flex flex-col items-center gap-2 transition-opacity hover:opacity-70"
                    >
                      <div className="relative">
                        <div
                          className={cn(
                            'flex size-12 items-center justify-center rounded-full transition-colors',
                            copySuccess === 'embed-video'
                              ? 'bg-green-600'
                              : 'bg-gradient-to-br from-orange-500 to-pink-600',
                          )}
                        >
                          <IconCode size={24} className="text-primary" />
                        </div>
                        {copySuccess === 'embed-video' ? (
                          <div className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-green-600 ring-2 ring-white dark:ring-zinc-900">
                            <IconCheck size={14} className="text-white" />
                          </div>
                        ) : null}
                      </div>
                      <span className="text-primary relative text-xs">
                        <span
                          className={cn(
                            'transition-opacity',
                            copySuccess === 'embed-video'
                              ? 'opacity-0'
                              : 'opacity-100',
                          )}
                        >
                          Video Embed
                        </span>
                        {copySuccess === 'embed-video' ? (
                          <span className="absolute inset-0 flex items-center justify-center">
                            Copied!
                          </span>
                        ) : null}
                      </span>
                    </button>
                  ) : null}

                  {hasAudio ? (
                    <button
                      type="button"
                      onClick={() => handleCopyEmbed('audio')}
                      className="flex flex-col items-center gap-2 transition-opacity hover:opacity-70"
                    >
                      <div className="relative">
                        <div
                          className={cn(
                            'flex size-12 items-center justify-center rounded-full transition-colors',
                            copySuccess === 'embed-audio'
                              ? 'bg-green-600'
                              : 'bg-gradient-to-br from-green-500 to-teal-600',
                          )}
                        >
                          <IconCode size={24} className="text-primary" />
                        </div>
                        {copySuccess === 'embed-audio' ? (
                          <div className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-green-600 ring-2 ring-white dark:ring-zinc-900">
                            <IconCheck size={14} className="text-white" />
                          </div>
                        ) : null}
                      </div>
                      <span className="text-primary relative text-xs">
                        <span
                          className={cn(
                            'transition-opacity',
                            copySuccess === 'embed-audio'
                              ? 'opacity-0'
                              : 'opacity-100',
                          )}
                        >
                          Audio Embed
                        </span>
                        {copySuccess === 'embed-audio' ? (
                          <span className="absolute inset-0 flex items-center justify-center">
                            Copied!
                          </span>
                        ) : null}
                      </span>
                    </button>
                  ) : null}
                </div>
              )}

              {/* URL Display and Copy */}
              <div className="flex items-center gap-2 rounded-lg border border-zinc-300 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800">
                <input
                  type="text"
                  readOnly
                  value={getShareUrl(shareData.url)}
                  className="text-primary min-w-0 flex-1 truncate bg-transparent font-mono text-sm outline-none"
                />
                <div className="relative">
                  <button
                    type="button"
                    onClick={handleCopy}
                    className={cn(
                      'relative shrink-0 rounded-md px-4 py-2 font-medium text-sm transition-colors',
                      copySuccess === 'link'
                        ? 'bg-green-600 text-white'
                        : 'bg-blue-600 text-white hover:bg-blue-700',
                    )}
                  >
                    <span
                      className={cn(
                        'transition-opacity',
                        copySuccess === 'link' ? 'opacity-0' : 'opacity-100',
                      )}
                    >
                      Copy
                    </span>
                    {copySuccess === 'link' ? (
                      <span className="absolute inset-0 flex items-center justify-center">
                        Copied!
                      </span>
                    ) : null}
                  </button>
                  {copySuccess === 'link' ? (
                    <div className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-green-600 ring-2 ring-white dark:ring-zinc-900">
                      <IconCheck size={14} className="text-white" />
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Timestamp Checkbox */}
              {frozenTime >= 1 ? (
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={includeTimestamp}
                    onChange={(e) => setIncludeTimestamp(e.target.checked)}
                    className="size-4 cursor-pointer accent-blue-600"
                  />
                  <span className="text-primary text-sm">
                    Start at {formatTime(frozenTime)}
                  </span>
                </label>
              ) : null}
            </div>
          </LcModal.Popup>
        </LcModal.Portal>
      </LcModal.Root>
    </LcTooltip.Provider>
  );
}
