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
  IconDownload,
  IconEdit,
  IconFlag,
  IconFlagFilled,
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
import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import LcButton from '@/components/lc-button';
import LcButtonGroup from '@/components/lc-button-group';
import { LcMenu, MenuItemButton, MenuItemLink } from '@/components/lc-menu';
import { LcModal, ModalHeader } from '@/components/lc-modal';
import { LcTooltip } from '@/components/lc-tooltip';
import { useAbortController } from '@/hooks/use-abort-controller';
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
  | 'TRANSCRIPT_TXT';

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
  channelLink?: ReactNode;
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
  channelLink,
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);

  // Per-video suggested questions for the Ask dropdown. Generated server-side
  // (gpt-5.4-nano) once and cached in Valkey, so this fires on mount —
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

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setShowLeftFade(scrollLeft > 0);
    setShowRightFade(scrollLeft < scrollWidth - clientWidth - 1);
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    handleScroll();

    // Use ResizeObserver to detect when the container size changes
    const resizeObserver = new ResizeObserver(handleScroll);
    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, [handleScroll]);

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

  return (
    <LcTooltip.Provider>
      <div className="-mx-4 flex min-w-0 items-center gap-2 sm:-mx-4">
        {/* Scrollable area with shadows */}
        <div className="relative isolate min-w-0">
          {/* Left fade shadow */}
          <div
            className={cn(
              'pointer-events-none absolute top-0 bottom-0 left-0 z-10 transition-opacity duration-200',
              'w-4 bg-linear-to-r from-page to-transparent',
              'sm:w-9 sm:from-40%',
              showLeftFade ? 'opacity-100' : 'opacity-0',
            )}
          />

          {/* Scrollable content */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex items-center gap-2.5 overflow-x-auto px-4 py-1"
          >
            {/* Channel Link */}
            {channelLink}

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

            {/* Share */}
            <LcTooltip
              content="Share"
              render={(props) => (
                <LcButton {...props} className="p-2" onClick={handleShare}>
                  <IconShare2 size={16} />
                </LcButton>
              )}
            />

            {/* Download */}
            {downloadData?.enabled && downloadData.urls.length > 0 ? (
              <LcMenu.Root>
                <LcMenu.Trigger
                  render={(props) => (
                    <LcButton {...props} className="p-2">
                      <IconDownload size={16} />
                    </LcButton>
                  )}
                />
                <LcMenu.Portal>
                  <LcMenu.Positioner sideOffset={8} align="start">
                    <LcMenu.Popup>
                      {downloadData.urls.map((download) => (
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
                      ))}
                    </LcMenu.Popup>
                  </LcMenu.Positioner>
                </LcMenu.Portal>
              </LcMenu.Root>
            ) : null}

            {/* Divider */}
            <div className="bg-vertical-divider h-7 w-px shrink-0" />

            {/* Save */}
            <LcButton
              className={cn(
                'flex items-center gap-0.5',
                isSaved && 'bg-gray-950/15 dark:bg-white/10',
              )}
              onClick={() => {
                posthog.capture(
                  isSaved ? 'media_unsaved' : 'media_saved',
                  baseEventProps(),
                );
                onSaveToggle();
              }}
            >
              {isSaved ? (
                <IconBookmarkFilled size={16} />
              ) : (
                <IconBookmark size={16} />
              )}
              {isSaved ? 'Saved' : 'Save'}
            </LcButton>

            {/* Follow */}
            <LcButton
              className={cn(
                'flex items-center gap-0.5',
                channelData.isFollowing && 'bg-gray-950/15 dark:bg-white/10',
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
              {channelData.isFollowing ? (
                <IconFlagFilled size={16} />
              ) : (
                <IconFlag size={16} />
              )}
              {channelData.isFollowing ? 'Following' : 'Follow'}
            </LcButton>

            {/* Ask — main segment focuses the transcript search; the caret opens
                AI-generated, video-specific suggested questions. */}
            <LcMenu.Root open={askMenuOpen} onOpenChange={setAskMenuOpen}>
              <div className="border-fancy-pants text-primary/80 isolate inline-flex shrink-0 overflow-clip rounded-full bg-gray-950/10 text-sm font-semibold dark:bg-white/15">
                <button
                  type="button"
                  onClick={openVideoAsk}
                  className="inline-flex items-center gap-1 px-3 py-1.5"
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
                      className="-ml-px inline-flex items-center border-l border-gray-950/5 px-1.5 py-1.5 dark:border-white/10"
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

          {/* Right fade shadow */}
          <div
            className={cn(
              '-right-px pointer-events-none absolute top-0 bottom-0 z-10 w-4 bg-linear-to-l from-page to-transparent transition-opacity duration-200 sm:w-9 sm:from-40% sm:from-page',
              showRightFade ? 'opacity-100' : 'opacity-0',
            )}
          />
        </div>

        {/* Edit Upload */}
        {canEditUpload && uploadId ? (
          <div className="shrink-0 pr-4">
            <Link
              to="/dashboard/channels/$channelId/uploads/$uploadId"
              params={{ channelId: channelData.id, uploadId }}
              className="border-fancy-pants text-primary/80 inline-flex items-center gap-0.5 rounded-full bg-gray-950/10 px-3 py-1.5 text-sm font-semibold active:scale-[0.97] dark:bg-white/15"
            >
              <IconEdit size={16} />
              Edit
            </Link>
          </div>
        ) : null}
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
