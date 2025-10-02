import { IconSearch } from '@tabler/icons-react';

export function SearchCard() {
  return (
    <div className="flex aspect-video flex-col gap-2 rounded-lg border border-top-highlight bg-card p-4">
      <h3 className="font-bold text-base text-primary">
        Easily discover relevant content
      </h3>
      <p className="text-primary text-xs leading-relaxed">
        Search by topic or bible verse, ask questions, or find just about
        anything else. We'll use intelligent search across transcripts to find
        what you're looking for.
      </p>
      <div className="mt-auto">
        <div className="flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3">
          <input
            type="text"
            placeholder="Search or ask anything..."
            className="appearance-non flex-1 text-primary text-sm placeholder-text-muted outline-none"
          />
          <IconSearch className="text-primary/50" />
        </div>
      </div>
    </div>
  );
}
