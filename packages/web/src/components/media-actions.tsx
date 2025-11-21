import {
  IconArticle,
  IconBadge4k,
  IconBadgeCc,
  IconBadgeHd,
  IconBookmark,
  IconBrandFacebook,
  IconBrandX,
  IconCode,
  IconCopy,
  IconDeviceTvOld,
  IconDots,
  IconFlag,
  IconShare2,
  IconThumbDown,
  IconThumbUp,
  IconVolume,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import LcButton from '@/components/lc-button';
import LcButtonGroup from '@/components/lc-button-group';
import { LcMenu, MenuItemButton, MenuItemLink } from '@/components/lc-menu';
import { LcModal, ModalHeader } from '@/components/lc-modal';
import { useAbortController } from '@/hooks/use-abort-controller';
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
}: MediaActionsProps) {
  const abortController = useAbortController();
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setShowLeftFade(scrollLeft > 0);
    setShowRightFade(scrollLeft < scrollWidth - clientWidth - 1);
  }, []);

  useEffect(() => {
    handleScroll();
    window.addEventListener('resize', handleScroll);
    return () => window.removeEventListener('resize', handleScroll);
  }, [handleScroll]);

  const handleShare = async () => {
    // Check if native share is available
    if (navigator.canShare?.(shareData)) {
      try {
        await navigator.share(shareData);
        return;
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          // User cancelled
          return;
        }

        console.error('Error sharing:', error);
      }
    }

    // Fallback to modal
    setShareModalOpen(true);
  };

  const openShareWindow = (url: string) => {
    setShareModalOpen(false);
    window.open(url, '', windowConfig);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(
        `${shareData.title} ${shareData.url}`,
      );
      setCopySuccess('link');
      abortableSetTimeout(
        () => {
          setCopySuccess(null);
          setShareModalOpen(false);
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
      // Extract the mediaId from the URL
      const mediaId = shareData.url.split('/media/')[1]?.split('?')[0];
      const baseEmbedUrl = shareData.url.replace(
        `/media/${mediaId}`,
        `/embed/media/${mediaId}`,
      );

      // Add type query parameter
      const embedUrl = `${baseEmbedUrl}?type=${type}`;

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
    <>
      <div className="-mx-4 sm:-mx-4 flex min-w-0 items-center gap-2">
        {/* Scrollable area with shadows */}
        <div className="relative min-w-0">
          {/* Left fade shadow */}
          <div
            className={cn(
              'pointer-events-none absolute top-0 bottom-0 left-0 z-10 transition-opacity duration-200',
              'w-4 bg-gradient-to-r from-page to-transparent',
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
                  onClick: () => onRate('LIKE'),
                  className: cn(
                    ratingData.userRating === 'LIKE' &&
                      'bg-gray-950/15 dark:bg-white/10',
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
                  onClick: () => onRate('DISLIKE'),
                  className: cn(
                    ratingData.userRating === 'DISLIKE' &&
                      'bg-gray-950/15 dark:bg-white/10',
                  ),
                  children: <IconThumbDown size={16} />,
                },
              ]}
            />

            {/* Share */}
            <LcButton className="p-2" onClick={handleShare}>
              <IconShare2 size={16} />
            </LcButton>

            {/* Divider */}
            <div className="h-7 w-px shrink-0 bg-vertical-divider" />

            {/* Save */}
            <LcButton
              className={cn(
                'flex items-center gap-0.5',
                isSaved && 'bg-gray-950/15 dark:bg-white/10',
              )}
              onClick={onSaveToggle}
            >
              <IconBookmark size={16} />
              {isSaved ? 'Saved' : 'Save'}
            </LcButton>

            {/* Follow */}
            <LcButton
              className={cn(
                'flex items-center gap-0.5',
                channelData.isFollowing && 'bg-gray-950/15 dark:bg-white/10',
              )}
              onClick={onFollowToggle}
            >
              <IconFlag size={16} />
              {channelData.isFollowing ? 'Following' : 'Follow'}
            </LcButton>
          </div>

          {/* Right fade shadow */}
          <div
            className={cn(
              '-right-px pointer-events-none absolute top-0 bottom-0 z-10 w-4 bg-gradient-to-l from-page to-transparent transition-opacity duration-200 sm:w-9 sm:from-40% sm:from-page',
              showRightFade ? 'opacity-100' : 'opacity-0',
            )}
          />
        </div>

        {/* More (Embed, Download) - always visible */}
        <div className="shrink-0 pr-4">
          <LcMenu.Root>
            <LcMenu.Trigger
              render={(props) => (
                <LcButton {...props} className="p-2">
                  <IconDots size={16} />
                </LcButton>
              )}
            />
            <LcMenu.Portal>
              <LcMenu.Positioner sideOffset={8}>
                <LcMenu.Popup>
                  {/* Embed */}
                  {hasVideo ? (
                    <MenuItemButton
                      onClick={() => handleCopyEmbed('video')}
                      icon={<IconCode size={16} />}
                    >
                      {copySuccess === 'embed-video'
                        ? 'Copied!'
                        : 'Copy Video Embed'}
                    </MenuItemButton>
                  ) : null}
                  {hasAudio ? (
                    <MenuItemButton
                      onClick={() => handleCopyEmbed('audio')}
                      icon={<IconCode size={16} />}
                    >
                      {copySuccess === 'embed-audio'
                        ? 'Copied!'
                        : 'Copy Audio Embed'}
                    </MenuItemButton>
                  ) : null}

                  {/* Download */}
                  {downloadData?.enabled && downloadData.urls.length > 0
                    ? downloadData.urls.map((download) => (
                        <MenuItemLink
                          key={download.url}
                          href={download.url}
                          download
                          icon={getDownloadIcon(download.kind)}
                        >
                          {download.label}
                        </MenuItemLink>
                      ))
                    : null}
                </LcMenu.Popup>
              </LcMenu.Positioner>
            </LcMenu.Portal>
          </LcMenu.Root>
        </div>
      </div>

      {/* Share Modal */}
      <LcModal.Root open={shareModalOpen} onOpenChange={setShareModalOpen}>
        <LcModal.Portal>
          <LcModal.Backdrop />
          <LcModal.Popup>
            <ModalHeader title="Share" />

            <div className="flex items-center justify-center gap-6 py-6">
              <button
                type="button"
                onClick={() =>
                  openShareWindow(
                    `https://www.facebook.com/sharer/sharer.php?${new URLSearchParams(
                      {
                        u: shareData.url,
                        quote: shareData.title,
                      },
                    )}`,
                  )
                }
                className="flex flex-col items-center gap-2 transition-opacity hover:opacity-70"
              >
                <div className="flex size-12 items-center justify-center rounded-full bg-blue-600">
                  <IconBrandFacebook size={24} className="text-primary" />
                </div>
                <span className="text-primary text-xs">Facebook</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  openShareWindow(
                    `https://twitter.com/share?${new URLSearchParams({
                      url: shareData.url,
                      text: shareData.title,
                    })}`,
                  )
                }
                className="flex flex-col items-center gap-2 transition-opacity hover:opacity-70"
              >
                <div className="flex size-12 items-center justify-center rounded-full bg-black">
                  <IconBrandX size={24} className="text-primary" />
                </div>
                <span className="text-primary text-xs">X</span>
              </button>

              <button
                type="button"
                onClick={handleCopy}
                className="flex flex-col items-center gap-2 transition-opacity hover:opacity-70"
              >
                <div
                  className={cn(
                    'flex size-12 items-center justify-center rounded-full',
                    copySuccess === 'link'
                      ? 'bg-green-600'
                      : 'bg-gray-200 dark:bg-zinc-700',
                  )}
                >
                  <IconCopy size={24} className="text-primary" />
                </div>
                <span className="text-primary text-xs">
                  {copySuccess === 'link' ? 'Copied!' : 'Copy'}
                </span>
              </button>
            </div>
          </LcModal.Popup>
        </LcModal.Portal>
      </LcModal.Root>
    </>
  );
}
