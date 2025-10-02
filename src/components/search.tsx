import {
  IconAdjustmentsHorizontal,
  IconSearch,
  IconX,
} from '@tabler/icons-react';
import { cn } from '@/util/cn';

type SearchProps = {
  placeholder?: string;
  className?: string;
  defaultValue?: string;
  showFilters?: boolean;
  onClear?: () => void;
};

export default function Search({
  // placeholder = 'Search or ask anything...', // TODO
  placeholder = 'Search anything...',
  className,
  defaultValue,
  showFilters = false,
  onClear,
}: SearchProps) {
  const hasQuery = !!defaultValue;

  return (
    <div
      className={cn(
        'flex h-10 items-center gap-1 rounded-3xl border border-white/10 bg-white/5 px-3 transition-all duration-200 focus-within:border-white/0 focus-within:shadow-[0_0_0_2px_theme(colors.white/0.2),0_0_20px_theme(colors.white/0.3)]',
        className,
      )}
    >
      <div className="min-w-0 flex-1 px-1 pb-0.5">
        <input
          type="text"
          placeholder={placeholder}
          defaultValue={defaultValue}
          className="w-full appearance-none font-medium text-primary text-sm leading-none placeholder-text-muted outline-none placeholder:opacity-30"
        />
      </div>
      <div className="flex flex-shrink-0 items-center gap-0">
        {hasQuery ? (
          <button
            type="button"
            onClick={onClear}
            className="flex size-8 items-center justify-center rounded-full text-primary/50 transition-colors hover:bg-white/10 hover:text-primary"
            aria-label="Clear search"
          >
            <IconX size={24} />
          </button>
        ) : null}
        {showFilters && hasQuery ? (
          <button
            type="button"
            className="flex size-8 items-center justify-center rounded-full text-primary/50 transition-colors hover:bg-white/10 hover:text-primary"
            aria-label="Filters"
          >
            <IconAdjustmentsHorizontal size={24} />
          </button>
        ) : null}
        {hasQuery ? null : (
          <button
            type="submit"
            className="flex size-8 items-center justify-center rounded-full text-primary/50 transition-colors hover:bg-white/10 hover:text-primary"
          >
            <IconSearch size={24} />
          </button>
        )}
      </div>
    </div>
  );
}
