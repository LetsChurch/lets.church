import { Tabs } from '@base-ui/react/tabs';
import { cn } from '@/util/cn';

export type ChannelTab = 'videos' | 'playlists' | 'series' | 'links';

type ChannelTabsProps = {
  videoCount?: number;
  playlistCount?: number;
  seriesCount?: number;
  className?: string;
};

// Renders the tab bar for the channel page. This is a Base UI `Tabs.List`, so
// it must live inside a `Tabs.Root` (owned by the channel route, which also
// renders the matching `Tabs.Panel`s and controls selection). The visual
// design is unchanged from the previous hand-rolled version.
export default function ChannelTabs({
  videoCount,
  playlistCount,
  seriesCount,
  className,
}: ChannelTabsProps) {
  const tabs = [
    { id: 'videos' as const, label: 'Videos', count: videoCount },
    ...(playlistCount && playlistCount > 0
      ? [{ id: 'playlists' as const, label: 'Playlists', count: playlistCount }]
      : []),
    ...(seriesCount && seriesCount > 0
      ? [{ id: 'series' as const, label: 'Series', count: seriesCount }]
      : []),
    { id: 'links' as const, label: 'Links', count: undefined },
  ];

  return (
    <Tabs.List
      className={cn(
        'relative flex items-start gap-4 border-zinc-900 border-b',
        className,
      )}
    >
      {tabs.map((tab) => (
        <Tabs.Tab
          key={tab.id}
          value={tab.id}
          className="group relative flex h-10 items-center gap-1 pt-1.5 pb-2"
        >
          <div className="flex items-center gap-2 pb-px">
            <span className="overflow-hidden overflow-ellipsis whitespace-nowrap font-medium text-primary/70 text-sm leading-none group-data-[active]:text-primary">
              {tab.label}
            </span>
          </div>
          {tab.count !== undefined ? (
            <div className="flex h-[18px] min-w-[18px] items-center justify-center rounded-[9px] bg-white/10 px-1.5 pt-[2px] pb-[3px] font-bold text-[10px] text-primary/70">
              {tab.count > 99 ? '99+' : tab.count}
            </div>
          ) : null}
        </Tabs.Tab>
      ))}
      {/* Sliding active-tab underline. Base UI positions it via CSS vars set on
          the indicator; the styling matches the previous per-tab underline. */}
      <Tabs.Indicator
        className="absolute bottom-0 h-[2px] rounded-tl-[1px] rounded-tr-[1px] bg-brand shadow-[0px_2px_12px_0px_#6366f1] backdrop-blur-sm transition-all duration-200"
        style={{
          left: 'var(--active-tab-left)',
          width: 'var(--active-tab-width)',
        }}
      />
    </Tabs.List>
  );
}
