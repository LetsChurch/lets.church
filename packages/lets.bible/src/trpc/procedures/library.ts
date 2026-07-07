import { TRPCError } from '@trpc/server';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import {
  bibleTranslation,
  bibleVerse,
  db,
  readingProgress,
  userHighlight,
  userNote,
} from '@/db';
import { bookBySlug, findBook } from '@/lib/canon';
import { HIGHLIGHT_COLORS } from '@/lib/highlight-colors';
import { resolvePreferences } from '@/server/preferences';

import type { Context } from '../context';
import { publicProcedure } from '../trpc';

// The user library (highlights, notes, reading position) is signed-in only,
// keyed by the OIDC subject. Anonymous visitors get empty reads and are blocked
// from writes.
function subOf(ctx: Context): string | undefined {
  const sub = ctx.session?.claims?.sub;
  return typeof sub === 'string' && sub ? sub : undefined;
}

function requireSub(ctx: Context): string {
  const sub = subOf(ctx);
  if (!sub) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Sign in to save.' });
  }
  return sub;
}

// Tables store the USFM book code; the reader speaks slugs.
function usfmOf(slug: string): string {
  return bookBySlug(slug)?.code ?? slug.toUpperCase();
}

const verseInput = z.object({
  book: z.string(), // slug
  chapter: z.number().int().positive(),
  verse: z.number().int().positive(),
});

async function resolveTranslationId(
  sub: string | undefined,
  req: Request,
): Promise<string> {
  const prefs = await resolvePreferences(sub, req);
  if (prefs.translation) {
    return prefs.translation;
  }
  const [row] = await db
    .select({ id: bibleTranslation.id })
    .from(bibleTranslation)
    .where(eq(bibleTranslation.isDefault, true))
    .limit(1);
  return row?.id ?? 'BSB';
}

// Attach display fields (slug, name) + verse text to a stored row keyed by USFM.
async function withVerseText<
  T extends { book: string; chapter: number; verse: number; ref: string },
>(sub: string | undefined, req: Request, rows: T[]) {
  const translationId = await resolveTranslationId(sub, req);
  const texts = new Map<string, string>();
  if (rows.length) {
    const vrows = await db
      .select({ ref: bibleVerse.ref, text: bibleVerse.text })
      .from(bibleVerse)
      .where(eq(bibleVerse.translationId, translationId));
    for (const v of vrows) {
      texts.set(v.ref, v.text);
    }
  }
  return rows.map((r) => {
    const canon = findBook(r.book);
    return {
      ...r,
      slug: canon?.slug ?? r.book.toLowerCase(),
      name: canon?.name ?? r.book,
      label: `${canon?.name ?? r.book} ${r.chapter}:${r.verse}`,
      text: texts.get(r.ref) ?? null,
    };
  });
}

