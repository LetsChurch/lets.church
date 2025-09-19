import { IconSearch } from '@tabler/icons-react';
import { cn } from '@/util/cn';

type SearchProps = {
  placeholder?: string;
  className?: string;
};

export default function Search({
  // placeholder = 'Search or ask anything...', // TODO
  placeholder = 'Search anything...',
  className,
}: SearchProps) {
  return (
    <div
      className={cn(
        'flex h-8 items-center gap-1 rounded-3xl border border-white/10 bg-white/5 px-3',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <input
          type="text"
          placeholder={placeholder}
          className="w-full appearance-none text-primary text-sm placeholder-text-muted outline-none"
        />
      </div>
      <button
        type="submit"
        className="flex-shrink-0 text-white/50 transition-opacity hover:text-white"
      >
        <IconSearch />
      </button>
    </div>
  );
}
