import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import {
  AuthActions,
  Footer,
  HomeLogoLink,
  useAuth,
} from '@/components/chrome';
import { LiveSearchBox } from '@/components/live-search-box';
import { Logo } from '@/components/logo';
import { passageLink } from '@/lib/reference';
import { useContinueReading, useRecent } from '@/local/store';
import { useTRPC } from '@/trpc/react';

export const Route = createFileRoute('/')({
  loader: async ({ context: { queryClient, trpc } }) => {
    await Promise.all([
      queryClient.ensureQueryData(trpc.common.hasValidSession.queryOptions()),
      queryClient.ensureQueryData(trpc.common.me.queryOptions()),
      queryClient.ensureQueryData(trpc.home.verseOfTheDay.queryOptions()),
      queryClient.ensureQueryData(trpc.home.searchSuggestions.queryOptions()),
      queryClient.ensureQueryData(trpc.home.greeting.queryOptions()),
    ]);
  },
  component: Home,
});

function Home() {
  const trpc = useTRPC();
  const { data: signedIn } = useSuspenseQuery(
    trpc.common.hasValidSession.queryOptions(),
  );
  return signedIn ? <ReturningHome /> : <SignedOutHome />;
}

function VerseOfTheDay({ compact = false }: { compact?: boolean }) {
  const trpc = useTRPC();
  const { data: verse } = useSuspenseQuery(
    trpc.home.verseOfTheDay.queryOptions(),
  );
  return (
    <div>
      <div className="text-gold-soft mb-[14px] text-[11px] font-bold tracking-[0.12em] uppercase">
        Verse of the day
      </div>
      <p
        className={`text-ink-strong mx-auto max-w-[520px] font-serif leading-[1.55] ${
          compact ? 'text-[19px]' : 'text-2xl'
        }`}
      >
        {verse.text}
      </p>
      <div className="text-muted-2 mt-3 text-[13.5px]">
        <Link {...passageLink(verse.reference)} className="hover:text-gold">
          {verse.reference}
        </Link>{' '}
        · {verse.translation}
      </div>
    </div>
  );
}

function HomeSearch({ size }: { size: 'lg' | 'md' }) {
  return <LiveSearchBox size={size} />;
}

function SignedOutHome() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-line/70 bg-paper/80 sticky top-0 z-30 flex h-[62px] flex-shrink-0 items-center gap-[18px] border-b px-4 backdrop-blur-sm sm:px-7">
        <span className="flex-1" />
        <AuthActions />
      </header>

      <div className="animate-fade flex flex-1 flex-col items-center justify-center px-6 pt-5 pb-16">
        <div className="w-full max-w-[620px] text-center">
          <Logo className="text-ink-strong mx-auto mb-8 block h-11 sm:h-[58px]" />

          <HomeSearch size="lg" />

          <div className="border-line mt-12 border-t pt-[34px]">
            <VerseOfTheDay />
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}

// Relative day label for reading history.
function relativeDay(date: Date): string {
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'Last week';
  return `${Math.floor(days / 7)} weeks ago`;
}

function ContinueCard() {
  const cont = useContinueReading();
  // Nothing read yet → invite the reader in.
  const target = cont ?? {
    slug: 'john',
    name: 'John',
    chapter: 1,
    verse: null,
  };
  return (
    <div className="border-line bg-paper-raised relative min-w-[300px] flex-[1.4] overflow-hidden rounded-[15px] border px-6 py-[22px] shadow-[0_18px_40px_-28px_rgba(120,96,40,0.3)]">
      <span className="bg-gold absolute top-0 bottom-0 left-0 w-1" />
      <div className="text-gold text-[11px] font-bold tracking-[0.1em] uppercase">
        {cont ? 'Continue reading' : 'Start reading'}
      </div>
      <div className="text-ink-strong my-1 font-serif text-[25px]">
        {target.name} {target.chapter}
      </div>
      <p className="text-muted mb-4 font-serif text-[15px] leading-relaxed">
        {cont ? 'Pick up where you left off.' : 'Begin in the Gospel of John.'}
      </p>
      <Link
        to="/bible/$book/$chapter"
        params={{ book: target.slug, chapter: String(target.chapter) }}
        search={target.verse != null ? { v: target.verse } : {}}
        className="bg-ink-strong dark:text-paper rounded-[9px] px-4 py-[9px] text-[13.5px] font-semibold text-white"
      >
        {cont
          ? target.verse != null
            ? `Resume · v.${target.verse}`
            : 'Resume'
          : 'Open'}
      </Link>
    </div>
  );
}

