import { EMBED_MODEL, embedQuery } from '../ai/embed';
import { cacheGet, cacheSet } from '../util/cache';
import {
  HYBRID_PIPELINE,
  type OsHits,
  osCount,
  osSearch,
  VERSE_INDEX,
} from './client';

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

// The lexical branch: a layered bool that scores wording and term-coverage,
// shared by the pure-lexical `searchVerses` and the lexical half of the hybrid
// query. Layered so:
//   • exact-phrase match (highest boost) — "fruit of the Spirit" verbatim;
//   • slop-2 phrase match on the stemmed field — near-exact wording;
//   • a coverage match (≥75% of the query terms) — rewards verses that contain
//     MOST of the query's words, so for a topical query like "fruit of the
//     Spirit" the verses with both "fruit" and "Spirit" rank above incidental
//     single-word hits ("…its fruit will be good…");
//   • a plain stemmed match — recall, so single-term hits still appear (lower).
// Popularity is a pure scoring boost in the outer `should` — it must never make
// a verse match on its own, or every popular verse would surface for any query.
function buildLexicalVerseQuery(
  trimmed: string,
  translationId: string,
): Record<string, unknown> {
  return {
    bool: {
      filter: [{ term: { translationId } }],
      must: [
        {
          bool: {
            minimum_should_match: 1,
            should: [
              { match_phrase: { 'text.exact': { query: trimmed, boost: 5 } } },
              { match_phrase: { text: { query: trimmed, slop: 2, boost: 2 } } },
              {
                // Coverage bonus: "2<75%" requires ALL terms when the query has
                // ≤2 (so "fruit of the Spirit" → both "fruit" and "spirit" after
                // stopword removal), and ≥75% beyond that. ES rounds percentages
                // down, so a plain "75%" would collapse to 1 term for a 2-term
                // query — hence the combination form.
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
      // Bounded, saturating boost by Common Crawl popularity. `saturation` caps
      // the contribution at `boost` (unlike `log`, which the power-law tail
      // would let dominate); with pivot 2000 a mid-popularity verse gets ~half
      // of it and the most-quoted verses ~all. A tie-breaker, not an override.
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
  };
}

// Request both highlights so exact phrases include their stop words (for
// example, the whole "belt of truth"). Constrain the exact field with its own
// phrase query; without this, the highlighter marks individual query terms such
// as "of" even when the complete phrase did not match.
// Verses are short, so the whole field is highlighted; `encoder: 'html'` makes
// fragments safe to render.
function verseHighlight(trimmed: string) {
  return {
    pre_tags: ['<mark>'],
    post_tags: ['</mark>'],
    encoder: 'html',
    number_of_fragments: 0,
    fields: {
      text: {},
      'text.exact': {
        highlight_query: {
          match_phrase: { 'text.exact': { query: trimmed } },
        },
      },
    },
  };
}

// Pure-lexical (BM25) verse search within a single translation. Still used for
// the instant paths (no OpenAI round-trip): it is the fallback when embeddings
// are disabled and the retriever for callers that don't want the extra latency.
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
    query: buildLexicalVerseQuery(trimmed, params.translationId),
    highlight: verseHighlight(trimmed),
  });

  return mapVerseHits(res);
}

// Prefer a true exact-phrase highlight, then a meaningful English-analyzed term,
// falling back to plain text for semantic-only hits.
function mapVerseHits(res: OsHits<VerseSource>): VerseHit[] {
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

// Embed a query for the semantic branch, cached in Valkey (deterministic per
// query text + model), so repeat searches skip the OpenAI round-trip. Returns
// null when embeddings are disabled or the call fails, so callers fall back to
// pure lexical search rather than erroring.
async function getQueryVector(trimmed: string): Promise<number[] | null> {
  const key = `letsbible-qvec:v1:${EMBED_MODEL}:${trimmed}`;
  try {
    const cached = await cacheGet(key);
    if (cached) {
      return JSON.parse(cached) as number[];
    }
    const vector = await embedQuery(trimmed);
    if (vector) {
      // 7-day TTL: bounded growth, but hot queries stay warm across visitors.
      await cacheSet(key, JSON.stringify(vector), 60 * 60 * 24 * 7);
    }
    return vector;
  } catch (err) {
    console.warn(
      'lets.bible query embedding failed (falling back to lexical):',
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

// Hybrid (lexical + semantic) verse search — the retriever behind the search
// page and the AI-answer grounding. Runs the layered BM25 query AND a kNN over
// the verse `embedding`, fused by the HYBRID_PIPELINE (min-max normalize +
// lexical-biased weighted mean). This is what lets a paraphrase with little
// lexical overlap ("they meant bad but God meant good") surface Genesis 50:20.
// Degrades to pure lexical search when embeddings are unavailable.
export async function hybridSearchVerses(params: {
  q: string;
  translationId: string;
  size?: number;
}): Promise<VerseHit[]> {
  const trimmed = params.q.trim();
  if (!trimmed) {
    return [];
  }
  const size = params.size ?? 20;

  const vector = await getQueryVector(trimmed);
  if (!vector) {
    return searchVerses({
      q: trimmed,
      translationId: params.translationId,
      size,
    });
  }

  const res = await osSearch<VerseSource>({
    index: VERSE_INDEX,
    size,
    search_pipeline: HYBRID_PIPELINE,
    query: {
      // Two branches, fused by the pipeline (weights [lexical 0.6, knn 0.4]).
      // Order matters — it maps to the pipeline's weight array.
      hybrid: {
        queries: [
          buildLexicalVerseQuery(trimmed, params.translationId),
          {
            knn: {
              embedding: {
                vector,
                k: size,
                // Scope the ANN to the active translation, like the lexical
                // branch's filter, so we never mix translations.
                filter: { term: { translationId: params.translationId } },
              },
            },
          },
        ],
      },
    },
    highlight: verseHighlight(trimmed),
  });

  return mapVerseHits(res);
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

// Verse `_source` we return for related hits — everything except the huge
// `embedding` (3072 floats), which we never send to the client.
const VERSE_SOURCE_FIELDS = [
  'book',
  'slug',
  'name',
  'ref',
  'chapter',
  'verse',
  'text',
];

// A verse's stored embedding, fetched from the index by (translation, ref). Lets
// semantic "related passages" seed off a reference verse's OWN indexed vector —
// no re-embedding. Returns null when absent (→ lexical fallback).
async function getVerseVector(
  translationId: string,
  ref: string,
): Promise<number[] | null> {
  const res = await osSearch<{ embedding?: number[] }>({
    index: VERSE_INDEX,
    size: 1,
    _source: ['embedding'],
    query: {
      bool: { filter: [{ term: { translationId } }, { term: { ref } }] },
    },
  });
  const e = res.hits.hits[0]?._source?.embedding;
  return e && e.length > 0 ? e : null;
}

// "Related passages" — SEMANTIC similarity via dense-vector kNN over the verse
// `embedding`, so results are thematically related rather than just sharing rare
// words. The seed vector is the reference verse's stored embedding (`sourceRef`,
// e.g. "find passages like John 3:16") or the free-text query embedded on the
// fly. Falls back to lexical `more_like_this` over verse text when no vector is
// available (embeddings disabled, or a miss). `excludeRefs` drops verses already
// shown (the exact matches + the seed verse itself).
export async function relatedVerses(params: {
  like: string;
  sourceRef?: string | null;
  translationId: string;
  excludeRefs?: string[];
  size?: number;
}): Promise<VerseHit[]> {
  const like = params.like.trim();
  const size = params.size ?? 6;
  const excludeRefs = params.excludeRefs ?? [];
  // Drop verses already shown (exact matches + the seed) and — when seeded by a
  // reference verse — its whole chapter, so "related" surfaces passages ELSEWHERE
  // rather than the adjacent verses the reader can just keep reading. (`ref` is a
  // keyword like `ISA.53.5`, so the chapter is the `ISA.53.` prefix.)
  const mustNot: Array<Record<string, unknown>> = excludeRefs.map((ref) => ({
    term: { ref },
  }));
  if (params.sourceRef) {
    mustNot.push({
      prefix: { ref: `${params.sourceRef.split('.').slice(0, 2).join('.')}.` },
    });
  }

  // Seed vector: reuse the reference verse's indexed vector, else embed the query.
  const vector = params.sourceRef
    ? await getVerseVector(params.translationId, params.sourceRef)
    : like
      ? await getQueryVector(like)
      : null;

  if (vector) {
    const res = await osSearch<VerseSource>({
      index: VERSE_INDEX,
      size,
      _source: VERSE_SOURCE_FIELDS,
      query: {
        knn: {
          embedding: {
            vector,
            // Over-fetch generously so filtering out the shown verses + the seed
            // chapter can't shrink us below `size`.
            k: size + excludeRefs.length + 40,
            filter: {
              bool: {
                filter: [{ term: { translationId: params.translationId } }],
                must_not: mustNot,
              },
            },
          },
        },
      },
    });
    return res.hits.hits.flatMap((hit) =>
      hit._source ? [toHit(hit._source)] : [],
    );
  }

  if (!like) {
    return [];
  }
  // Lexical fallback: more_like_this over verse text (shared significant terms).
  const res = await osSearch<VerseSource>({
    index: VERSE_INDEX,
    size,
    _source: VERSE_SOURCE_FIELDS,
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
        must_not: mustNot,
      },
    },
  });
  return res.hits.hits.flatMap((hit) =>
    hit._source ? [toHit(hit._source)] : [],
  );
}
