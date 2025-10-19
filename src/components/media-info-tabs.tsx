import { Tabs } from '@base-ui-components/react/tabs';

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
        {showTranscriptTab ? (
          <button
            type="button"
            onClick={onTranscriptClick}
            className="relative pt-1.5 pb-2"
          >
            <span className="font-medium text-sm text-white/70 hover:text-white">
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
            <span className="font-medium text-sm text-white/70 hover:text-white">
              Comments
            </span>
          </button>
        ) : null}
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
          {description ? description : 'No description available'}
        </p>
        <div className="mx-5 border-zinc-800 border-t pt-[18px] pb-5">
          <div className="flex gap-3">
            <span className="font-medium text-white/70 text-xs">
              {viewCount.toLocaleString()} views
            </span>
            <span className="font-medium text-white/70 text-xs">
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
        <p className="p-5 text-sm text-white leading-[1.4]">
          Summary content goes here
        </p>
      </Tabs.Panel>
    </Tabs.Root>
  );
}