export const libraryProcedures = {
  // Record that the reader viewed a chapter (no-op when anonymous).
  recordReading: publicProcedure
    .input(
      z.object({
        book: z.string(),
        chapter: z.number().int().positive(),
        verse: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ ok: boolean }> => {
      const sub = subOf(ctx);
      if (!sub) {
        return { ok: false };
      }
      const book = usfmOf(input.book);
      await db
        .insert(readingProgress)
        .values({
          sub,
          book,
          chapter: input.chapter,
          verse: input.verse ?? null,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            readingProgress.sub,
            readingProgress.book,
            readingProgress.chapter,
          ],
          set: { verse: input.verse ?? null, updatedAt: new Date() },
        });
      return { ok: true };
    }),

  // The most recently read chapter (for "Continue reading"). Null if none.
  continueReading: publicProcedure.query(async ({ ctx }) => {
    const sub = subOf(ctx);
    if (!sub) {
      return null;
    }
    const [row] = await db
      .select()
      .from(readingProgress)
      .where(eq(readingProgress.sub, sub))
      .orderBy(desc(readingProgress.updatedAt))
      .limit(1);
    if (!row) {
      return null;
    }
    const canon = findBook(row.book);
    return {
      slug: canon?.slug ?? row.book.toLowerCase(),
      name: canon?.name ?? row.book,
      chapter: row.chapter,
      verse: row.verse,
    };
  }),

  // The last N distinct chapters read (for "Recent" + library history).
  recent: publicProcedure
    .input(z.object({ limit: z.number().int().positive().max(50).default(6) }))
    .query(async ({ ctx, input }) => {
      const sub = subOf(ctx);
      if (!sub) {
        return [];
      }
      const rows = await db
        .select()
        .from(readingProgress)
        .where(eq(readingProgress.sub, sub))
        .orderBy(desc(readingProgress.updatedAt))
        .limit(input.limit);
      return rows.map((row) => {
        const canon = findBook(row.book);
        return {
          slug: canon?.slug ?? row.book.toLowerCase(),
          name: canon?.name ?? row.book,
          chapter: row.chapter,
          verse: row.verse,
          updatedAt: row.updatedAt,
        };
      });
    }),

  setHighlight: publicProcedure
    .input(verseInput.extend({ color: z.enum(HIGHLIGHT_COLORS) }))
    .mutation(async ({ ctx, input }) => {
      const sub = requireSub(ctx);
      const book = usfmOf(input.book);
      const ref = `${book}.${input.chapter}.${input.verse}`;
      await db
        .insert(userHighlight)
        .values({
          sub,
          book,
          chapter: input.chapter,
          verse: input.verse,
          ref,
          color: input.color,
        })
        .onConflictDoUpdate({
          target: [userHighlight.sub, userHighlight.ref],
          set: { color: input.color, updatedAt: new Date() },
        });
      return { ok: true };
    }),

  removeHighlight: publicProcedure
    .input(verseInput)
    .mutation(async ({ ctx, input }) => {
      const sub = requireSub(ctx);
      const ref = `${usfmOf(input.book)}.${input.chapter}.${input.verse}`;
      await db
        .delete(userHighlight)
        .where(and(eq(userHighlight.sub, sub), eq(userHighlight.ref, ref)));
      return { ok: true };
    }),

  setNote: publicProcedure
    .input(verseInput.extend({ body: z.string().min(1).max(10000) }))
    .mutation(async ({ ctx, input }) => {
      const sub = requireSub(ctx);
      const book = usfmOf(input.book);
      const ref = `${book}.${input.chapter}.${input.verse}`;
      await db
        .insert(userNote)
        .values({
          sub,
          book,
          chapter: input.chapter,
          verse: input.verse,
          ref,
          body: input.body,
        })
        .onConflictDoUpdate({
          target: [userNote.sub, userNote.ref],
          set: { body: input.body, updatedAt: new Date() },
        });
      return { ok: true };
    }),

  removeNote: publicProcedure
    .input(verseInput)
    .mutation(async ({ ctx, input }) => {
      const sub = requireSub(ctx);
      const ref = `${usfmOf(input.book)}.${input.chapter}.${input.verse}`;
      await db
        .delete(userNote)
        .where(and(eq(userNote.sub, sub), eq(userNote.ref, ref)));
      return { ok: true };
    }),

  // All highlights (newest first) with verse text — for the Library page.
  highlights: publicProcedure.query(async ({ ctx }) => {
    const sub = subOf(ctx);
    if (!sub) {
      return [];
    }
    const rows = await db
      .select({
        book: userHighlight.book,
        chapter: userHighlight.chapter,
        verse: userHighlight.verse,
        ref: userHighlight.ref,
        color: userHighlight.color,
        createdAt: userHighlight.createdAt,
      })
      .from(userHighlight)
      .where(eq(userHighlight.sub, sub))
      .orderBy(desc(userHighlight.createdAt));
    return withVerseText(sub, ctx.req, rows);
  }),

  // The signed-in user's marks for a SINGLE chapter — highlights (verse→color)
  // and notes (verse + body). This is the SSR source of truth for the reader:
  // the route loader prefetches it so a signed-in user's highlights/note markers
  // render in the server HTML (no client-side "flash-in", consistent across
  // devices). The local-first store overlays this for optimistic writes + offline
  // (see useChapterMarks). Anonymous visitors get empty marks (they fall back to
  // their local-only store).
  chapterMarks: publicProcedure
    .input(z.object({ book: z.string(), chapter: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const sub = subOf(ctx);
      const empty = {
        highlights: {} as Record<string, (typeof HIGHLIGHT_COLORS)[number]>,
        notes: [] as { verse: number; body: string }[],
      };
      if (!sub) {
        return empty;
      }
      const book = usfmOf(input.book);
      const [hls, nts] = await Promise.all([
        db
          .select({ verse: userHighlight.verse, color: userHighlight.color })
          .from(userHighlight)
          .where(
            and(
              eq(userHighlight.sub, sub),
              eq(userHighlight.book, book),
              eq(userHighlight.chapter, input.chapter),
            ),
          ),
        db
          .select({ verse: userNote.verse, body: userNote.body })
          .from(userNote)
          .where(
            and(
              eq(userNote.sub, sub),
              eq(userNote.book, book),
              eq(userNote.chapter, input.chapter),
            ),
          ),
      ]);
      const highlights: Record<string, (typeof HIGHLIGHT_COLORS)[number]> = {};
      for (const h of hls) {
        highlights[String(h.verse)] =
          h.color as (typeof HIGHLIGHT_COLORS)[number];
      }
      return {
        highlights,
        notes: nts.map((n) => ({ verse: n.verse, body: n.body })),
      };
    }),

  // All notes (newest first) with verse text — for the Library page.
  notes: publicProcedure.query(async ({ ctx }) => {
    const sub = subOf(ctx);
    if (!sub) {
      return [];
    }
    const rows = await db
      .select({
        book: userNote.book,
        chapter: userNote.chapter,
        verse: userNote.verse,
        ref: userNote.ref,
        body: userNote.body,
        updatedAt: userNote.updatedAt,
      })
      .from(userNote)
      .where(eq(userNote.sub, sub))
      .orderBy(desc(userNote.updatedAt));
    return withVerseText(sub, ctx.req, rows);
  }),
};
