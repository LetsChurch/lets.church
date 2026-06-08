import { buildMediaLexicalRequest, osSearch } from '@letschurch/opensearch';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { OutgoingIdSchema } from '@/schemas/common';
import { resolveChannelNames } from '@/trpc/search/channels';
import { sanitizeSourceText } from '../sanitize';

const MatchSchema = z.object({
  uploadId: z.string(),
  // Ready-made citation token to copy verbatim into the answer.
  cite: z.string(),
  title: z.string().nullable(),
  channelName: z.string().nullable(),
  publishedAt: z.string().nullable(),
});

const SourceSchema = z
  .object({
    title: z.string().nullable().optional(),
    channelName: z.string().nullable().optional(),
    publishedAt: z.string().nullable().optional(),
  })
  .nullable();

// Shape of the BM25 lexical search response we read (osSearch returns the
// flattened response body; OpenSearch may report total as a number or object).
type LexicalResponse = {
  hits: {
    total: number | { value: number };
    hits: Array<{ _id?: string; _source?: unknown }>;
  };
};

function toMatch(
  hit: { _id?: string; _source?: unknown } | undefined,
): z.infer<typeof MatchSchema> | null {
  if (!hit?._id) return null;
  const parsedId = OutgoingIdSchema.safeParse(hit._id);
  if (!parsedId.success) return null;
  const uploadId = parsedId.data;
  const src = SourceSchema.parse(hit._source ?? null);
  return {
    uploadId,
    cite: `[upload:${uploadId}@0]`,
    title: src?.title ? sanitizeSourceText(src.title, 300) : null,
    channelName: src?.channelName
      ? sanitizeSourceText(src.channelName, 200)
      : null,
    publishedAt: src?.publishedAt ?? null,
  };
}

export const aggregateMediaTool = createTool({
  id: 'aggregateMedia',
  description:
    'Count how many videos match a topic and find the earliest and latest matches. Use for "how many times", "when was the first/last time someone preached on X", and similar quantitative/temporal questions. Lexical match over titles, descriptions, summaries, and transcripts. Speaker identity is not filterable — include any speaker name in the query text.',
  inputSchema: z.object({
    query: z
      .string()
      .describe('Topic / keywords / quote to count matches for.'),
    quotes: z
      .array(z.string())
      .optional()
      .describe('Exact phrases to match verbatim (phrase-boosted).'),
    channelNames: z.array(z.string()).optional(),
    dateGte: z.string().optional(),
    dateLte: z.string().optional(),
  }),
  outputSchema: z.object({
    count: z.number(),
    earliest: MatchSchema.nullable(),
    latest: MatchSchema.nullable(),
  }),
  execute: async ({ query, quotes, channelNames, dateGte, dateLte }) => {
    const channelIds =
      channelNames && channelNames.length > 0
        ? (await resolveChannelNames(channelNames)).map((c) => c.id)
        : null;
    const publishedAt =
      dateGte || dateLte
        ? {
            ...(dateGte ? { gte: dateGte } : {}),
            ...(dateLte ? { lte: dateLte } : {}),
          }
        : null;

    const source = ['title', 'channelName', 'publishedAt'];
    const [ascRes, descRes] = (await Promise.all([
      osSearch(
        buildMediaLexicalRequest({
          lexicalText: query,
          quotes: quotes ?? [],
          channelIds,
          publishedAt,
          size: 1,
          sort: [{ publishedAt: { order: 'asc' } }],
          source,
        }),
      ),
      osSearch(
        buildMediaLexicalRequest({
          lexicalText: query,
          quotes: quotes ?? [],
          channelIds,
          publishedAt,
          size: 1,
          sort: [{ publishedAt: { order: 'desc' } }],
          source,
        }),
      ),
    ])) as LexicalResponse[];

    const total = ascRes.hits.total;
    const count = typeof total === 'number' ? total : (total?.value ?? 0);

    const earliest = toMatch(ascRes.hits.hits[0]);
    const latest = toMatch(descRes.hits.hits[0]);

    return { count, earliest, latest };
  },
});
