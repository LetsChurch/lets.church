import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { bibleVerse, db } from '@/db';
import { findBook } from '@/lib/canon';
import { epochDay, VOTD_REFS, votdRefForDay } from '@/lib/votd';
import { parseCookies } from '@/server/oidc';
import { resolveTranslation } from '@/server/translation';
import { publicProcedure } from '../trpc';

// Turn a canonical ref ('JHN.3.16') into a human reference label ('John 3:16')
// that `passageLink` can parse back into a reader link.
function refLabel(ref: string): string {
  const [code, chapter, verse] = ref.split('.');
  const book = findBook(code ?? '');
  return `${book?.name ?? code} ${chapter}:${verse}`;
}

// The verse of the day: a curated ref (see lib/votd.ts) resolved to the visitor's
// translation. We walk the curated list with a coprime stride so every verse is
// shown once per full cycle before repeating (fair coverage), keyed by UTC day so
// it's stable for the whole day and identical in SSR + client. If the chosen ref
// is missing in the active translation (rare versification gap), we step forward
// to the next ref that exists rather than failing.
async function pickVerseOfTheDay(translationId: string, now: number) {
  const day = epochDay(now);
  for (let i = 0; i < VOTD_REFS.length; i++) {
    const ref = votdRefForDay(day + i);
    const [row] = await db
      .select({ text: bibleVerse.text })
      .from(bibleVerse)
      .where(
        and(
          eq(bibleVerse.translationId, translationId),
          eq(bibleVerse.ref, ref),
        ),
      )
      .limit(1);
    if (row) {
      return {
        text: row.text,
        reference: refLabel(ref),
        translation: translationId,
      };
    }
  }
  return null;
}

// Time-of-day greeting computed in the visitor's timezone. The browser can't be
// asked for its zone via a header (no Client Hint for it), so the client stores
// it in a `tz` cookie; here we read that cookie and compute server-side, keeping
// the greeting correct in SSR. Falls back to a neutral greeting with no cookie.
function greetingForTimeZone(tz: string | undefined): string {
  if (!tz) {
    return 'Welcome back';
  }
  let hour: number;
  try {
    hour = Number(
      new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour: 'numeric',
        hour12: false,
      }).format(new Date()),
    );
  } catch {
    return 'Welcome back';
  }
  if (Number.isNaN(hour)) {
    return 'Welcome back';
  }
  if (hour >= 24) {
    hour = 0;
  }
  return hour < 12
    ? 'Good morning'
    : hour < 18
      ? 'Good afternoon'
      : 'Good evening';
}

const SUGGESTIONS = [
  { icon: '↵', label: 'John 3:16', meta: 'reference' },
  { icon: '↵', label: 'Philippians 4', meta: 'chapter' },
  { icon: '“”', label: 'do not be anxious', meta: 'exact phrase · 6 verses' },
  { icon: '#', label: 'Anxiety & worry', meta: 'topic' },
  { icon: '“”', label: 'the steadfast love of the Lord', meta: 'exact phrase' },
  { icon: '#', label: 'fruit of the Spirit', meta: 'topic' },
  { icon: '↺', label: 'Psalm 23', meta: 'recent' },
];

const CHIPS = [
  'the steadfast love of the Lord',
  'John 3:16',
  'fruit of the Spirit',
  'do not be anxious',
];

export const homeProcedures = {
  verseOfTheDay: publicProcedure.query(async ({ ctx }) => {
    const translationId = await resolveTranslation(ctx, undefined);
    const verse = await pickVerseOfTheDay(translationId, Date.now());
    // Fallback to the default translation if the visitor's preference has a gap.
    return (
      verse ??
      (await pickVerseOfTheDay('BSB', Date.now())) ?? {
        text: 'For God so loved the world…',
        reference: 'John 3:16',
        translation: 'BSB',
      }
    );
  }),

  // Greeting in the visitor's local time (via the `tz` cookie) so SSR matches.
  greeting: publicProcedure.query(({ ctx }) => {
    const cookies = parseCookies(ctx.req.headers.get('cookie'));
    return { greeting: greetingForTimeZone(cookies.tz) };
  }),

  searchSuggestions: publicProcedure
    .input(z.object({ q: z.string() }).optional())
    .query(({ input }) => {
      const q = (input?.q ?? '').trim().toLowerCase();
      const filtered = q
        ? SUGGESTIONS.filter((s) => s.label.toLowerCase().includes(q))
        : SUGGESTIONS;
      return {
        suggestions: (filtered.length ? filtered : SUGGESTIONS).slice(0, 5),
        chips: CHIPS,
      };
    }),
};
