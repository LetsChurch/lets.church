export function DonateCard() {
  return (
    <div className="border-fancy-pants bg-brand flex aspect-video flex-col gap-2 rounded-lg p-4">
      <h3 className="text-base font-bold text-white">
        Help share the good news
      </h3>
      <p className="text-xs leading-relaxed text-white">
        Let's Church will always remain free and without ads, sustained only by
        donations. Would you consider giving to keep our platform running?
      </p>
      <div className="mt-auto flex justify-end border-t-1 border-indigo-600 pt-4">
        <a
          href="https://givebutter.com/LetsChurch"
          className="text-brand rounded-full bg-white px-3 py-2 text-sm font-bold transition-colors hover:bg-gray-50"
          target="_blank"
          rel="noopener"
        >
          Donate Now
        </a>
      </div>
    </div>
  );
}
