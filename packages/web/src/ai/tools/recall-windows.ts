import { runWindowKnnRecall } from '@letschurch/opensearch';
import { tool } from 'ai';
import { z } from 'zod';

import { OutgoingIdSchema } from '@/schemas/common';
import { resolveChannelNames } from '@/trpc/search/channels';
import logger from '@/util/logger';
import { getQueryEmbeddingCached } from '@/util/query-embed';

import { sanitizeSourceText } from '../sanitize';

const moduleLogger = logger.child({ module: 'ai/tools/recall-windows' });

export const recallWindowsTool = tool({
  description:
    'Semantic RECALL for a keyword-free story or anecdote: retrieves coherent multi-paragraph passages ("windows") most similar in MEANING to your query, even when they share no keywords with it. Use when a remembered story does not surface via keyword search or ordinary searchMedia — e.g. a half-remembered anecdote where the memorable part is what happened, not any exact phrase. Returns contiguous passages with video + timestamp citations. This is more expensive than searchMedia; use it deliberately, not as a first resort.',
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        'A natural-language description of the story/anecdote/idea to recall. Describe what happens or is taught, in your own words — matching is by meaning, not keywords.',
      ),
    channelNames: z
      .array(z.string())
      .optional()
      .describe('Restrict to these ministries/churches (resolved by name).'),
  }),
  execute: async ({ query, channelNames }) => {
    const channelIds =
      channelNames && channelNames.length > 0
        ? (await resolveChannelNames(channelNames)).map((c) => c.id)
        : null;
    // A named channel that resolved to nothing public → no results, not a
    // library-wide search.
    if (channelIds && channelIds.length === 0) return { spans: [] };

    let queryVector: number[];
    try {
      queryVector = await getQueryEmbeddingCached(
        query,
        'agentRecallEmbedQuery',
      );
    } catch {
      moduleLogger.warn('Failed to embed recall query');
      return { spans: [] };
    }

    let recalled: Awaited<ReturnType<typeof runWindowKnnRecall>>;
    try {
      recalled = await runWindowKnnRecall({ queryVector, channelIds });
    } catch (err) {
      moduleLogger.warn(
        {
          context: { error: err instanceof Error ? err.message : String(err) },
        },
        'runWindowKnnRecall failed',
      );
      return { spans: [] };
    }

    const spans = recalled.flatMap((span) => {
      const parsedId = OutgoingIdSchema.safeParse(span.uploadId);
      if (!parsedId.success || span.paras.length === 0) return [];
      const uploadId = parsedId.data;
      const paras = [...span.paras].sort((a, b) => a.order - b.order);
      const startSeconds = Math.round(paras[0]!.start);
      const text = sanitizeSourceText(
        paras
          .map((p) => p.text.trim())
          .join(' ')
          .trim(),
      );
      if (!text) return [];
      return [
        {
          uploadId,
          cite: `[upload:${uploadId}@${startSeconds}]`,
          startSeconds,
          text,
        },
      ];
    });

    return { spans };
  },
});
