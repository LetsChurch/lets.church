import type { Document } from 'flexsearch';
import { atom } from 'nanostores';
import PLazy from 'p-lazy';

export type TranscriptLine = {
  id?: number;
  start: number;
  text: string;
};

export type SearchResult = {
  id: number;
  start: number;
  text: string;
  highlighted: string;
};

// Search state atoms
export const $searchQuery = atom<string>('');
export const $searchResults = atom<SearchResult[]>([]);
export const $isSearchActive = atom<boolean>(false);

// Lazy-loaded FlexSearch index
let flexSearchIndexPromise: PLazy<Document<TranscriptLine>> | null = null;

export function initializeSearchIndex(
  transcriptLines: TranscriptLine[],
): PLazy<Document<TranscriptLine>> {
  if (!flexSearchIndexPromise) {
    flexSearchIndexPromise = PLazy.from(async () => {
      const { Document } = await import('flexsearch');

      const index = new Document<TranscriptLine>({
        document: {
          id: 'id',
          store: true,
          index: [
            {
              field: 'text',
              tokenize: 'forward',
            },
          ],
        },
      });

      // Add all transcript lines to the index
      transcriptLines.forEach((line, i) => {
        index.add({
          id: i,
          ...line,
        });
      });

      return index;
    });
  }

  return flexSearchIndexPromise;
}

export async function performSearch(
  query: string,
  transcriptLines: TranscriptLine[],
): Promise<void> {
  if (!query.trim()) {
    $searchResults.set([]);
    return;
  }

  const indexPromise = initializeSearchIndex(transcriptLines);
  const index = await indexPromise;

  const results = await index.search(query, {
    enrich: true,
    limit: 1000,
  });

  // FlexSearch returns results grouped by field
  const searchResults: SearchResult[] = [];

  if (results.length > 0 && results[0]?.result) {
    for (const item of results[0].result) {
      if (item && typeof item === 'object' && 'doc' in item) {
        const doc = item.doc as TranscriptLine & { id: number };
        // Create highlighted version by finding the query terms in the text
        const highlighted = highlightText(doc.text, query);

        searchResults.push({
          id: doc.id,
          start: doc.start,
          text: doc.text,
          highlighted,
        });
      }
    }
  }

  $searchResults.set(searchResults);
}

function highlightText(text: string, query: string): string {
  // Split query into terms and escape special regex characters
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 0)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  if (terms.length === 0) {
    return text;
  }

  // Create a regex that matches any of the terms (case insensitive)
  const pattern = new RegExp(`(${terms.join('|')})`, 'gi');

  // Replace matches with highlighted version
  return text.replace(pattern, '<mark>$1</mark>');
}

export function resetSearch(): void {
  $searchQuery.set('');
  $searchResults.set([]);
  $isSearchActive.set(false);
  flexSearchIndexPromise = null;
}
