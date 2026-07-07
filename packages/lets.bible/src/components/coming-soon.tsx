import { Link } from '@tanstack/react-router';

// A themed placeholder panel for routes that aren't built yet. Kept free of tRPC
// imports so it (and its story) renders in isolation.
export function ComingSoon({
  eyebrow,
  title,
  blurb,
}: {
  eyebrow: string;
  title: string;
  blurb: string;
}) {
  return (
    <div className="mx-auto max-w-[680px] px-6 py-16 sm:py-24">
      <div className="text-gold-soft text-[11px] font-bold tracking-[0.12em] uppercase">
        {eyebrow}
      </div>
      <h1 className="text-ink-strong mt-3 font-serif text-[40px] leading-[1.1]">
        {title}
      </h1>
      <p className="text-muted mt-4 max-w-[520px] text-[16px] leading-relaxed">
        {blurb}
      </p>
      <div className="border-line bg-paper-raised text-muted-2 mt-8 rounded-[14px] border px-6 py-5 text-[14px]">
        This part of lets.bible is still being built. Check back soon.
      </div>
      <Link
        to="/"
        className="text-gold mt-6 inline-block text-[14px] font-semibold"
      >
        ← Back home
      </Link>
    </div>
  );
}
