type TrendingSearchPillProps = {
  search: string;
  onClick?: () => void;
};

export function TrendingSearchPill({
  search,
  onClick,
}: TrendingSearchPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-7 rounded-full border border-white/10 bg-white/5 px-3 text-primary text-sm transition-colors hover:bg-white/10"
    >
      {search}
    </button>
  );
}
