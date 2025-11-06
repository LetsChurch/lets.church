import { Tabs } from '@base-ui-components/react/tabs';
import { Tooltip } from '@base-ui-components/react/tooltip';

type MediaInfoTabsProps = {
  description: string | null;
  viewCount: number;
  publishedAt: Date | null;
  createdAt: Date;
  showTranscriptTab: boolean;
  showCommentsTab: boolean;
  commentsEnabled: boolean;
  onTranscriptClick: () => void;
  onCommentsClick: () => void;
};

export function MediaInfoTabs({
  description,
  viewCount,
  publishedAt,
  createdAt,
  showTranscriptTab,
  showCommentsTab,
  commentsEnabled,
  onTranscriptClick,
  onCommentsClick,
}: MediaInfoTabsProps) {
  return (
    <Tabs.Root
      defaultValue="details"
      className="relative isolate mt-7 flex flex-col overflow-hidden rounded-2xl border-top-highlight bg-card"
    >
      {/* Tabs */}
      <Tabs.List className="relative top-0 flex gap-4 border-zinc-800 border-b px-5">
        <Tabs.Tab value="details" className="relative pt-1.5 pb-2">
          <span className="font-medium text-primary/70 text-sm data-[selected]:text-primary data-[selected]:opacity-100">
            Details
          </span>
        </Tabs.Tab>
        <Tooltip.Provider>
          <Tooltip.Root delay={0}>
            <Tooltip.Trigger
              render={
                <Tabs.Tab
                  value="summary"
                  className="relative pt-1.5 pb-2"
                  disabled
                />
              }
            >
              <span className="font-medium text-primary/30 text-sm data-[selected]:text-primary data-[selected]:opacity-100">
                Summary
              </span>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Positioner sideOffset={8} className="z-50">
                <Tooltip.Popup className="rounded-lg bg-zinc-900 px-2 py-1.5 font-semibold text-primary text-xs shadow-[0_20px_25px_-5px_rgba(0,0,0,0.9),0_8px_10px_-6px_rgba(0,0,0,0.9)]">
                  Coming soon
                  <Tooltip.Arrow className="data-[side=bottom]:top-[-4px] data-[side=left]:right-[-4px] data-[side=top]:bottom-[-4px] data-[side=right]:left-[-4px]" />
                </Tooltip.Popup>
              </Tooltip.Positioner>
            </Tooltip.Portal>
          </Tooltip.Root>
        </Tooltip.Provider>
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
        <p className="p-5 text-primary text-sm leading-[1.4]">
          {description ? description : 'No description available'}
        </p>
        <div className="mx-5 border-zinc-800 border-t pt-[18px] pb-5">
          <div className="flex gap-3">
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
