import { Link } from '@tanstack/react-router';

export function DonateCard() {
  return (
    <div className="border-fancy-pants bg-brand flex aspect-video flex-col gap-2 rounded-lg p-4">
      <h3 className="text-base font-bold text-white">
        Keep Let&apos;s Church free
      </h3>
      <p className="text-xs leading-relaxed text-white">
        Donations pay for media storage, servers, and free tools for churches.
      </p>
      <div className="mt-auto flex justify-end border-t-1 border-indigo-600 pt-4">
        <Link
          to="/donate"
          className="text-brand rounded-full bg-white px-3 py-2 text-sm font-bold transition-colors hover:bg-gray-50"
        >
          Donate
        </Link>
      </div>
    </div>
  );
}
