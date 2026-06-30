// One document per (translation, verse). `text` is dual-analyzed: the top-level
// field uses the `english` analyzer (stemming → recall for phrase/topic queries)
// while `text.exact` uses the `standard` analyzer so exact phrasing scores
// higher (matches the "exact matches win" relevance preference). The mapping
// objects are loosely typed (OpenSearch's client types are thin; the shapes are
// validated by the cluster on push).
export const verseSettings: Record<string, unknown> = {
  number_of_replicas: 0,
};

// biome-ignore lint/suspicious/noExplicitAny: OpenSearch's mapping-property types are thin; `any` lets these literals satisfy putMapping, and the cluster validates the shape on push (see above).
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
  text: {
    type: 'text',
    analyzer: 'english',
    fields: {
      exact: { type: 'text', analyzer: 'standard' },
    },
  },
};
