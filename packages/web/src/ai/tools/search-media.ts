import {
  db,
  Speaker,
  SpeakerAttribution,
  SpeakerParagraphLabel,
  TranscriptParagraph,
} from '@letschurch/db';
import {
  type MediaSegment,
  mergeParagraphSnippets,
  runMediaHybridSearch,
  topMatchStartSeconds,
} from '@letschurch/opensearch';
import {
  createEmbeddingsTracked,
  EMBED_MODEL,
} from '@letschurch/temporal/util/llm';
import { tool } from 'ai';
import { and, eq, gte, isNull, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';

import { OutgoingIdSchema } from '@/schemas/common';
import {
  resolveChannelNames,
  resolveChannelSlugs,
} from '@/trpc/search/channels';
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
  // Resolved speaker name (override → attribution → Speaker.name); null when the
  // paragraph's diarization label isn't attributed to a named speaker.
  speakerName: string | null;
};

type Block = {
  startSeconds: number;
  text: string;
  speakerName: string | null;
};

// Merge contiguous paragraphs (by order) into a single context block, keeping
// the earliest start (seconds) as the citation timestamp. A change of speaker
// also breaks the block, so each block carries a single (or no) attribution.
function buildBlocks(rows: Row[]): Block[] {
  const seen = new Set<number>();
  const uniq: Row[] = [];
  for (const r of rows) {
    if (seen.has(r.order)) continue;
    seen.add(r.order);
    uniq.push(r);
  }
  uniq.sort((a, b) => a.order - b.order);

  const blocks: Block[] = [];
  let cur: (Block & { lastOrder: number }) | null = null;
  for (const r of uniq) {
    if (
      cur &&
      r.order === cur.lastOrder + 1 &&
      r.speakerName === cur.speakerName
    ) {
      cur.text += ` ${r.text}`;
      cur.lastOrder = r.order;
    } else {
      if (cur)
        blocks.push({
          startSeconds: cur.startSeconds,
          text: cur.text,
          speakerName: cur.speakerName,
        });
      cur = {
        startSeconds: Math.round(r.start),
        text: r.text,
        speakerName: r.speakerName,
        lastOrder: r.order,
      };
    }
  }
  if (cur)
    blocks.push({
      startSeconds: cur.startSeconds,
      text: cur.text,
      speakerName: cur.speakerName,
    });
  // Sanitize each (untrusted) passage: strip hidden chars and cap length so a
  // malicious transcript can't smuggle directives or flood the agent context.
  return blocks.map((b) => ({
    startSeconds: b.startSeconds,
    text: sanitizeSourceText(b.text),
    speakerName: b.speakerName,
  }));
}

export type AgentMediaSearchInput = {
  query: string;
  /** Verbatim phrases to phrase-match (match_phrase boost), e.g. an exact quote. */
  quotes?: string[];
  channelNames?: string[];
  /**
   * Pre-resolved channel ids. Highest precedence — when the caller has already
   * resolved the channels (e.g. the answer route resolved the URL slugs once for
   * both retrieval and the agent scope note), pass them here to skip re-resolving.
   */
  channelIds?: string[] | null;
  /**
   * Channel slugs (as carried on search URLs / facet filters). Resolved by exact
   * slug match and takes precedence over `channelNames` when both are given.
   * Used to scope the AI answer to a channel pre-filled on the URL.
   */
  channelSlugs?: string[];
  /**
   * Restrict to paragraphs *spoken by* these named speakers ("what did X say").
   * Only paragraphs attributed to a matching speaker can match/return, and only
   * videos featuring them are eligible. Matches partial names ("Conley" →
   * "Conley Owens"); empty/omitted means no speaker scope.
   */
  speakerNames?: string[];
  /** OSIS verse facet tokens ("John.3.16"); restricts to docs citing one of them. */
  bibleRefs?: string[];
  /** OSIS book ids ("Rom"); restricts to docs citing that book. */
  bibleBooks?: string[];
  /** Internal upload UUIDs to restrict retrieval to (per-video "ask"). */
  uploadIds?: string[] | null;
  dateGte?: string;
  dateLte?: string;
  limit?: number;
};

