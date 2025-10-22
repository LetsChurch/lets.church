import {
  IconAdjustmentsHorizontal,
  IconSearch,
  IconX,
} from '@tabler/icons-react';
import { useNavigate } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { cn } from '@/util/cn';

type SearchProps = {
  placeholder?: string;
  className?: string;
  defaultValue?: string;
  showFilters?: boolean;
  channelId?: string;
};

export default function Search({
  // placeholder = 'Search or ask anything...', // TODO
  placeholder = 'Search anything...',
  className,
  defaultValue,
  showFilters = false,
  channelId,
}: SearchProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState(defaultValue ?? '');
  const hasQuery = !!query;

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const searchQuery = formData.get('q') as string;

    if (searchQuery.trim()) {
      navigate({
        to: '/search',
        search: {
          q: searchQuery,
          focus: 'media' as const,
          channelId: channelId ?? undefined,
        },
      });
    }
  };

  const handleClear = () => {
    setQuery('');
    navigate({
      to: '/search',
      search: {
        q: undefined,
        focus: 'media' as const,
        channelId: undefined,
      },
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        'flex h-10 items-center gap-1 rounded-3xl border border-white/10 bg-white/5 px-3 transition-all duration-200 focus-within:border-white/0 focus-within:shadow-[0_0_0_2px_theme(colors.white/0.2),0_0_20px_theme(colors.white/0.3)]',
        className,
      )}
    >
      <div className="min-w-0 flex-1 px-1 pb-0.5">
        <input
          type="text"
          name="q"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full appearance-none font-medium text-primary text-sm leading-none placeholder-text-muted outline-none placeholder:opacity-30"
        />
      </div>
      <div className="flex flex-shrink-0 items-center gap-0">
        {hasQuery ? (
          <button
            type="button"
            onClick={handleClear}
            className="flex size-8 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-primary"
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
            className="flex size-8 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          >
            <IconSearch size={24} />
          </button>
        )}
      </div>
    </form>
  );
}
