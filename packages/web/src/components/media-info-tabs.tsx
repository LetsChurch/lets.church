import { Tabs } from '@base-ui-components/react/tabs';
import type { UploadLicense } from '@letschurch/db/types';
import { IconSparkles } from '@tabler/icons-react';
import { useEffect, useRef } from 'react';
import { LcTooltip } from '@/components/lc-tooltip';
import { $setPlayAt } from '@/stores/player';
import { formatTime } from '@/util/format';
import { getLicenseInfo } from '@/util/license';

export type MediaOutlineEntry = {
  id: string;
  title: string;
  startSeconds: number;
  endSeconds: number;
  description: string | null;
};

type MediaInfoTabsProps = {
  descriptionHtml: string | null;
  summary: string | null;
  outline: ReadonlyArray<MediaOutlineEntry>;
  viewCount: number;
  publishedAt: Date | null;
  createdAt: Date;
  license: UploadLicense;
  lengthSeconds: number | null;
  showTranscriptTab: boolean;
  showPlaylistTab: boolean;
  playlistTabLabel?: string;
  showCommentsTab: boolean;
  commentsEnabled: boolean;
  onTranscriptClick: () => void;
  onPlaylistClick: () => void;
  onCommentsClick: () => void;
};

export function MediaInfoTabs({
  descriptionHtml,
  summary,
  outline,
  viewCount,
  publishedAt,
  createdAt,
  license,
  lengthSeconds,
  showTranscriptTab,
  showPlaylistTab,
  playlistTabLabel = 'Playlist',
  showCommentsTab,
  commentsEnabled,
  onTranscriptClick,
  onPlaylistClick,
  onCommentsClick,
}: MediaInfoTabsProps) {
  const licenseInfo = getLicenseInfo(license);
  const descriptionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = descriptionRef.current;
    if (!el) return;

    const ac = new AbortController();

    el.addEventListener(
      'click',
      (e: MouseEvent) => {
        const target = (e.target as HTMLElement).closest('a[data-timestamp]');
        if (!target) return;

        const seconds = Number(target.getAttribute('data-timestamp'));
        if (Number.isNaN(seconds)) return;

        if (lengthSeconds != null && seconds > lengthSeconds) return;

        e.preventDefault();
        $setPlayAt.set(seconds);
      },
      ac,
    );

    return () => ac.abort();
  }, [lengthSeconds]);

  return (
    <Tabs.Root
      defaultValue="details"
      className="relative isolate mt-7 flex flex-col overflow-hidden rounded-2xl border-fancy-pants bg-zinc-100 dark:bg-zinc-900"
    >
      {/* Tabs */}
      <Tabs.List className="relative top-0 flex gap-4 border-zinc-200 border-b px-5 dark:border-zinc-800">
        <Tabs.Tab value="details" className="relative pt-1.5 pb-2">
          <span className="font-medium text-primary/70 text-sm data-selected:text-primary data-selected:opacity-100">
            Details
          </span>
        </Tabs.Tab>
        {summary ? (
          <Tabs.Tab value="summary" className="relative pt-1.5 pb-2">
            <span className="inline-flex items-center gap-1 font-medium text-primary/70 text-sm data-selected:text-primary data-selected:opacity-100">
              <IconSparkles size={14} aria-hidden="true" />
              Summary
            </span>
          </Tabs.Tab>
        ) : (
          // No summary yet — keep the tab visible but disabled so users know
          // it's a planned surface, not a missing feature. Sparkles still
          // appears so the icon's presence is consistent across both states.
          <LcTooltip
            content="Coming soon"
            render={
              <Tabs.Tab
                value="summary"
                className="relative pt-1.5 pb-2"
                disabled
              />
            }
          >
            <span className="inline-flex items-center gap-1 font-medium text-primary/30 text-sm data-selected:text-primary data-selected:opacity-100">
              <IconSparkles size={14} aria-hidden="true" />
              Summary
            </span>
          </LcTooltip>
        )}
        {showTranscriptTab ? (
          <button
            type="button"
            onClick={onTranscriptClick}
            className="relative pt-1.5 pb-2"
          >
            <span className="font-medium text-primary/70 text-sm hover:text-primary">
              Transcript
            </span>
          </button>
        ) : null}
        {showPlaylistTab ? (
          <button
            type="button"
            onClick={onPlaylistClick}
            className="relative pt-1.5 pb-2"
          >
            <span className="font-medium text-primary/70 text-sm hover:text-primary">
              {playlistTabLabel}
            </span>
          </button>
        ) : null}
        {showCommentsTab ? (
          <button
            type="button"
            onClick={onCommentsClick}
            disabled={!commentsEnabled}
            className="relative pt-1.5 pb-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="font-medium text-primary/70 text-sm hover:text-primary">
              Comments
            </span>
          </button>
        ) : null}
        <Tabs.Indicator
          className="glow-md absolute h-0.5 rounded-t-sm bg-brand backdrop-blur-sm"
          style={{
            left: 'var(--active-tab-left)',
            bottom: 0,
            width: 'var(--active-tab-width)',
          }}
        />
      </Tabs.List>

      {/* Details Content */}
      <Tabs.Panel value="details" className="relative text-left">
        {descriptionHtml ? (
          <div
            ref={descriptionRef}
            className="prose px-5 text-sm"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML is compiled from markdown on server using micromark
            dangerouslySetInnerHTML={{ __html: descriptionHtml }}
          />
        ) : (
          <p className="p-5 text-primary text-sm leading-[1.4]">
            No description available
          </p>
        )}
        <div className="mx-5 border-zinc-200 border-t pt-[18px] pb-5 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <span className="font-medium text-primary/70 text-xs">
              {viewCount.toLocaleString()} views
            </span>
            <span className="font-medium text-primary/70 text-xs">
              {new Date(publishedAt || createdAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </span>
            <LcTooltip
              content={
                <div className="max-w-xs">
                  <div className="mb-1 font-semibold">{licenseInfo.name}</div>
                  <div className="text-xs">{licenseInfo.description}</div>
                  {licenseInfo.url ? (
                    <a
                      href={licenseInfo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-block text-blue-400 text-xs hover:underline"
                    >
                      Learn more
                    </a>
                  ) : null}
                </div>
              }
              render={
                <span className="cursor-help font-medium text-primary/70 text-xs" />
              }
            >
              {licenseInfo.name}
            </LcTooltip>
          </div>
        </div>
      </Tabs.Panel>

      {/* Summary Content */}
      <Tabs.Panel value="summary" className="relative text-left">
        {summary ? (
          // LLM-generated narrative summary from upload_record.summary
          // (produced by the summarize-upload activity). Plain prose — no
          // markdown — so render as text with preserved line breaks.
          <p className="whitespace-pre-line p-5 text-primary text-sm leading-[1.5]">
            {summary}
          </p>
        ) : (
          <p className="p-5 text-primary/70 text-sm leading-[1.4]">
            A summary has not yet been generated for this media.
          </p>
        )}
        {outline.length > 0 ? (
          // YouTube-style chapter list. Each entry is derived from an OUTLINE
          // annotation (title + paragraph start) joined to a per-section
          // description from `upload_record.sections`. Clicking the
          // timestamp seeks the player via the same store the description
          // links use.
          <div className="border-zinc-200 border-t px-5 py-4 dark:border-zinc-800">
            <h3 className="mb-3 font-semibold text-primary text-sm">
              In this {lengthSeconds ? 'video' : 'audio'}
            </h3>
            <ol className="space-y-3">
              {outline.map((entry) => (
                <li key={entry.id} className="text-sm leading-[1.5]">
                  <div className="flex items-baseline gap-2">
                    <button
                      type="button"
                      onClick={() => $setPlayAt.set(entry.startSeconds)}
                      className="font-mono text-blue-500 text-xs tabular-nums hover:underline dark:text-blue-400"
                    >
                      {formatTime(entry.startSeconds * 1000)}
                    </button>
                    <span className="font-medium text-primary">
                      {entry.title}
                    </span>
                  </div>
                  {entry.description ? (
                    <p className="mt-1 text-primary/70">{entry.description}</p>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </Tabs.Panel>
    </Tabs.Root>
  );
}
