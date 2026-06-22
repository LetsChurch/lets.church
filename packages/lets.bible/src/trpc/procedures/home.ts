import { z } from 'zod';
import { parseCookies } from '@/server/oidc';
import { publicProcedure } from '../trpc';

// Placeholder content for the demo (BSB text). In the real app these come from
// the content service (verse data, search index). For now they prove the
// tRPC/Query stack end-to-end from the homepage.
const VERSES = [
  { text: '“Be still and know that I am God.”', reference: 'Psalm 46:10' },
  {
    text: '“The LORD is my shepherd; I shall not want.”',
    reference: 'Psalm 23:1',
  },
  {
    text: '“In the beginning was the Word, and the Word was with God, and the Word was God.”',
    reference: 'John 1:1',
  },
  {
    text: '“I can do all things through Christ who gives me strength.”',
    reference: 'Philippians 4:13',
  },
  {
    text: '“Trust in the LORD with all your heart and lean not on your own understanding.”',
    reference: 'Proverbs 3:5',
  },
  {
    text: '“Your word is a lamp to my feet and a light to my path.”',
    reference: 'Psalm 119:105',
  },
];

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
  verseOfTheDay: publicProcedure.query(() => {
    const now = new Date();
    const dayOfYear = Math.floor(
      (Date.now() - Date.UTC(now.getUTCFullYear(), 0, 0)) / 86_400_000,
    );
    const verse = VERSES[dayOfYear % VERSES.length] ?? VERSES[0];
    return { ...verse, translation: 'BSB' };
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
