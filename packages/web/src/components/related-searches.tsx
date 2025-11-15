import { TrendingSearchPill } from '@/components/trending-search-pill';

type RelatedSearchesProps = {
  searches: string[];
};

export function RelatedSearches({ searches }: RelatedSearchesProps) {
  return (
    <div className="mb-8">
      <h2 className="mb-4 font-bold text-base text-primary leading-none">
        Related Searches
      </h2>
      <div className="flex flex-wrap gap-2">
        {searches.map((search) => (
          <TrendingSearchPill key={search} search={search} />
        ))}
      </div>
    </div>
  );
}
