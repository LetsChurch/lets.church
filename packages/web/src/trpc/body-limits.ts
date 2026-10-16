/**
 * The largest tRPC input is the 64 MiB bulk-media CSV. JSON escaping can
 * double ordinary CSV bytes (quotes, backslashes, and line breaks); the final
 * MiB leaves room for the tRPC envelope, filename, and co-batched calls.
 */
export const WEB_TRPC_MAX_BODY_BYTES = 129 * 1024 * 1024;

// Worst-case UTF-8 for the search answer's bounded query/filter fields plus
// JSON and tRPC framing.
export const SEARCH_ANSWER_MAX_BODY_BYTES = 96 * 1024;

// Forty 8,000-character messages at worst-case UTF-8 plus identifiers and
// JSON/tRPC framing. This preserves the documented conversation limits.
export const DIG_DEEPER_MAX_BODY_BYTES = 1_310_720;

// Procedures with a far tighter body cap than the 129 MiB default (which exists
// only for the bulk CSV import). The streaming AI answers take small, bounded
// inputs, and capping their bodies keeps an oversized POST from being buffered
// and parsed before input validation would reject it.
const PROCEDURE_MAX_BODY_BYTES: Record<string, number> = {
  'search.answer': SEARCH_ANSWER_MAX_BODY_BYTES,
  'search.digDeeper': DIG_DEEPER_MAX_BODY_BYTES,
};

/**
 * The body cap for a tRPC POST. When every procedure in the (possibly batched)
 * path has its own cap, the sum of those caps (one per batched call, never
 * above the default); otherwise the default. The client's streaming link only ever batches these
 * capped procedures together, so their requests always get a tight cap.
 */
export function trpcMaxBodyBytes(url: string): number {
  const path = new URL(url).pathname.replace(/^\/trpc\/?/, '');
  const procedures = decodeURIComponent(path).split(',').filter(Boolean);
  let total = 0;
  for (const procedure of procedures) {
    const cap = PROCEDURE_MAX_BODY_BYTES[procedure];
    if (cap === undefined) return WEB_TRPC_MAX_BODY_BYTES;
    total += cap;
  }
  // Never looser than the default, however many capped calls a path lists.
  return total > 0
    ? Math.min(total, WEB_TRPC_MAX_BODY_BYTES)
    : WEB_TRPC_MAX_BODY_BYTES;
}
