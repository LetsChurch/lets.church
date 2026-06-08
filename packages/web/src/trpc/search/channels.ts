import { db } from '@letschurch/db';
import {
  MSearchResponseSchema,
  msearchChannels,
  osMsearch,
} from '@letschurch/opensearch';

export type ResolvedChannel = { id: string; slug: string; name: string };

/**
 * Resolve free-text channel/ministry names (as extracted by the query parser)
 * to public, approved channels. Each name is matched against `lc_channels`
 * with the same bool_prefix query the channel carousel uses, then hydrated from
 * the DB so only public + approved + non-deleted channels are returned. Result
 * order follows the input names; duplicates are dropped. Used both for filter
 * pre-fill and by the agent's channel-resolution tool.
 */
export async function resolveChannelNames(
  names: string[],
  { perName = 3 }: { perName?: number } = {},
): Promise<ResolvedChannel[]> {
  const cleaned = names.map((n) => n.trim()).filter(Boolean);
  if (cleaned.length === 0) return [];

  const searches = cleaned.flatMap((name) => msearchChannels(name, 0, perName));
  const parsed = MSearchResponseSchema.parse(await osMsearch(searches));

  const orderedIds: string[] = [];
  const seen = new Set<string>();
  for (const res of parsed.responses) {
    for (const hit of res.hits.hits) {
      if (hit._index !== 'lc_channels') continue;
      if (seen.has(hit._id)) continue;
      seen.add(hit._id);
      orderedIds.push(hit._id);
    }
  }
  if (orderedIds.length === 0) return [];

  const channels = await db.query.Channel.findMany({
    where: (t, { inArray, eq, and, isNotNull, isNull }) =>
      and(
        inArray(t.id, orderedIds),
        eq(t.visibility, 'PUBLIC'),
        isNotNull(t.approvedAt),
        isNull(t.deletedAt),
      ),
    columns: { id: true, slug: true, name: true },
  });
  const byId = new Map(channels.map((c) => [c.id, c]));

  return orderedIds
    .map((id) => byId.get(id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));
}
