import { cn } from '@/util/cn';

type ChannelTabsProps = {
  activeTab?: 'videos' | 'playlists' | 'series' | 'links';
  videoCount?: number;
  playlistCount?: number;
  seriesCount?: number;
  className?: string;
  onTabChange?: (tab: 'videos' | 'playlists' | 'series' | 'links') => void;
};

export default function ChannelTabs({
  activeTab = 'videos',
  videoCount,
  playlistCount,
  seriesCount,
  className,
  onTabChange,
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
    <div
      className={cn(
        'relative flex items-start gap-4 border-zinc-900 border-b',
        className,
      )}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onTabChange?.(tab.id)}
          className="relative flex h-10 items-center gap-1 pt-1.5 pb-2"
        >
          <div className="flex items-center gap-2 pb-px">
            <span
              className={cn(
                'overflow-hidden overflow-ellipsis whitespace-nowrap font-medium text-sm leading-none',
                activeTab === tab.id ? 'text-primary' : 'text-primary/70',
              )}
            >
              {tab.label}
            </span>
          </div>
          {tab.count !== undefined ? (
            <div className="flex h-[18px] min-w-[18px] items-center justify-center rounded-[9px] bg-white/10 px-1.5 pt-[2px] pb-[3px] font-bold text-[10px] text-primary/70">
              {tab.count > 99 ? '99+' : tab.count}
            </div>
          ) : null}
          {activeTab === tab.id ? (
            <div className="absolute right-0 bottom-0 left-0 h-[2px] rounded-tl-[1px] rounded-tr-[1px] bg-brand shadow-[0px_2px_12px_0px_#6366f1] backdrop-blur-sm" />
          ) : null}
        </button>
      ))}
    </div>
  );
}
