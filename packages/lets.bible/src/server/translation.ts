// Shared translation resolution, used by multiple tRPC procedures (bible, home).
// Lives here (not in a procedure module) so procedures can reuse it without
// importing each other — cross-importing procedure modules creates an SSR
// circular dependency that leaves the named export undefined at call time.

import { eq } from 'drizzle-orm';
import { bibleTranslation, db } from '@/db';
import { resolvePreferences } from '@/server/preferences';
import type { Context } from '@/trpc/context';

// The translation used when a request doesn't specify one: the row flagged
// `isDefault`, falling back to 'BSB'. Resolved per call (translations rarely
// change and the query is tiny).
export async function defaultTranslationId(): Promise<string> {
  const rows = await db
    .select({ id: bibleTranslation.id })
    .from(bibleTranslation)
    .where(eq(bibleTranslation.isDefault, true))
    .limit(1);
  return rows[0]?.id ?? 'BSB';
}

// The translation to use when a request doesn't specify one: the visitor's
// preference, else the default-flagged translation.
export async function resolveTranslation(
  ctx: Context,
  explicit: string | undefined,
): Promise<string> {
  if (explicit) {
    return explicit;
  }
  const sub =
    typeof ctx.session?.claims?.sub === 'string'
      ? ctx.session.claims.sub
      : undefined;
  const prefs = await resolvePreferences(sub, ctx.req);
  return prefs.translation ?? (await defaultTranslationId());
}
