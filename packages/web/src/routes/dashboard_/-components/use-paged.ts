import { useState } from 'react';

// Client-side pagination over an in-memory list (the labeling lists are already
// server-capped + cached, so this just bounds how many rows render at once).
// `page` is clamped to the valid range so a shrinking list (e.g. after
// filtering or assigning) never strands you on an empty page.
export function usePaged<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const slice = items.slice((safePage - 1) * pageSize, safePage * pageSize);
  return { slice, page: safePage, setPage, pageCount };
}
