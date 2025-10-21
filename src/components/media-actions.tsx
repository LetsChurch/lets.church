import { Dialog } from '@base-ui-components/react/dialog';
import { Menu } from '@base-ui-components/react/menu';
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
  IconDownload,
  IconFlag,
  IconShare2,
  IconThumbDown,
  IconThumbUp,
  IconVolume,
  IconX,
} from '@tabler/icons-react';
import { useState } from 'react';
import LcButton from '@/components/lc-button';
import LcButtonGroup from '@/components/lc-button-group';
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
  mediaDimensions?: {
    width: number;
    height: number;
  };
  hasVideo?: boolean;
  hasAudio?: boolean;
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
  mediaDimensions,
  hasVideo = true,
  hasAudio = false,
}: MediaActionsProps) {
  const abortController = useAbortController();
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);

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
      <div className="ml-auto flex flex-shrink-0 items-center gap-2.5">
        {/* Reactions */}
        <LcButtonGroup
          buttons={[
            {
              type: 'button',
              onClick: () => onRate('LIKE'),
              className: cn(ratingData.userRating === 'LIKE' && 'bg-white/10'),
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
                ratingData.userRating === 'DISLIKE' && 'bg-white/10',
              ),
              children: <IconThumbDown size={16} />,
            },
          ]}
        />

        {/* Comments */}
        {/* <LcButton className="flex items-center gap-0.5"> */}
        {/*   <IconMessageCircle2 size={16} /> */}
        {/*   13 */}
        {/* </LcButton> */}

        {/* Share */}
        <LcButton className="p-2" onClick={handleShare}>
          <IconShare2 size={16} />
        </LcButton>

        {/* Embed */}
        {(hasVideo || hasAudio) && (
          <Menu.Root>
            <Menu.Trigger
              render={(props) => (
                <LcButton {...props} className="p-2">
                  <IconCode size={16} />
                </LcButton>
              )}
            />
            <Menu.Portal>
              <Menu.Positioner sideOffset={8} className="z-50">
                <Menu.Popup className="min-w-[200px] rounded-lg border border-zinc-800 border-solid bg-zinc-900 py-1 shadow-xl transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0">
                  {hasVideo ? (
                    <Menu.Item
                      render={(props) => (
                        <button
                          {...props}
                          type="button"
                          onClick={() => handleCopyEmbed('video')}
                          className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm text-white outline-none transition-colors hover:bg-zinc-800 data-[highlighted]:bg-zinc-800"
                        >
                          <IconDeviceTvOld size={16} />
                          {copySuccess === 'embed-video'
                            ? 'Copied!'
                            : 'Copy Video Embed'}
                        </button>
                      )}
                    />
                  ) : null}
                  {hasAudio ? (
                    <Menu.Item
                      render={(props) => (
                        <button
                          {...props}
                          type="button"
                          onClick={() => handleCopyEmbed('audio')}
                          className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm text-white outline-none transition-colors hover:bg-zinc-800 data-[highlighted]:bg-zinc-800"
                        >
                          <IconVolume size={16} />
                          {copySuccess === 'embed-audio'
                            ? 'Copied!'
                            : 'Copy Audio Embed'}
                        </button>
                      )}
                    />
                  ) : null}
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        )}

        {/* Download */}
        {downloadData?.enabled && downloadData.urls.length > 0 ? (
          <Menu.Root>
            <Menu.Trigger
              render={(props) => (
                <LcButton {...props} className="p-2">
                  <IconDownload size={16} />
                </LcButton>
              )}
            />
            <Menu.Portal>
              <Menu.Positioner sideOffset={8} className="z-50">
                <Menu.Popup className="min-w-[200px] rounded-lg border border-zinc-800 border-solid bg-zinc-900 py-1 shadow-xl transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0">
                  {downloadData.urls.map((download) => (
                    <Menu.Item
                      key={download.url}
                      render={(props) => (
                        <a
                          {...props}
                          href={download.url}
                          download
                          className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-white outline-none transition-colors hover:bg-zinc-800 data-[highlighted]:bg-zinc-800"
                        >
                          {getDownloadIcon(download.kind)}
                          {download.label}
                        </a>
                      )}
                    />
                  ))}
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        ) : null}

        {/* Divider */}
        <div className="h-7 w-px bg-zinc-900" />

        {/* Save */}
        <LcButton className="flex items-center gap-0.5">
          <IconBookmark size={16} />
          Save
        </LcButton>

        {/* Follow */}
        <LcButton
          className={cn(
            'flex items-center gap-0.5',
            channelData.isFollowing && 'bg-white/10',
          )}
          onClick={onFollowToggle}
        >
          <IconFlag size={16} />
          {channelData.isFollowing ? 'Following' : 'Follow'}
        </LcButton>

        {/* More */}
        {/* <LcButton className="p-1.5"> */}
        {/*   <IconDots size={16} /> */}
        {/* </LcButton> */}
      </div>

      {/* Share Modal */}
      <Dialog.Root open={shareModalOpen} onOpenChange={setShareModalOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ease-in-out data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />

          <Dialog.Popup className="-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 w-full max-w-sm rounded-lg border border-zinc-800 border-solid bg-zinc-900 p-6 shadow-xl transition-all duration-300 data-[ending-style]:scale-95 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0">
            <div className="flex items-center justify-between pb-4">
              <Dialog.Title className="font-semibold text-lg text-white">
                Share
              </Dialog.Title>
              <Dialog.Close
                render={(props) => (
                  <button
                    {...props}
                    type="button"
                    className="flex size-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
                  >
                    <IconX size={20} />
                  </button>
                )}
              />
            </div>

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
                  <IconBrandFacebook size={24} className="text-white" />
                </div>
                <span className="text-white text-xs">Facebook</span>
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
                  <IconBrandX size={24} className="text-white" />
                </div>
                <span className="text-white text-xs">X</span>
              </button>

              <button
                type="button"
                onClick={handleCopy}
                className="flex flex-col items-center gap-2 transition-opacity hover:opacity-70"
              >
                <div
                  className={cn(
                    'flex size-12 items-center justify-center rounded-full',
                    copySuccess === 'link' ? 'bg-green-600' : 'bg-zinc-700',
                  )}
                >
                  <IconCopy size={24} className="text-white" />
                </div>
                <span className="text-white text-xs">
                  {copySuccess === 'link' ? 'Copied!' : 'Copy'}
                </span>
              </button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
