import { cn } from '@/util/cn';

type SearchTabsProps = {
  activeTab?: 'all' | 'channels' | 'churches' | 'media';
  channelCount?: number;
  churchCount?: number;
  mediaCount?: number;
  className?: string;
};

export default function SearchTabs({
  activeTab = 'all',
  channelCount,
  churchCount,
  mediaCount,
  className,
}: SearchTabsProps) {
  const tabs = [
    { id: 'all' as const, label: 'All', count: undefined },
    { id: 'channels' as const, label: 'Channels', count: channelCount },
    { id: 'churches' as const, label: 'Churches', count: churchCount },
    { id: 'media' as const, label: 'Media', count: mediaCount },
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
          className="relative flex h-10 items-center justify-center gap-1"
        >
          <div className="flex items-center justify-center gap-2">
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
            <div className="flex h-[18px] min-w-[18px] items-center justify-center rounded-[9px] bg-white/10 px-1.5 text-[10px] text-primary/70">
              {tab.count > 99 ? '99+' : tab.count}
            </div>
          ) : null}
          {activeTab === tab.id ? (
            <div className="absolute right-0 bottom-0 left-0 h-[2px] rounded-tl-[1px] rounded-tr-[1px] bg-indigo-500 shadow-[0px_2px_12px_0px_#6366f1] backdrop-blur-sm" />
          ) : null}
        </button>
      ))}
    </div>
  );
}
