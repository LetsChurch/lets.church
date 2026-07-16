import { grepParagraphs } from '@letschurch/opensearch';
import { tool } from 'ai';
import { z } from 'zod';

import { OutgoingIdSchema } from '@/schemas/common';
import { resolveChannelNames } from '@/trpc/search/channels';
import logger from '@/util/logger';

import { sanitizeSourceText } from '../sanitize';

const moduleLogger = logger.child({ module: 'ai/tools/grep-transcript' });

// Cap results so a common phrase can't flood the agent's context. The detective
// loop wants a handful of exact hits to confirm/refute a recollection, not an
// exhaustive dump.
const MAX_GREP_RESULTS = 12;

export const grepTranscriptTool = tool({
  description:
    'Find a remembered near-verbatim QUOTE exactly as it appears in transcripts (case-insensitive substring match, not semantic). Use this for a distinctive quoted phrase the user recalls — especially when keyword/semantic search is thin or the surrounding labels (denomination, names, dates) may be misremembered. The quote is high-confidence evidence; swappable labels are not. Returns matching passages with their video + timestamp so you can confirm by reading neighboring context and correct a wrong label.',
  inputSchema: z.object({
    phrase: z
      .string()
      .min(4)
      .describe(
        'The distinctive quoted phrase to find verbatim (case-insensitive). Keep it to the memorable core of the quote; shorter, punctuation-light substrings match transcription variance better.',
      ),
    channelNames: z
      .array(z.string())
      .optional()
      .describe('Restrict to these ministries/churches (resolved by name).'),
  }),
  execute: async ({ phrase, channelNames }) => {
    // An empty resolved set means "a channel was named but matched nothing
    // public" → grepParagraphs returns no results rather than broadening. Null
    // (no channel filter) searches the whole library.
    const channelIds =
      channelNames && channelNames.length > 0
        ? (await resolveChannelNames(channelNames)).map((c) => c.id)
        : null;

    let rows: Awaited<ReturnType<typeof grepParagraphs>>;
    try {
      // Exact case-insensitive substring over the `paragraphs.text.wildcard`
      // multi-field in OpenSearch (access control applied inside), replacing the
      // old Postgres ILIKE + pg_trgm path — same data, one store.
      rows = await grepParagraphs({ phrase, channelIds });
    } catch (err) {
      moduleLogger.warn(
        {
          context: { error: err instanceof Error ? err.message : String(err) },
        },
        'grepTranscript query failed',
      );
      return { matches: [] };
    }

    const matches = rows.flatMap((r) => {
      const parsedId = OutgoingIdSchema.safeParse(r.uploadId);
      if (!parsedId.success) return [];
      const uploadId = parsedId.data;
      const startSeconds = Math.round(r.start);
      return [
        {
          uploadId,
          cite: `[upload:${uploadId}@${startSeconds}]`,
          startSeconds,
          order: r.order,
          title: r.title ? sanitizeSourceText(r.title, 300) : null,
          channelName: r.channelName
            ? sanitizeSourceText(r.channelName, 200)
            : null,
          text: sanitizeSourceText(r.text),
        },
      ];
    });

    return { matches: matches.slice(0, MAX_GREP_RESULTS) };
  },
});
