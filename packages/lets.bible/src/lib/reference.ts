// Scripture reference parsing + linking helpers for the reading view.
//
// References resolve against the canon registry (canon.ts), so "php 4", "Psalm
// 23:1", and "1 John 1" all map to a real book slug + chapter (+ optional
// verse) — the shape of the `/bible/$book/$chapter` route's params.

import {
  bookBySlug,
  CANON,
  type CanonBook,
  DEFAULT_BOOK,
  DEFAULT_CHAPTER,
  findBook,
} from './canon';

export type Reference = { book: string; chapter: number; verse?: number };

// Props for a router <Link> to a passage: `<Link {...passageLink(ref)} />`.
export type PassageLink = {
  to: '/bible/$book/$chapter';
  params: { book: string; chapter: string };
  search: { v?: number };
  // Verse deep-links (`?v=`) are scrolled to + flashed in the reader, so they opt
  // out of TanStack Router's scroll-to-top reset on navigation (native scroll
  // restoration prevention). Chapter links (no verse) keep the default reset.
  resetScroll: boolean;
};

// Book name (greedy-lazy) + chapter + optional verse, e.g. "1 Samuel 3:4".
const REF_RE = /^(.+?)\s+(\d+)(?::(\d+))?\s*$/;

// Parse a human reference ("Philippians 4", "Isaiah 9:6", "1 John 1:1").
// Returns null when the book is unknown or the chapter is out of range.
export function parseReference(ref: string): Reference | null {
  const m = ref.trim().match(REF_RE);
  if (!m) {
    return null;
  }
  const book = findBook(m[1]);
  if (!book) {
    return null;
  }
  const chapter = Number(m[2]);
  if (chapter < 1 || chapter > book.chapterCount) {
    return null;
  }
  const verse = m[3] ? Number(m[3]) : undefined;
  if (verse != null && verse < 1) {
    return null;
  }
  return verse != null
    ? { book: book.slug, chapter, verse }
    : { book: book.slug, chapter };
}

// Build router <Link> props for a reference string. Falls back to the default
// passage when the string can't be parsed.
export function passageLink(ref: string): PassageLink {
  const parsed = parseReference(ref) ?? {
    book: DEFAULT_BOOK,
    chapter: DEFAULT_CHAPTER,
  };
  return {
    to: '/bible/$book/$chapter',
    params: { book: parsed.book, chapter: String(parsed.chapter) },
    search: parsed.verse != null ? { v: parsed.verse } : {},
    resetScroll: parsed.verse == null,
  };
}

// Plain href for a passage target — used where a router <Link> isn't available
// (e.g. the router-agnostic Passage renderer / Storybook).
export function passageHref(t: {
  book: string;
  chapter: number;
  verse?: number;
}): string {
  return `/bible/${t.book}/${t.chapter}${t.verse != null ? `?v=${t.verse}` : ''}`;
}

// The adjacent chapter in canonical order, crossing book boundaries. Returns
// null at the very start (Genesis 1) / end (Revelation 22).
export function adjacentChapter(
  slug: string,
  chapter: number,
  dir: -1 | 1,
): { book: CanonBook; chapter: number } | null {
  const book = bookBySlug(slug);
  if (!book) {
    return null;
  }
  const target = chapter + dir;
  if (target >= 1 && target <= book.chapterCount) {
    return { book, chapter: target };
  }
  const nextBook = CANON.find((b) => b.ordinal === book.ordinal + dir);
  if (!nextBook) {
    return null;
  }
  return {
    book: nextBook,
    chapter: dir === 1 ? 1 : nextBook.chapterCount,
  };
}

// Link props for an explicit book/chapter (+ optional verse).
export function chapterLink(
  book: CanonBook | string,
  chapter: number,
  verse?: number,
): PassageLink {
  const slug = typeof book === 'string' ? book : book.slug;
  return {
    to: '/bible/$book/$chapter',
    params: { book: slug, chapter: String(chapter) },
    search: verse != null ? { v: verse } : {},
    resetScroll: verse == null,
  };
}
