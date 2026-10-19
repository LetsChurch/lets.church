import type { Document } from 'flexsearch';
import { atom } from 'nanostores';
import PLazy from 'p-lazy';

type IndexedParagraph = {
  id: number;
  text: string;
};

// Search state atoms. Results are the indices (into the paragraph array that
// was searched) of matching paragraphs; TranscriptParagraphs renders and
// highlights them.
export const $searchQuery = atom<string>('');
export const $searchResults = atom<number[]>([]);
export const $isSearchActive = atom<boolean>(false);

// Lazy-loaded FlexSearch index
let flexSearchIndexPromise: PLazy<Document<IndexedParagraph>> | null = null;

export function initializeSearchIndex(
  paragraphs: Array<{ text: string }>,
): PLazy<Document<IndexedParagraph>> {
  if (!flexSearchIndexPromise) {
    flexSearchIndexPromise = PLazy.from(async () => {
      const { Document } = await import('flexsearch');

      const index = new Document<IndexedParagraph>({
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

      paragraphs.forEach((p, i) => {
        index.add({ id: i, text: p.text });
      });

      return index;
    });
  }

  return flexSearchIndexPromise;
}

export async function performSearch(
  query: string,
  paragraphs: Array<{ text: string }>,
): Promise<void> {
  if (!query.trim()) {
    $searchResults.set([]);
    return;
  }

  const index = await initializeSearchIndex(paragraphs);

  const results = await index.search(query, {
    enrich: true,
    limit: 1000,
  });

  // FlexSearch returns results grouped by field
  const ids: number[] = [];

  if (results.length > 0 && results[0]?.result) {
    for (const item of results[0].result) {
      if (item && typeof item === 'object' && 'doc' in item) {
        ids.push((item.doc as IndexedParagraph).id);
      }
    }
  }

  $searchResults.set(ids);
}

export function resetSearch(): void {
  $searchQuery.set('');
  $searchResults.set([]);
  $isSearchActive.set(false);
  flexSearchIndexPromise = null;
}
