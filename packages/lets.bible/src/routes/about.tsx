import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { PageShell } from '@/components/chrome';
import { passageLink } from '@/lib/reference';
import { useTRPC } from '@/trpc/react';

export const Route = createFileRoute('/about')({
  loader: async ({ context: { queryClient, trpc } }) => {
    await queryClient.ensureQueryData(trpc.bible.translations.queryOptions());
  },
  component: About,
});

// What you can actually do today — keep this honest (only shipped features).
const FEATURES: { title: string; body: string }[] = [
  {
    title: 'Read',
    body: 'A focused, ad-free reading page that keeps the Bible text front and center, with clean, comfortable typography and room to read without distraction.',
  },
  {
    title: 'Search',
    body: 'Jump straight to a reference, or search by phrase, topic, or idea — exact matches, cross-references, and related passages come back together, each labeled.',
  },
  {
    title: 'Study',
    body: 'Tap any verse for its cross-references, footnotes, and source-text notes, or open the interlinear to study the original-language words and their Strong’s definitions.',
  },
  {
    title: 'Keep',
    body: 'Highlight verses and write notes that save to your account — available on every device, and still there when you’re offline.',
  },
];

function About() {
  const trpc = useTRPC();
  const { data: translations } = useSuspenseQuery(
    trpc.bible.translations.queryOptions(),
  );
  return (
    <PageShell>
      <div className="mx-auto max-w-[680px] px-6 py-16 sm:py-24">
        <div className="font-bold text-[11px] text-gold-soft uppercase tracking-[0.12em]">
          About
        </div>
        <h1 className="mt-3 font-serif text-[40px] text-ink-strong leading-[1.1]">
          A focused place to read Scripture
        </h1>
        <p className="mt-4 max-w-[560px] text-[16px] text-muted leading-relaxed">
          lets.bible is a scripture-first reading and search experience where
          reading, searching, study, and cross-references feel like one
          continuous interface — focused, ad-free, and connected to lets.church.
        </p>

        <dl className="mt-10 grid gap-px overflow-hidden rounded-[14px] border border-line bg-line sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-paper-raised px-6 py-5">
              <dt className="font-bold text-[11px] text-gold uppercase tracking-[0.1em]">
                {f.title}
              </dt>
              <dd className="mt-2 text-[14.5px] text-muted leading-relaxed">
                {f.body}
              </dd>
            </div>
          ))}
        </dl>

        <h2 className="mt-12 font-bold text-[11px] text-gold-soft uppercase tracking-[0.12em]">
          Translations
        </h2>
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-[14px] border border-line">
          {translations.map((t) => (
            <li key={t.id} className="bg-paper-raised px-5 py-3.5">
              <div className="flex items-baseline gap-2">
                <span className="font-semibold text-[13px] text-ink">
                  {t.id}
                </span>
                <span className="text-[13px] text-muted-2">{t.name}</span>
              </div>
              {t.attribution ? (
                <p className="mt-1 text-[12px] text-faint">
                  {t.attributionUrl ? (
                    <a
                      href={t.attributionUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline decoration-line-strong underline-offset-2 hover:text-muted-2"
                    >
                      {t.attribution}
                    </a>
                  ) : (
                    t.attribution
                  )}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12px] text-faint leading-relaxed">
          Original-language interlinear data is from the STEPBible Tagged
          Greek/Hebrew (TAGNT/TAHOT), CC&nbsp;BY&nbsp;4.0.
        </p>

        <p className="mt-10 max-w-[560px] text-[15px] text-muted-2 leading-relaxed">
          Sign in with your lets.church account to sync your highlights and
          notes across devices. lets.bible is part of lets.church — a free,
          ad-free home for the church online.
        </p>

        <div className="mt-8">
          <Link
            {...passageLink('John 1')}
            className="inline-block rounded-[9px] bg-ink-strong px-4 py-[10px] font-semibold text-[14px] text-white dark:text-paper"
          >
            Start reading
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
