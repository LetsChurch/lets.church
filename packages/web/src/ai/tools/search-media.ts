import { db, TranscriptParagraph } from '@letschurch/db';
import {
  type MediaSegment,
  mergeParagraphSnippets,
  runMediaHybridSearch,
} from '@letschurch/opensearch';
import {
  createEmbeddingsTracked,
  EMBED_MODEL,
} from '@letschurch/temporal/util/llm';
import { createTool } from '@mastra/core/tools';
import { and, eq, gte, lte, or } from 'drizzle-orm';
import { z } from 'zod';
import { OutgoingIdSchema } from '@/schemas/common';
import { resolveChannelNames } from '@/trpc/search/channels';
import logger from '@/util/logger';
import { sanitizeSourceText } from '../sanitize';

const moduleLogger = logger.child({ module: 'ai/tools/search-media' });

// Paragraphs of surrounding context to include on each side of a match. The
// matched paragraph alone often lacks the setup/conclusion the answer needs.
const CONTEXT_WINDOW = 1;

type Row = {
  uploadRecordId: string;
  order: number;
  start: number;
  text: string;
};

// Merge contiguous paragraphs (by order) into a single context block, keeping
// the earliest start (seconds) as the citation timestamp.
function buildBlocks(
  rows: Row[],
): Array<{ startSeconds: number; text: string }> {
  const seen = new Set<number>();
  const uniq: Row[] = [];
  for (const r of rows) {
    if (seen.has(r.order)) continue;
    seen.add(r.order);
    uniq.push(r);
  }
  uniq.sort((a, b) => a.order - b.order);

  const blocks: Array<{ startSeconds: number; text: string }> = [];
  let cur: { startSeconds: number; text: string; lastOrder: number } | null =
    null;
  for (const r of uniq) {
    if (cur && r.order === cur.lastOrder + 1) {
      cur.text += ` ${r.text}`;
      cur.lastOrder = r.order;
    } else {
      if (cur) blocks.push({ startSeconds: cur.startSeconds, text: cur.text });
      cur = {
        startSeconds: Math.round(r.start),
        text: r.text,
        lastOrder: r.order,
      };
    }
  }
  if (cur) blocks.push({ startSeconds: cur.startSeconds, text: cur.text });
  // Sanitize each (untrusted) passage: strip hidden chars and cap length so a
  // malicious transcript can't smuggle directives or flood the agent context.
  return blocks.map((b) => ({
    startSeconds: b.startSeconds,
    text: sanitizeSourceText(b.text),
  }));
}

export type AgentMediaSearchInput = {
  query: string;
  /** Verbatim phrases to phrase-match (match_phrase boost), e.g. an exact quote. */
  quotes?: string[];
  channelNames?: string[];
  dateGte?: string;
  dateLte?: string;
  limit?: number;
};

export type AgentMediaSearchResult = {
  uploadId: string;
  title: string | null;
  channelName: string | null;
  publishedAt: string | null;
  context: Array<{ cite: string; startSeconds: number; text: string }>;
};

/**
 * Core hybrid retrieval used by both the agent tool (below) and the answer
 * route's pre-retrieval. Returns the built results plus the `queryVector` so the
 * caller can reuse the (already-logged) embedding for a relevance probe instead
 * of embedding the query twice.
 */
