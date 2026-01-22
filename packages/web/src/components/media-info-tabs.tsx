import { Tabs } from '@base-ui-components/react/tabs';
import type { UploadLicense } from '@letschurch/db/types';
import { LcTooltip } from '@/components/lc-tooltip';
import { getLicenseInfo } from '@/util/license';

type MediaInfoTabsProps = {
  descriptionHtml: string | null;
  viewCount: number;
  publishedAt: Date | null;
  createdAt: Date;
  license: UploadLicense;
  showTranscriptTab: boolean;
  showPlaylistTab: boolean;
  showCommentsTab: boolean;
  commentsEnabled: boolean;
  onTranscriptClick: () => void;
  onPlaylistClick: () => void;
  onCommentsClick: () => void;
};

export function MediaInfoTabs({
  descriptionHtml,
  viewCount,
  publishedAt,
  createdAt,
  license,
  showTranscriptTab,
  showPlaylistTab,
  showCommentsTab,
  commentsEnabled,
  onTranscriptClick,
  onPlaylistClick,
  onCommentsClick,
}: MediaInfoTabsProps) {
  const licenseInfo = getLicenseInfo(license);
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
          <span className="font-medium text-primary/30 text-sm data-selected:text-primary data-selected:opacity-100">
            Summary
          </span>
        </LcTooltip>
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
              Playlist
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
        <p className="p-5 text-primary text-sm leading-[1.4]">
          Summary content goes here
        </p>
      </Tabs.Panel>
    </Tabs.Root>
  );
}
