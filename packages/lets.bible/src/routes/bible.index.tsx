import { createFileRoute, redirect } from '@tanstack/react-router';
import { DEFAULT_BOOK, DEFAULT_CHAPTER } from '@/lib/canon';

// Bare /bible sends the reader to a sensible default passage.
export const Route = createFileRoute('/bible/')({
  loader: () => {
    throw redirect({
      to: '/bible/$book/$chapter',
      params: { book: DEFAULT_BOOK, chapter: String(DEFAULT_CHAPTER) },
    });
  },
});
