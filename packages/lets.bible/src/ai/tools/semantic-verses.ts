import { tool } from 'ai';
import { z } from 'zod';

import { semanticVersesAcrossTranslations } from '@/search/search';

// The verse-finder's primary tool: a paraphrase or half-remembered gist is
// matched by MEANING against every translation's verse embeddings, so the real
// passage surfaces even when the user shares almost no exact words with it. See
// search/search.ts `semanticVersesAcrossTranslations`.
export const semanticVersesTool = tool({
  description:
    'Find Bible verses by MEANING across ALL translations, for a paraphrased or half-remembered verse. Describe the gist in your own words (or paste the remembered wording); returns the most semantically similar DISTINCT verses, each tagged with the translation that matched and a ready-made [Book Chapter:Verse] citation. This is the best tool when the user misremembers the wording — do not require exact words. Reference and translation are low-confidence; anchor on the meaning.',
  inputSchema: z.object({
    query: z
      .string()
      .min(3)
      .describe(
        'The remembered wording or a plain-language description of the verse (what it says / is about). Matching is by meaning, not keywords.',
      ),
  }),
  execute: async ({ query }) => {
    const hits = await semanticVersesAcrossTranslations({ q: query, size: 10 });
    return {
      verses: hits.map((h) => ({
        cite: `[${h.name} ${h.chapter}:${h.verse}]`,
        reference: `${h.name} ${h.chapter}:${h.verse}`,
        translation: h.translationId,
        text: h.text,
      })),
    };
  },
});