export type AgentMediaSearchResult = {
  uploadId: string;
  title: string | null;
  channelName: string | null;
  publishedAt: string | null;
  // Start (seconds) of the strongest-matching paragraph — the citation anchor a
  // source/footnote should jump to. Falls back to the first context block.
  matchStartSeconds: number;
  context: Array<{
    cite: string;
    startSeconds: number;
    text: string;
    // Named speaker for this passage, when the diarization label is attributed;
    // null otherwise (we never expose raw "SPEAKER_00" labels to the model).
    speaker: string | null;
  }>;
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
  channelIds: preResolvedChannelIds,
  channelSlugs,
  speakerNames,
  bibleRefs,
  bibleBooks,
  uploadIds,
  dateGte,
  dateLte,
  limit = 8,
}: AgentMediaSearchInput): Promise<{
  results: AgentMediaSearchResult[];
  total: number;
  queryVector: number[] | null;
}> {
  // Was a channel scope asked for at all? (Pre-resolved ids count even when the
  // array is empty — that's an explicit "no matching channel", not "no scope".)
  const channelScopeRequested =
    preResolvedChannelIds != null ||
    (channelSlugs?.length ?? 0) > 0 ||
    (channelNames?.length ?? 0) > 0;

  // Precedence: pre-resolved ids → exact URL slugs → the parser's fuzzy names.
  const channelIds =
    preResolvedChannelIds != null
      ? preResolvedChannelIds
      : channelSlugs && channelSlugs.length > 0
        ? (await resolveChannelSlugs(channelSlugs)).map((c) => c.id)
        : channelNames && channelNames.length > 0
          ? (await resolveChannelNames(channelNames)).map((c) => c.id)
          : null;

  // A scope was requested but resolved to no channel (e.g. a slug filter that
  // matched nothing public) → return no results, NOT the whole library.
  if (channelScopeRequested && channelIds != null && channelIds.length === 0) {
    return { results: [], total: 0, queryVector: null };
  }

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
    bibleRefs: bibleRefs && bibleRefs.length > 0 ? bibleRefs : null,
    bibleBooks: bibleBooks && bibleBooks.length > 0 ? bibleBooks : null,
    uploadIds: uploadIds && uploadIds.length > 0 ? uploadIds : null,
    paragraphSpeakers:
      speakerNames && speakerNames.length > 0 ? speakerNames : null,
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
            speakerName: Speaker.name,
          })
          .from(TranscriptParagraph)
          // Effective label = per-paragraph override ?? diarization speaker;
          // attribution maps (upload, effective label) → a named Speaker. Each
          // join is unique-keyed, so no row fan-out.
          .leftJoin(
            SpeakerParagraphLabel,
            eq(SpeakerParagraphLabel.paragraphId, TranscriptParagraph.id),
          )
          .leftJoin(
            SpeakerAttribution,
            and(
              eq(
                SpeakerAttribution.uploadRecordId,
                TranscriptParagraph.uploadRecordId,
              ),
              eq(
                SpeakerAttribution.speakerLabel,
                sql`coalesce(${SpeakerParagraphLabel.label}, ${TranscriptParagraph.speaker})`,
              ),
            ),
          )
          .leftJoin(
            Speaker,
            and(
              eq(Speaker.id, SpeakerAttribution.speakerId),
              isNull(Speaker.deletedAt),
            ),
          )
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
      const rawContext: Block[] =
        rows && rows.length > 0
          ? buildBlocks(rows)
          : // Legacy docs without paragraph ordering: fall back to the
            // matched snippet text (ms -> seconds, sanitize). Agent search runs
            // with highlight off, so snippets carry no <mark> tags. No resolved
            // speaker here — these predate the speaker library.
            (matchedByInternal.get(hit._id) ?? []).map((s) => ({
              startSeconds: Math.round(s.start / 1000),
              text: sanitizeSourceText(s.text),
              speakerName: null,
            }));

      // Attach a ready-made citation token to each passage so the model can
      // copy it verbatim instead of constructing `[upload:id@sec]` itself
      // (which it tends to skip).
      const context = rawContext.map((c) => ({
        cite: `[upload:${uploadId}@${c.startSeconds}]`,
        startSeconds: c.startSeconds,
        text: c.text,
        speaker: c.speakerName,
      }));

      // Anchor citations to the strongest matched paragraph (not the earliest
      // context block, which the ±1 window can push before the match → ~0s).
      const matchStartSeconds =
        topMatchStartSeconds(hit) ?? context[0]?.startSeconds ?? 0;

      return {
        uploadId,
        title: upload.title,
        channelName: upload.channel.name,
        publishedAt: upload.publishedAt?.toISOString() ?? null,
        matchStartSeconds,
        context,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  return { results, total: hybrid.total, queryVector };
}

export const searchMediaTool = tool({
  description:
    'Hybrid semantic + keyword search over the sermon/teaching video library. Returns the most relevant videos, each with context passages (the matched transcript paragraphs plus the paragraphs immediately around them), a timestamp in seconds, and — when the diarized voice has been attributed — the name of the speaker for that passage. Use this to ground every answer; call it multiple times with different queries when comparing sources or tracking a topic over time. To answer "what did <person> say about …" or focus on one speaker, pass their name in `speakerNames` to restrict to paragraphs they actually spoke (this works only for speakers labeled in the library; if it returns nothing, retry without it and match the name in the query text). The `speaker` field on each returned passage gives the attributed name for citation, and is null when the voice is unattributed. When looking for an exact wording, pass it in `quotes` for a verbatim phrase boost.',
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
    speakerNames: z
      .array(z.string())
      .optional()
      .describe(
        'Restrict to paragraphs SPOKEN BY these people — use for "what did <person> say about …" or to focus on one speaker. Only paragraphs attributed to a matching speaker are returned. Partial names work ("Conley" matches "Conley Owens"). If it returns nothing, the person likely isn\'t labeled in the library yet — retry without this and match the name in the query text instead.',
      ),
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
  execute: async ({
    query,
    quotes,
    channelNames,
    speakerNames,
    dateGte,
    dateLte,
    limit = 8,
  }) => {
    const { results, total } = await runAgentMediaSearch({
      query,
      quotes,
      channelNames,
      speakerNames,
      dateGte,
      dateLte,
      limit,
    });
    return { results, total };
  },
});
