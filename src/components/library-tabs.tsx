import { Link } from '@tanstack/react-router';
import { cn } from '@/util/cn';

type LibraryTabsProps = {
  activeTab: 'saved' | 'history';
};

export function LibraryTabs({ activeTab }: LibraryTabsProps) {
  return (
    <div className="flex gap-1 border-zinc-800 border-b">
      <Link
        to="/library"
        className={cn(
          'px-4 py-2 font-medium text-sm',
          activeTab === 'saved'
            ? 'border-indigo-500 border-b-2 text-white'
            : 'text-zinc-400 hover:text-white',
        )}
      >
        Saved Content
      </Link>
      <Link
        to="/history"
        className={cn(
          'px-4 py-2 font-medium text-sm',
          activeTab === 'history'
            ? 'border-indigo-500 border-b-2 text-white'
            : 'text-zinc-400 hover:text-white',
        )}
      >
        History
      </Link>
    </div>
  );
}
