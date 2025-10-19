import { Dialog } from '@base-ui-components/react/dialog';
import {
  IconBookmark,
  IconBrandFacebook,
  IconBrandX,
  IconCopy,
  IconFlag,
  IconShare2,
  IconThumbDown,
  IconThumbUp,
  IconX,
} from '@tabler/icons-react';
import { useState } from 'react';
import LcButton from '@/components/lc-button';
import LcButtonGroup from '@/components/lc-button-group';
import { cn } from '@/util/cn';

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

export function MediaActions({
  ratingData,
  onRate,
  shareData,
}: MediaActionsProps) {
  const [shareModalOpen, setShareModalOpen] = useState(false);

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
      setShareModalOpen(false);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
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
                <div className="flex size-12 items-center justify-center rounded-full bg-zinc-700">
                  <IconCopy size={24} className="text-white" />
                </div>
                <span className="text-white text-xs">Copy</span>
              </button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
