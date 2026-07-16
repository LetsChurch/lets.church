// One document per (translation, verse). `text` is dual-analyzed: the top-level
// field uses the `english` analyzer (stemming → recall for phrase/topic queries)
// while `text.exact` uses the `standard` analyzer so exact phrasing scores
// higher (matches the "exact matches win" relevance preference). The mapping
// objects are loosely typed (OpenSearch's client types are thin; the shapes are
// validated by the cluster on push).
export const verseSettings: Record<string, unknown> = {
  number_of_replicas: 0,
  // Enable approximate kNN (HNSW) for the `embedding` field. Unlike the web
  // app's ~7.86M nested paragraph vectors (whose faiss graph OOM'd the pod), a
  // translation is only ~31k FLAT verse vectors — a tiny graph — so ANN here is
  // safe and fast. Static setting: it must be set at index-creation time, so
  // adding it means a new index version (see VERSE_INDEX) + reindex.
  'index.knn': true,
};

// oxlint-disable-next-line typescript/no-explicit-any -- OpenSearch's mapping-property types are thin; `any` lets these literals satisfy putMapping, and the cluster validates the shape on push (see above).
export const verseProperties: Record<string, any> = {
  translationId: { type: 'keyword' },
  book: { type: 'keyword' }, // USFM code, e.g. JHN
  slug: { type: 'keyword' }, // url slug, e.g. john
  name: { type: 'keyword' }, // display name, e.g. John
  testament: { type: 'keyword' }, // OT | NT
  chapter: { type: 'integer' },
  verse: { type: 'integer' },
  ref: { type: 'keyword' }, // canonical, e.g. JHN.3.16
  ordinal: { type: 'integer' }, // global canonical order
  // Common Crawl appearance count (seed/popularity.json), as a `rank_feature`
  // so a `rank_feature` query can add a bounded, saturating boost — a
  // more-quoted verse edges out an equally-good text match. Omitted on verses
  // with no popularity data (a rank_feature only boosts docs that have the
  // field; those get no popularity boost).
  popularity: { type: 'rank_feature' },
  text: {
    type: 'text',
    analyzer: 'english',
    fields: {
      exact: { type: 'text', analyzer: 'standard' },
    },
  },
  // Dense semantic vector of the verse text (OpenAI text-embedding-3-large).
  // Powers the semantic half of hybrid search so paraphrases with little lexical
  // overlap ("they meant bad but God meant good" → Genesis 50:20) still match.
  // `cosinesimil` matches the model's cosine space; omitted on docs indexed
  // without an API key, in which case hybrid search degrades to lexical-only.
  // `dimension` MUST equal EMBED_DIMS in ai/embed.ts (3072 for 3-large).
  embedding: {
    type: 'knn_vector',
    dimension: 3072,
    space_type: 'cosinesimil',
    method: { name: 'hnsw', engine: 'faiss' },
  },
};

// A verse's `embedding` is only present when the indexer had an OpenAI key.
// Exported so index-verses.ts and search.ts share the dimension constant.
export const EMBEDDING_FIELD = 'embedding';

// --- Passage (thought-unit) index ---------------------------------------------
// One document per translator paragraph (a multi-verse reading block). Like the
// verse index it enables approximate kNN — the passage corpus is even smaller
// (~19k paragraphs across BSB/MSB/WEB, vs ~124k verses), so the HNSW graph is
// tiny and ANN is safe.
export const passageSettings: Record<string, unknown> = {
  number_of_replicas: 0,
  'index.knn': true,
};

// oxlint-disable-next-line typescript/no-explicit-any -- OpenSearch's mapping-property types are thin; `any` lets these literals satisfy putMapping, and the cluster validates the shape on push.
export const passageProperties: Record<string, any> = {
  translationId: { type: 'keyword' },
  book: { type: 'keyword' }, // USFM code, e.g. GAL
  slug: { type: 'keyword' }, // url slug, e.g. galatians
  name: { type: 'keyword' }, // display name, e.g. Galatians
  testament: { type: 'keyword' }, // OT | NT
  chapter: { type: 'integer' },
  startVerse: { type: 'integer' },
  endVerse: { type: 'integer' },
  // Passage key: `${book}.${chapter}.${startVerse}-${endVerse}` (e.g.
  // GAL.5.22-23). Translation-independent shape, so the same thought across
  // translations shares a ref and can be collapsed.
  ref: { type: 'keyword' },
  // Global canonical order of the passage's FIRST verse — orders results + the
  // committed-embedding artifact deterministically.
  ordinal: { type: 'integer' },
  // The concatenated verse text of the whole paragraph. Dual-analyzed like the
  // verse index (english for recall, standard `.exact` for verbatim scoring).
  text: {
    type: 'text',
    analyzer: 'english',
    fields: {
      exact: { type: 'text', analyzer: 'standard' },
    },
  },
  // Dense semantic vector of the WHOLE paragraph (OpenAI text-embedding-3-large,
  // same 3072-d space as verses). Omitted when indexed without an API key /
  // artifact (the passage lane then simply contributes nothing).
  embedding: {
    type: 'knn_vector',
    dimension: 3072,
    space_type: 'cosinesimil',
    method: { name: 'hnsw', engine: 'faiss' },
  },
};
