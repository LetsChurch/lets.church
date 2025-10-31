export function DonateCard() {
  return (
    <div className="flex aspect-video flex-col gap-2 rounded-lg border border-top-highlight bg-brand p-4">
      <h3 className="font-bold text-base text-white">
        Help share the good news
      </h3>
      <p className="text-white text-xs leading-relaxed">
        Let's Church will always remain free and without ads, sustained only by
        donations. Would you consider giving to keep our platform running?
      </p>
      <div className="mt-auto flex justify-end border-indigo-600 border-t-1 pt-4">
        <button
          type="button"
          className="rounded-full bg-white px-3 py-2 font-bold text-brand text-sm transition-colors hover:bg-gray-50"
        >
          Donate Now
        </button>
      </div>
    </div>
  );
}
