// Item shapes for the local-first TanStack DB collections. Each row carries
// sync bookkeeping: `updatedAt` (ms, last-writer-wins), `dirty` (needs pushing
// to the server), and `deleted` (tombstone so deletions sync). Highlights and
// notes are keyed by the canonical verse ref (translation-agnostic), matching
// the server.

import type { HighlightColor } from '@/lib/highlight-colors';

export type { HighlightColor };

export type LocalHighlight = {
  ref: string; // 'JHN.3.16'
  book: string; // USFM
  chapter: number;
  verse: number;
  color: HighlightColor;
  updatedAt: number;
  dirty: boolean;
  deleted: boolean;
};

export type LocalNote = {
  ref: string;
  book: string;
  chapter: number;
  verse: number;
  body: string;
  updatedAt: number;
  dirty: boolean;
  deleted: boolean;
};

export type LocalProgress = {
  key: string; // `${book}.${chapter}`
  book: string;
  chapter: number;
  verse: number | null;
  updatedAt: number;
  dirty: boolean;
};
