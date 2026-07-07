// Reading preferences: stored per-user in the DB (by OIDC sub) for signed-in
// visitors, and in an `lb-prefs` cookie for everyone (so anonymous users get
// prefs and SSR can read them without a round-trip). Null translation means
// "no preference — use the default translation".

import { eq } from 'drizzle-orm';

import { db, userPreference } from '@/db';

import { parseCookies } from './oidc';

// How the divine name (YHWH) is rendered in the reading: the traditional
// small-caps "LORD", the Tetragrammaton "YHWH", or "Yahweh".
export type DivineName = 'lord' | 'yhwh' | 'yahweh';
const DIVINE_NAMES: readonly DivineName[] = ['lord', 'yhwh', 'yahweh'];

export type Preferences = {
  translation: string | null;
  redLetter: boolean;
  verseNumbers: boolean;
  textSize: number; // reading font size in px
  divineName: DivineName;
  sourceOverlay: boolean; // dotted-underline + tooltip source-text hints
};

export const DEFAULT_PREFERENCES: Preferences = {
  translation: null,
  redLetter: true,
  verseNumbers: true,
  textSize: 21,
  divineName: 'lord',
  sourceOverlay: true,
};

function asDivineName(v: unknown): DivineName | undefined {
  return typeof v === 'string' && (DIVINE_NAMES as string[]).includes(v)
    ? (v as DivineName)
    : undefined;
}

export const TEXT_SIZE_MIN = 16;
export const TEXT_SIZE_MAX: number = 32;

function clampTextSize(n: number): number {
  return Math.min(TEXT_SIZE_MAX, Math.max(TEXT_SIZE_MIN, Math.round(n)));
}

const COOKIE = 'lb-prefs';

function readCookie(req: Request): Partial<Preferences> {
  const raw = parseCookies(req.headers.get('cookie'))[COOKIE];
  if (!raw) {
    return {};
  }
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    return {
      translation: typeof o.translation === 'string' ? o.translation : null,
      redLetter: typeof o.redLetter === 'boolean' ? o.redLetter : undefined,
      verseNumbers:
        typeof o.verseNumbers === 'boolean' ? o.verseNumbers : undefined,
      textSize:
        typeof o.textSize === 'number' ? clampTextSize(o.textSize) : undefined,
      divineName: asDivineName(o.divineName),
      sourceOverlay:
        typeof o.sourceOverlay === 'boolean' ? o.sourceOverlay : undefined,
    };
  } catch {
    return {};
  }
}

// The effective preferences: DB row (signed-in) wins, else cookie, else default.
export async function resolvePreferences(
  sub: string | undefined,
  req: Request,
): Promise<Preferences> {
  if (sub) {
    const [row] = await db
      .select()
      .from(userPreference)
      .where(eq(userPreference.sub, sub))
      .limit(1);
    if (row) {
      return {
        translation: row.translation,
        redLetter: row.redLetter ?? DEFAULT_PREFERENCES.redLetter,
        verseNumbers: row.verseNumbers ?? DEFAULT_PREFERENCES.verseNumbers,
        textSize:
          row.textSize != null
            ? clampTextSize(row.textSize)
            : DEFAULT_PREFERENCES.textSize,
        divineName:
          asDivineName(row.divineName) ?? DEFAULT_PREFERENCES.divineName,
        sourceOverlay: row.sourceOverlay ?? DEFAULT_PREFERENCES.sourceOverlay,
      };
    }
  }
  const cookie = readCookie(req);
  return {
    translation: cookie.translation ?? DEFAULT_PREFERENCES.translation,
    redLetter: cookie.redLetter ?? DEFAULT_PREFERENCES.redLetter,
    verseNumbers: cookie.verseNumbers ?? DEFAULT_PREFERENCES.verseNumbers,
    textSize: cookie.textSize ?? DEFAULT_PREFERENCES.textSize,
    divineName: cookie.divineName ?? DEFAULT_PREFERENCES.divineName,
    sourceOverlay: cookie.sourceOverlay ?? DEFAULT_PREFERENCES.sourceOverlay,
  };
}

// Persist preferences: upsert the DB row when signed in, and always (re)set the
// cookie so SSR + anonymous users stay in sync.
export async function writePreferences(
  sub: string | undefined,
  prefs: Preferences,
): Promise<string> {
  const row = {
    translation: prefs.translation,
    redLetter: prefs.redLetter,
    verseNumbers: prefs.verseNumbers,
    textSize: prefs.textSize,
    divineName: prefs.divineName,
    sourceOverlay: prefs.sourceOverlay,
  };
  if (sub) {
    await db
      .insert(userPreference)
      .values({ sub, ...row })
      .onConflictDoUpdate({
        target: userPreference.sub,
        set: { ...row, updatedAt: new Date() },
      });
  }
  const value = encodeURIComponent(JSON.stringify(prefs));
  // Add `secure` in production (HTTPS) so prefs — which reveal reading habits —
  // aren't sent over plain HTTP. Dev runs on http://localhost, so gate it.
  const secure = process.env.NODE_ENV === 'production' ? '; secure' : '';
  return `${COOKIE}=${value}; path=/; max-age=31536000; samesite=lax${secure}`;
}