export async function runAgentMediaSearch({
  query,
  quotes,
  channelNames,
  dateGte,
  dateLte,
  limit = 8,
}: AgentMediaSearchInput): Promise<{
  results: AgentMediaSearchResult[];
  total: number;
  queryVector: number[] | null;
}> {
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

  const embed = await createEmbeddingsTracked({
    model: EMBED_MODEL,
    input: query,
    tracking: { activity: 'agentSearchEmbedQuery' },
  });
  const queryVector = embed.data[0]?.embedding ?? null;
  if (!queryVector) {
    moduleLogger.warn('Failed to embed agent search query');
    return { results: [], total: 0, queryVector: null };
  }

  const hybrid = await runMediaHybridSearch({
    lexicalText: query,
    quotes: quotes ?? [],
    channelIds,
    publishedAt,
    queryVector,
    size: limit,
    // The agent's context text comes from the DB, not these snippets, so skip
    // the <mark> highlighting (no UI to render it, nothing to strip).
    highlight: false,
  });

  const ids = hybrid.hits.map((h) => h._id);

  // Matched paragraphs per upload (carry `order` so we can fetch neighbors).
  const matchedByInternal = new Map<string, MediaSegment[]>();
  const windowConditions = [];
  for (const hit of hybrid.hits) {
    const segs = mergeParagraphSnippets(hit, 4);
    matchedByInternal.set(hit._id, segs);
    for (const s of segs) {
      if (s.order == null) continue;
      windowConditions.push(
        and(
          eq(TranscriptParagraph.uploadRecordId, hit._id),
          gte(TranscriptParagraph.order, s.order - CONTEXT_WINDOW),
          lte(TranscriptParagraph.order, s.order + CONTEXT_WINDOW),
        ),
      );
    }
  }

  const [uploads, surroundingRows] = await Promise.all([
    ids.length > 0
      ? db.query.UploadRecord.findMany({
          where: (t, { inArray, and: andOp, isNotNull }) =>
            andOp(inArray(t.id, ids), isNotNull(t.transcodingFinishedAt)),
          columns: { id: true, title: true, publishedAt: true },
          with: {
            channel: {
              columns: { name: true, visibility: true, approvedAt: true },
            },
          },
        })
      : Promise.resolve([]),
    windowConditions.length > 0
      ? db
          .select({
            uploadRecordId: TranscriptParagraph.uploadRecordId,
            order: TranscriptParagraph.order,
            start: TranscriptParagraph.start,
            text: TranscriptParagraph.text,
          })
          .from(TranscriptParagraph)
          .where(or(...windowConditions))
          .orderBy(
            TranscriptParagraph.uploadRecordId,
            TranscriptParagraph.order,
          )
      : Promise.resolve([] as Row[]),
  ]);

  const byId = new Map(
    uploads
      .filter(
        (u) =>
          u.channel.visibility === 'PUBLIC' && u.channel.approvedAt !== null,
      )
      .map((u) => [u.id, u]),
  );

  const rowsByUpload = new Map<string, Row[]>();
  for (const r of surroundingRows) {
    const list = rowsByUpload.get(r.uploadRecordId);
    if (list) list.push(r);
    else rowsByUpload.set(r.uploadRecordId, [r]);
  }

  const results = hybrid.hits
    .map((hit) => {
      const upload = byId.get(hit._id);
      if (!upload) return null;

      // Outgoing (base58) id so citations link straight to /media/$mediaId.
      // Drop a hit with a malformed id rather than failing the whole search.
      const parsedId = OutgoingIdSchema.safeParse(hit._id);
      if (!parsedId.success) return null;
      const uploadId = parsedId.data;

      const rows = rowsByUpload.get(hit._id);
      const rawContext =
        rows && rows.length > 0
          ? buildBlocks(rows)
          : // Legacy docs without paragraph ordering: fall back to the
            // matched snippet text (ms -> seconds, sanitize). Agent search runs
            // with highlight off, so snippets carry no <mark> tags.
            (matchedByInternal.get(hit._id) ?? []).map((s) => ({
              startSeconds: Math.round(s.start / 1000),
              text: sanitizeSourceText(s.text),
            }));

      // Attach a ready-made citation token to each passage so the model can
      // copy it verbatim instead of constructing `[upload:id@sec]` itself
      // (which it tends to skip).
      const context = rawContext.map((c) => ({
        cite: `[upload:${uploadId}@${c.startSeconds}]`,
        startSeconds: c.startSeconds,
        text: c.text,
      }));

      return {
        uploadId,
        title: upload.title,
        channelName: upload.channel.name,
        publishedAt: upload.publishedAt?.toISOString() ?? null,
        context,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  return { results, total: hybrid.total, queryVector };
}

export const searchMediaTool = createTool({
  id: 'searchMedia',
  description:
    'Hybrid semantic + keyword search over the sermon/teaching video library. Returns the most relevant videos, each with context passages (the matched transcript paragraphs plus the paragraphs immediately around them) and a timestamp in seconds. Use this to ground every answer; call it multiple times with different queries when comparing sources or tracking a topic over time. Speaker identity is NOT searchable — pass speaker names as part of the query text, not as a filter. When looking for an exact wording, pass it in `quotes` for a verbatim phrase boost.',
  inputSchema: z.object({
    query: z
      .string()
      .describe('Natural-language search query (concepts, quotes, names).'),
    quotes: z
      .array(z.string())
      .optional()
      .describe(
        'Exact phrases to match verbatim (phrase-boosted), e.g. a specific quotation the answer hinges on.',
      ),
    channelNames: z
      .array(z.string())
      .optional()
      .describe('Channel / ministry / church names to restrict to.'),
    dateGte: z
      .string()
      .optional()
      .describe('Earliest publish date, inclusive (YYYY-MM-DD).'),
    dateLte: z
      .string()
      .optional()
      .describe('Latest publish date, inclusive (YYYY-MM-DD).'),
    limit: z.number().min(1).max(15).optional(),
  }),
  outputSchema: z.object({
    results: z.array(
      z.object({
        uploadId: z.string(),
        title: z.string().nullable(),
        channelName: z.string().nullable(),
        publishedAt: z.string().nullable(),
        context: z.array(
          z.object({
            // Ready-made citation token — copy verbatim after a supported claim.
            cite: z.string(),
            startSeconds: z.number(),
            text: z.string(),
          }),
        ),
      }),
    ),
    total: z.number(),
  }),
  execute: async ({
    query,
    quotes,
    channelNames,
    dateGte,
    dateLte,
    limit = 8,
  }) => {
    const { results, total } = await runAgentMediaSearch({
      query,
      quotes,
      channelNames,
      dateGte,
      dateLte,
      limit,
    });
    return { results, total };
  },
});
