import {
  IconBrandFacebook,
  IconBrandX,
  IconCheck,
  IconShare2,
} from '@tabler/icons-react';
import posthog from 'posthog-js';
import { useState, type ReactNode } from 'react';

import LcButton from '@/components/lc-button';
import { LcModal, ModalHeader } from '@/components/lc-modal';
import { useAbortController } from '@/hooks/use-abort-controller';
import { abortableSetTimeout } from '@/util/abortable-timeout';
import { cn } from '@/util/cn';

/** Where a share went, as recorded in analytics. */
export type SharePlatform = 'native' | 'facebook' | 'x' | 'copy_link';

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
  // The sharer page must not get a handle on this tab (reverse tabnabbing).
  noopener: 'yes',
})
  .map(([k, v]) => `${k}=${v}`)
  .join(',');

type ShareButtonsProps = {
  title: string;
  url: string;
  /** Called after a native share completes or a social window opens. */
  onShare: (platform: Exclude<SharePlatform, 'copy_link'>, url: string) => void;
};

/** Native share (when the browser supports it), Facebook and X. */
export function ShareButtons({ title, url, onShare }: ShareButtonsProps) {
  const handleNativeShare = async () => {
    try {
      await navigator.share({ title, url });
      onShare('native', url);
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return;
      }
      console.error('Error sharing:', error);
    }
  };

  const openShareWindow = (shareUrl: string, platform: 'facebook' | 'x') => {
    window.open(shareUrl, '', windowConfig);
    onShare(platform, url);
  };

  return (
    <div className="flex items-center justify-center gap-6">
      {typeof navigator !== 'undefined' &&
      navigator.canShare?.({ title, url }) ? (
        <button
          type="button"
          onClick={handleNativeShare}
          className="flex flex-col items-center gap-2 rounded-lg transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
        >
          <div className="flex size-12 items-center justify-center rounded-full bg-linear-to-br from-purple-600 to-blue-600">
            <IconShare2 size={24} className="text-white" />
          </div>
          <span className="text-primary text-xs">Share</span>
        </button>
      ) : null}

      <button
        type="button"
        onClick={() =>
          openShareWindow(
            `https://www.facebook.com/sharer/sharer.php?${new URLSearchParams({
              u: url,
              quote: title,
            })}`,
            'facebook',
          )
        }
        className="flex flex-col items-center gap-2 rounded-lg transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
      >
        <div className="flex size-12 items-center justify-center rounded-full bg-blue-600">
          <IconBrandFacebook size={24} className="text-white" />
        </div>
        <span className="text-primary text-xs">Facebook</span>
      </button>

      <button
        type="button"
        onClick={() =>
          openShareWindow(
            `https://twitter.com/share?${new URLSearchParams({
              url,
              text: title,
            })}`,
            'x',
          )
        }
        className="flex flex-col items-center gap-2 rounded-lg transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
      >
        <div className="flex size-12 items-center justify-center rounded-full bg-black">
          <IconBrandX size={24} className="text-white" />
        </div>
        <span className="text-primary text-xs">X</span>
      </button>
    </div>
  );
}

type ShareLinkFieldProps = {
  url: string;
  /** Called after the link is copied to the clipboard. */
  onCopy: (url: string) => void;
};

/**
 * The share link in a read-only field with a Copy button. Render it with
 * `key={url}` so a new link starts without the "Copied!" state.
 */
export function ShareLinkField({ url, onCopy }: ShareLinkFieldProps) {
  const abortController = useAbortController();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      onCopy(url);
      abortableSetTimeout(() => setCopied(false), 1500, abortController.signal);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-lg border border-zinc-300 bg-zinc-50 p-3 focus-within:outline-2 focus-within:outline-blue-600 dark:border-zinc-700 dark:bg-zinc-800">
      <input
        type="text"
        readOnly
        aria-label="Share link"
        value={url}
        className="text-primary min-w-0 flex-1 truncate bg-transparent font-mono text-sm outline-none"
      />
      <div className="relative">
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            'relative shrink-0 rounded-md px-4 py-2 font-medium text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600',
            copied
              ? 'bg-green-600 text-white'
              : 'bg-blue-600 text-white hover:bg-blue-700',
          )}
        >
          <span
            className={cn(
              'transition-opacity',
              copied ? 'opacity-0' : 'opacity-100',
            )}
          >
            Copy
          </span>
          {copied ? (
            <span className="absolute inset-0 flex items-center justify-center">
              Copied!
            </span>
          ) : null}
        </button>
        {copied ? (
          <div className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-green-600 ring-2 ring-white dark:ring-zinc-900">
            <IconCheck size={14} className="text-white" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

type ShareDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  url: string;
  onShare: (platform: SharePlatform, url: string) => void;
  /** Shown above the share buttons, e.g. what is being shared. */
  children?: ReactNode;
};

/** A Share dialog for a page link: social buttons and a copyable link. */
export function ShareDialog({
  open,
  onOpenChange,
  title,
  url,
  onShare,
  children,
}: ShareDialogProps) {
  return (
    <LcModal.Root open={open} onOpenChange={onOpenChange}>
      <LcModal.Portal>
        <LcModal.Backdrop />
        <LcModal.Popup>
          <ModalHeader title="Share" />
          <div className="flex flex-col gap-4 p-6">
            {children}
            <ShareButtons title={title} url={url} onShare={onShare} />
            <ShareLinkField
              key={url}
              url={url}
              onCopy={(copiedUrl) => onShare('copy_link', copiedUrl)}
            />
          </div>
        </LcModal.Popup>
      </LcModal.Portal>
    </LcModal.Root>
  );
}

/** An absolute link to a site path, on the current origin in the browser. */
export function pageUrl(path: string): string {
  return typeof window !== 'undefined'
    ? new URL(path, window.location.origin).toString()
    : `https://lets.church${path}`;
}

export type ShareListKind = 'series' | 'playlist';

/**
 * Records sharing a series or playlist as `series_shared` /
 * `playlist_shared`, whichever page it was shared from (`source`).
 */
export function captureListShare({
  kind,
  id,
  title,
  platform,
  shareUrl,
  source,
  uploadId,
}: {
  kind: ShareListKind;
  id: string;
  title: string;
  platform: SharePlatform;
  shareUrl: string;
  source: 'list_page' | 'media_page';
  /** The media page it was shared from, when `source` is `media_page`. */
  uploadId?: string | null;
}) {
  posthog.capture(`${kind}_shared`, {
    [`${kind}_id`]: id,
    [`${kind}_title`]: title,
    platform,
    share_url: shareUrl,
    source,
    upload_id: uploadId ?? null,
  });
}

/** A Share button that opens the Share dialog for a series or playlist page. */
export function ListShareButton({
  kind,
  id,
  title,
}: {
  kind: ShareListKind;
  id: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <LcButton
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Share ${kind}`}
        className="mt-1 flex shrink-0 items-center gap-1.5"
      >
        <IconShare2 size={16} />
        Share
      </LcButton>
      <ShareDialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        url={pageUrl(`/${kind}/${id}`)}
        onShare={(platform, shareUrl) =>
          captureListShare({
            kind,
            id,
            title,
            platform,
            shareUrl,
            source: 'list_page',
          })
        }
      />
    </>
  );
}
