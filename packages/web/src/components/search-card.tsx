import { IconSearch } from '@tabler/icons-react';
import { useNavigate } from '@tanstack/react-router';
import type { FormEvent } from 'react';

export function SearchCard() {
  const navigate = useNavigate({ from: '/search' });

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
        },
      });
    }
  };

  return (
    <div className="flex aspect-video flex-col gap-2 rounded-lg border-fancy-pants bg-zinc-100 p-4 dark:bg-zinc-900">
      <h3 className="font-bold text-base text-primary">
        Easily discover relevant content
      </h3>
      {/* <p className="text-primary text-xs leading-relaxed"> */}
      {/*   Search by topic or bible verse, ask questions, or find just about */}
      {/*   anything else. We'll use intelligent search across transcripts to find */}
      {/*   what you're looking for. */}
      {/* </p> */}
      <p className="text-primary text-xs leading-relaxed">
        Search media and transcripts and find anything you're looking for.
      </p>
      <div className="mt-auto">
        <form onSubmit={handleSubmit}>
          <div className="flex h-10 items-center gap-2 rounded-full border border-gray-950/10 bg-gray-950/5 px-3 dark:border-white/10 dark:bg-white/5">
            <input
              type="text"
              name="q"
              placeholder="Search or ask anything..."
              className="flex-1 appearance-none bg-transparent font-medium text-primary text-sm outline-none placeholder:text-gray-950/30 dark:placeholder:text-white/30"
            />
            <button type="submit" className="flex items-center">
              <IconSearch className="text-primary opacity-50" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
