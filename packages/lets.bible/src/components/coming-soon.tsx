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
      <div className="font-bold text-[11px] text-gold-soft uppercase tracking-[0.12em]">
        {eyebrow}
      </div>
      <h1 className="mt-3 font-serif text-[40px] text-ink-strong leading-[1.1]">
        {title}
      </h1>
      <p className="mt-4 max-w-[520px] text-[16px] text-muted leading-relaxed">
        {blurb}
      </p>
      <div className="mt-8 rounded-[14px] border border-line bg-paper-raised px-6 py-5 text-[14px] text-muted-2">
        This part of lets.bible is still being built. Check back soon.
      </div>
      <Link
        to="/"
        className="mt-6 inline-block font-semibold text-[14px] text-gold"
      >
        ← Back home
      </Link>
    </div>
  );
}
