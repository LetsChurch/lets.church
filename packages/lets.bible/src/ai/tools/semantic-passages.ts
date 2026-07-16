import { tool } from 'ai';
import { z } from 'zod';

import { semanticPassagesAcrossTranslations } from '@/search/search';

// The verse-finder's SPANNING-THOUGHT lane. Verse divisions routinely split a
// single thought (the fruit of the Spirit is Galatians 5:22-23; Romans 8:28's
// thought completes at 8:29-30), so a paraphrase of a thought often matches no
// single verse's wording — but it matches the translator's PARAGRAPH, which we
// embed whole. Returns the matching multi-verse passages (across all
// translations) with their verse range and text; cite the specific anchor verse.
export const semanticPassagesTool = tool({
  description:
    'Find multi-verse PASSAGES (whole translator paragraphs) by MEANING across all translations — for a paraphrase of a THOUGHT that spans several verses and may match no single verse verbatim ("faith without works is dead", "nothing can separate us from the love of God", "the fruit of the Spirit"). Complements semanticVerses (single-verse recall): use it when the remembered idea is an argument or a list that runs across verses. Each result gives the verse range and the paragraph text; cite the specific anchor verse inside it, e.g. [Galatians 5:22].',
  inputSchema: z.object({
    query: z
      .string()
      .min(3)
      .describe(
        'The remembered thought/idea in your own words (or the remembered wording). Matching is by meaning over whole paragraphs.',
      ),
  }),
  execute: async ({ query }) => {
    const hits = await semanticPassagesAcrossTranslations({
      q: query,
      size: 6,
    });
    return {
      passages: hits.map((h) => ({
        reference: `${h.name} ${h.chapter}:${h.startVerse}-${h.endVerse}`,
        // The paragraph's first verse — a safe anchor to cite; the model may cite
        // a more specific verse within the passage instead.
        anchorCite: `[${h.name} ${h.chapter}:${h.startVerse}]`,
        translation: h.translationId,
        text: h.text,
      })),
    };
  },
});
