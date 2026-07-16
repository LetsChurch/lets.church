import { tool } from 'ai';
import { z } from 'zod';

import { grepVersesAcrossTranslations } from '@/search/search';

// Exact/near-exact phrase lookup across ALL translations. Unlike semanticVerses
// this does NOT collapse by reference: which translation contains the remembered
// wording verbatim is the signal ("study to shew thyself approved" is the KJV;
// the BSB reads "make every effort…"). Use for a distinctive quoted phrase.
export const grepVerseTool = tool({
  description:
    'Find the EXACT (or near-exact) remembered wording of a verse across ALL translations. Returns each matching verse tagged with its translation, so you can tell the user which translation their remembered phrasing comes from. Use for a distinctive quoted phrase; if it returns nothing, the wording may be a misquote (or not in the Bible at all) — fall back to semanticVerses by meaning.',
  inputSchema: z.object({
    phrase: z
      .string()
      .min(4)
      .describe(
        'The distinctive remembered phrase, verbatim as the user recalls it. Keep it to the memorable core — shorter substrings tolerate wording drift across translations.',
      ),
  }),
  execute: async ({ phrase }) => {
    const hits = await grepVersesAcrossTranslations({ phrase, size: 12 });
    return {
      matches: hits.map((h) => ({
        cite: `[${h.name} ${h.chapter}:${h.verse}]`,
        reference: `${h.name} ${h.chapter}:${h.verse}`,
        translation: h.translationId,
        text: h.text,
      })),
    };
  },
});
