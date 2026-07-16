import { tool } from 'ai';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import { bibleCrossReference, bibleVerse, db } from '@/db';
import { bookBySlug } from '@/lib/canon';
import { parseReference } from '@/lib/reference';
import { defaultTranslationId } from '@/server/translation';

// Expand a verse's cross-references (from the curated `bible_cross_reference`
// table) into their target verse texts — for topical breadth and confirmation
// ("that theme also runs through …"). Cross-references are effectively
// translation-independent; we resolve target texts in the default translation.
export const crossRefsTool = tool({
  description:
    'Given a verse reference (e.g. "Romans 8:28"), return its cross-referenced verses with their text. Use to broaden a topical answer with related passages, or to confirm a verse fits a theme. Returns an empty list when the reference is malformed or has no cross-references.',
  inputSchema: z.object({
    reference: z
      .string()
      .min(3)
      .describe('A verse reference, e.g. "John 3:16", "Genesis 50:20".'),
  }),
  execute: async ({ reference }) => {
    const parsed = parseReference(reference);
    if (!parsed || parsed.verse == null) {
      return { crossReferences: [] };
    }
    const translationId = await defaultTranslationId();
    const fromBook = bookBySlug(parsed.book)?.code ?? parsed.book.toUpperCase();

    const rows = await db
      .select({
        toBook: bibleCrossReference.toBook,
        toChapter: bibleCrossReference.toChapter,
        toVerse: bibleCrossReference.toVerse,
      })
      .from(bibleCrossReference)
      .where(
        and(
          eq(bibleCrossReference.translationId, translationId),
          eq(bibleCrossReference.fromBook, fromBook),
          eq(bibleCrossReference.fromChapter, parsed.chapter),
          eq(bibleCrossReference.fromVerse, parsed.verse),
        ),
      )
      .limit(12);

    const targets = rows.filter((r) => r.toVerse != null);
    // Resolve the target verse texts in one query (`toBook` is a canon slug).
    const refs = targets.map(
      (r) =>
        `${bookBySlug(r.toBook)?.code ?? r.toBook.toUpperCase()}.${r.toChapter}.${r.toVerse}`,
    );
    const texts = new Map<string, string>();
    if (refs.length > 0) {
      const vrows = await db
        .select({ ref: bibleVerse.ref, text: bibleVerse.text })
        .from(bibleVerse)
        .where(
          and(
            eq(bibleVerse.translationId, translationId),
            inArray(bibleVerse.ref, refs),
          ),
        );
      for (const v of vrows) {
        texts.set(v.ref, v.text);
      }
    }

    const seen = new Set<string>();
    const crossReferences = targets.flatMap((r) => {
      const book = bookBySlug(r.toBook);
      const name = book?.name ?? r.toBook;
      const label = `${name} ${r.toChapter}:${r.toVerse}`;
      if (seen.has(label)) {
        return [];
      }
      seen.add(label);
      const ref = `${book?.code ?? r.toBook.toUpperCase()}.${r.toChapter}.${r.toVerse}`;
      return [
        {
          cite: `[${label}]`,
          reference: label,
          translation: translationId,
          text: texts.get(ref) ?? null,
        },
      ];
    });

    return { crossReferences };
  },
});
