/**
 * `getNextPageParam` for tRPC infinite queries whose pages carry a
 * `nextCursor` (null on the last page).
 */
export function getNextCursor<TCursor>(lastPage: {
  nextCursor?: TCursor | null;
}): TCursor | null {
  return lastPage.nextCursor ?? null;
}
