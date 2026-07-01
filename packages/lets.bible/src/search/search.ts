import { osCount, osSearch, VERSE_INDEX } from './client';

// Popularity `rank_feature` tuning (see mappings.ts `popularity`). `saturation`
// contribution is `boost * pop / (pop + pivot)`, capped at `boost`. Pivot is set
// near the median distilled count so mid-popularity verses get ~half the boost;
// boost sits below the top text boosts (5/3/2) so popularity reorders similar
// matches without overriding a decisively better text match.
const POPULARITY_PIVOT = 2000;
const POPULARITY_BOOST = 4;

export type VerseHit = {
  ref: string;
  book: string; // USFM
  slug: string;
  name: string;
  chapter: number;
  verse: number;
  text: string;
  highlight: string; // verse text with <mark> around matches (html-encoded)
};

type VerseSource = {
  book: string;
  slug: string;
  name: string;
  ref: string;
  chapter: number;
  verse: number;
  text: string;
};

// Full-text verse search within a single translation. Layered so wording and
// term-coverage both count:
//   • exact-phrase match (highest boost) — "fruit of the Spirit" verbatim;
//   • slop-2 phrase match on the stemmed field — near-exact wording;
//   • a coverage match (≥75% of the query terms) — rewards verses that contain
//     MOST of the query's words, so for a topical query like "fruit of the
//     Spirit" the verses with both "fruit" and "Spirit" rank above incidental
//     single-word hits ("…its fruit will be good…");
//   • a plain stemmed match — recall, so single-term hits still appear (lower).
export async function searchVerses(params: {
  q: string;
  translationId: string;
  from?: number;
  size?: number;
}): Promise<VerseHit[]> {
  const trimmed = params.q.trim();
  if (!trimmed) {
    return [];
  }

  const res = await osSearch<VerseSource>({
    index: VERSE_INDEX,
    from: params.from ?? 0,
    size: params.size ?? 20,
    query: {
      bool: {
        filter: [{ term: { translationId: params.translationId } }],
        // A text match is REQUIRED (the inner bool); popularity is a pure
        // scoring boost in the outer `should` — it must never make a verse match
        // on its own, or every popular verse would surface for any query.
        must: [
          {
            bool: {
              minimum_should_match: 1,
              should: [
                {
                  match_phrase: { 'text.exact': { query: trimmed, boost: 5 } },
                },
                {
                  match_phrase: { text: { query: trimmed, slop: 2, boost: 2 } },
                },
                {
                  // Coverage bonus: "2<75%" requires ALL terms when the query has
                  // ≤2 (so "fruit of the Spirit" → both "fruit" and "spirit"
                  // after stopword removal), and ≥75% beyond that. ES rounds
                  // percentages down, so a plain "75%" would collapse to 1 term
                  // for a 2-term query — hence the combination form.
                  match: {
                    text: {
                      query: trimmed,
                      minimum_should_match: '2<75%',
                      boost: 3,
                    },
                  },
                },
                { match: { text: { query: trimmed } } },
              ],
            },
          },
        ],
        // Bounded, saturating boost by Common Crawl popularity. `saturation`
        // caps the contribution at `boost` (unlike `log`, which the power-law
        // tail would let dominate); with pivot 2000 a mid-popularity verse gets
        // ~half of it and the most-quoted verses ~all of it. Sits alongside the
        // text boosts (5/3/2) as a tie-breaker, not an override.
        should: [
          {
            rank_feature: {
              field: 'popularity',
              saturation: { pivot: POPULARITY_PIVOT },
              boost: POPULARITY_BOOST,
            },
          },
        ],
      },
    },
    highlight: {
      pre_tags: ['<mark>'],
      post_tags: ['</mark>'],
      // html encoder makes the fragments safe to render: the verse text is
      // HTML-escaped and only our <mark> tags are injected.
      encoder: 'html',
      number_of_fragments: 0, // verses are short — highlight the whole field
      fields: { text: {}, 'text.exact': {} },
    },
  });

  return res.hits.hits.flatMap((hit) => {
    const s = hit._source;
    if (!s) {
      return [];
    }
    const highlight =
      hit.highlight?.['text.exact']?.[0] ?? hit.highlight?.text?.[0] ?? s.text;
    return [
      {
        ref: s.ref,
        book: s.book,
        slug: s.slug,
        name: s.name,
        chapter: s.chapter,
        verse: s.verse,
        text: s.text,
        highlight,
      },
    ];
  });
}

function toHit(s: VerseSource): VerseHit {
  return {
    ref: s.ref,
    book: s.book,
    slug: s.slug,
    name: s.name,
    chapter: s.chapter,
    verse: s.verse,
    text: s.text,
    highlight: s.text,
  };
}

// Count of verses containing the query as an EXACT phrase (standard-analyzed,
// no stemming) within a translation — powers the autocomplete's "Exact phrase"
// entry ("…in N verses"). Cheap: a count query, no documents returned.
export async function countExactPhrase(params: {
  q: string;
  translationId: string;
}): Promise<number> {
  const trimmed = params.q.trim();
  if (!trimmed) {
    return 0;
  }
  return osCount({
    index: VERSE_INDEX,
    query: {
      bool: {
        filter: [{ term: { translationId: params.translationId } }],
        must: [{ match_phrase: { 'text.exact': trimmed } }],
      },
    },
  });
}

// "Related passages" via Elasticsearch's more_like_this — lexical similarity
// (shared significant terms) over verse text. No embeddings required; a future
// upgrade could fuse in dense-vector kNN for true semantic similarity. `like`
// is usually a reference verse's text (find passages like John 3:16) or the raw
// query; `excludeRefs` drops verses already shown as exact matches.
export async function relatedVerses(params: {
  like: string;
  translationId: string;
  excludeRefs?: string[];
  size?: number;
}): Promise<VerseHit[]> {
  const like = params.like.trim();
  if (!like) {
    return [];
  }
  const res = await osSearch<VerseSource>({
    index: VERSE_INDEX,
    size: params.size ?? 6,
    query: {
      bool: {
        filter: [{ term: { translationId: params.translationId } }],
        must: [
          {
            more_like_this: {
              fields: ['text'],
              like,
              min_term_freq: 1,
              min_doc_freq: 2,
              max_query_terms: 25,
              minimum_should_match: '30%',
            },
          },
        ],
        must_not: (params.excludeRefs ?? []).map((ref) => ({ term: { ref } })),
      },
    },
  });
  return res.hits.hits.flatMap((hit) =>
    hit._source ? [toHit(hit._source)] : [],
  );
}
