import { Link } from '@tanstack/react-router';

import { cn } from '@/util/cn';

type LibraryTabsProps = {
  activeTab: 'saved' | 'history';
};

export function LibraryTabs({ activeTab }: LibraryTabsProps) {
  return (
    <div className="flex gap-1 border-b border-zinc-800">
      <Link
        to="/library"
        className={cn(
          'px-4 py-2 font-medium text-sm',
          activeTab === 'saved'
            ? 'border-brand border-b-2 text-primary'
            : 'text-zinc-400 hover:text-primary',
        )}
      >
        Saved Content
      </Link>
      <Link
        to="/history"
        className={cn(
          'px-4 py-2 font-medium text-sm',
          activeTab === 'history'
            ? 'border-brand border-b-2 text-primary'
            : 'text-zinc-400 hover:text-primary',
        )}
      >
        History
      </Link>
    </div>
  );
}
