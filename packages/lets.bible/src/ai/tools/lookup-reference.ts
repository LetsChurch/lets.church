import { tool } from 'ai';
import { z } from 'zod';

import { bookBySlug } from '@/lib/canon';
import { parseReference } from '@/lib/reference';
import { lookupReferenceAcrossTranslations } from '@/search/search';

// Resolve a specific reference to its actual verse text in every translation —
// so a REMEMBERED reference can be confirmed or denied. "Is John 3:17 'for God
// so loved the world'?" → look it up and see it's not (that's 3:16). Requires a
// verse (a bare chapter has no single text to quote).
export const lookupReferenceTool = tool({
  description:
    'Look up the exact text of a specific verse reference (e.g. "John 3:16", "Romans 8:28") in every translation. Use to CONFIRM or DENY a reference the user remembered — a remembered reference is often wrong even when the wording is right. Returns null when the reference is malformed or has no verse.',
  inputSchema: z.object({
    reference: z
      .string()
      .min(3)
      .describe(
        'A Bible reference with a verse, e.g. "John 3:16", "1 Corinthians 13:4", "Rom 8:28".',
      ),
  }),
  execute: async ({ reference }) => {
    const parsed = parseReference(reference);
    if (!parsed || parsed.verse == null) {
      return {
        error: `"${reference}" is not a valid verse reference (need Book Chapter:Verse).`,
      };
    }
    const book = bookBySlug(parsed.book);
    const usfm = book?.code ?? parsed.book.toUpperCase();
    const ref = `${usfm}.${parsed.chapter}.${parsed.verse}`;
    const hits = await lookupReferenceAcrossTranslations({ ref });
    if (hits.length === 0) {
      return {
        reference: `${book?.name ?? parsed.book} ${parsed.chapter}:${parsed.verse}`,
        verses: [],
      };
    }
    return {
      reference: `${hits[0]!.name} ${hits[0]!.chapter}:${hits[0]!.verse}`,
      cite: `[${hits[0]!.name} ${hits[0]!.chapter}:${hits[0]!.verse}]`,
      verses: hits.map((h) => ({ translation: h.translationId, text: h.text })),
    };
  },
});