function RecentList() {
  const recent = useRecent(6);
  if (recent.length === 0) {
    return (
      <p className="border-line text-faint border-t py-[11px] text-[13.5px]">
        Chapters you read will appear here.
      </p>
    );
  }
  return (
    <>
      {recent.map((r) => (
        <Link
          key={`${r.slug}-${r.chapter}`}
          to="/bible/$book/$chapter"
          params={{ book: r.slug, chapter: String(r.chapter) }}
          search={r.verse != null ? { v: r.verse } : {}}
          className="border-line hover:text-gold flex items-center justify-between border-t py-[11px]"
        >
          <span className="text-ink-strong font-serif text-[16px]">
            {r.name} {r.chapter}
          </span>
          <span className="text-faint-2 text-[12px]">
            {relativeDay(new Date(r.updatedAt))}
          </span>
        </Link>
      ))}
    </>
  );
}

function PlanCard() {
  return (
    <div className="border-line bg-paper-soft relative min-w-[240px] flex-1 overflow-hidden rounded-[15px] border px-6 py-[22px]">
      <span className="bg-slate absolute top-0 bottom-0 left-0 w-1" />
      <div className="text-slate text-[11px] font-bold tracking-[0.1em] uppercase">
        Today’s plan
      </div>
      <div className="text-ink-strong mt-[7px] mb-[3px] font-serif text-[20px]">
        Advent · Day 9
      </div>
      <div className="text-muted mb-[14px] text-[13.5px]">
        Isaiah 9:6 — “A Child Is Born”
      </div>
      <Link
        {...passageLink('Isaiah 9:6')}
        className="text-gold text-[13.5px] font-semibold"
      >
        Read today →
      </Link>
    </div>
  );
}

function ReturningHome() {
  const trpc = useTRPC();
  const { me } = useAuth();
  // `||` (not `??`) + trim so empty/whitespace names fall through to the
  // next fallback instead of rendering "Good morning, .".
  const firstName = (
    me?.name?.trim() ||
    me?.preferredUsername?.trim() ||
    'friend'
  ).split(/\s+/)[0];
  // The greeting is time-of-day in the visitor's timezone. The server computes
  // it from a `tz` cookie (so SSR is correct on repeat visits, no flash); the
  // query value seeds state, so SSR and hydration always match. After mount we
  // persist the timezone for next time and correct the current page (first
  // visit, before the cookie existed).
  const { data: greetingData } = useSuspenseQuery(
    trpc.home.greeting.queryOptions(),
  );
  const [greeting, setGreeting] = useState(greetingData.greeting);
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) {
      // NOTE (was noDocumentCookie): CookieStore API isn't supported in Safari; a plain cookie write is the cross-browser choice
      document.cookie = `tz=${tz}; path=/; max-age=31536000; samesite=lax`;
    }
    const hr = new Date().getHours();
    setGreeting(
      hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening',
    );
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-line/70 bg-paper/80 sticky top-0 z-30 flex h-[62px] flex-shrink-0 items-center gap-3 border-b px-4 backdrop-blur-sm sm:gap-5 sm:px-7">
        <HomeLogoLink />
        <span className="flex-1" />
        <Link
          {...passageLink('John 1')}
          className="text-ink text-sm font-semibold"
        >
          Bible
        </Link>
        <Link to="/library" className="text-muted-2 text-sm font-medium">
          Library
        </Link>
        <Link
          to="/listen"
          className="text-muted-2 hidden text-sm font-medium sm:inline-block"
        >
          Listen
        </Link>
        <AuthActions />
      </header>

      <div className="animate-fade flex-1 px-6 pt-[14px] pb-16">
        <div className="mx-auto max-w-[760px]">
          <div className="text-ink-strong font-serif text-[24px] sm:text-[30px]">
            {greeting}, {firstName}.
          </div>
          <p className="text-muted mt-1 mb-[22px] text-[14.5px]">
            Pick up where you left off, or search for anything.
          </p>

          <div className="mb-[30px]">
            <HomeSearch size="md" />
          </div>

          <div className="mb-7 flex flex-wrap gap-4">
            <ContinueCard />
            <PlanCard />
          </div>

          <div className="flex flex-wrap gap-4">
            <div className="min-w-[280px] flex-1">
              <div className="text-faint mb-[6px] text-[11px] font-bold tracking-[0.1em] uppercase">
                Recent
              </div>
              <RecentList />
            </div>
            <div className="border-line min-w-[280px] flex-1 border-t pt-4">
              <VerseOfTheDay compact />
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
