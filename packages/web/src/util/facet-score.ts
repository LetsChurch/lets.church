/**
 * Score how well a facet label matches the typed query, used to order the search
 * palette's facet rows (server) and facet groups (client): exact match (1000) >
 * full-substring (500) > per-token overlap (count of 2+ char tokens present).
 * 1-char tokens (e.g. the "1" in "1 corinthians") are ignored in the overlap tier
 * so they don't spuriously float every "1 <book>"; exact and full-substring tiers
 * still use the whole query. Array.prototype.sort is stable, so callers sorting by
 * this score keep equal-scored items in their original (count/date) order.
 *
 * NOTE: this is a small display-layer ordering of a handful of facet labels (≤15)
 * against free text — something OpenSearch terms aggregations cannot express (they
 * sort buckets by `_count` or `_key` only, never by similarity to a query string).
 * It is NOT the media result ranking, which stays entirely in OpenSearch.
 */
export function facetMatchScore(label: string, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const l = label.toLowerCase();
  if (l === q) return 1000;
  if (l.includes(q)) return 500;
  return q
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .reduce((acc, t) => (l.includes(t) ? acc + 1 : acc), 0);
}
