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
        <div className="text-gold-soft text-[11px] font-bold tracking-[0.12em] uppercase">
          About
        </div>
        <h1 className="text-ink-strong mt-3 font-serif text-[40px] leading-[1.1]">
          A focused place to read Scripture
        </h1>
        <p className="text-muted mt-4 max-w-[560px] text-[16px] leading-relaxed">
          lets.bible is a scripture-first reading and search experience where
          reading, searching, study, and cross-references feel like one
          continuous interface — focused, ad-free, and connected to lets.church.
        </p>

        <dl className="border-line bg-line mt-10 grid gap-px overflow-hidden rounded-[14px] border sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-paper-raised px-6 py-5">
              <dt className="text-gold text-[11px] font-bold tracking-[0.1em] uppercase">
                {f.title}
              </dt>
              <dd className="text-muted mt-2 text-[14.5px] leading-relaxed">
                {f.body}
              </dd>
            </div>
          ))}
        </dl>

        <h2 className="text-gold-soft mt-12 text-[11px] font-bold tracking-[0.12em] uppercase">
          Translations
        </h2>
        <ul className="divide-line border-line mt-4 divide-y overflow-hidden rounded-[14px] border">
          {translations.map((t) => (
            <li key={t.id} className="bg-paper-raised px-5 py-3.5">
              <div className="flex items-baseline gap-2">
                <span className="text-ink text-[13px] font-semibold">
                  {t.id}
                </span>
                <span className="text-muted-2 text-[13px]">{t.name}</span>
              </div>
              {t.attribution ? (
                <p className="text-faint mt-1 text-[12px]">
                  {t.attributionUrl ? (
                    <a
                      href={t.attributionUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="decoration-line-strong hover:text-muted-2 underline underline-offset-2"
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
        <p className="text-faint mt-3 text-[12px] leading-relaxed">
          Original-language interlinear data is from the STEPBible Tagged
          Greek/Hebrew (TAGNT/TAHOT), CC&nbsp;BY&nbsp;4.0.
        </p>

        <p className="text-muted-2 mt-10 max-w-[560px] text-[15px] leading-relaxed">
          Sign in with your lets.church account to sync your highlights and
          notes across devices. lets.bible is part of lets.church — a free,
          ad-free home for the church online.
        </p>

        <div className="mt-8">
          <Link
            {...passageLink('John 1')}
            className="bg-ink-strong dark:text-paper inline-block rounded-[9px] px-4 py-[10px] text-[14px] font-semibold text-white"
          >
            Start reading
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
