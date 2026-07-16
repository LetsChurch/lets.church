// Create (if missing) and update the lets.bible search index mappings. Mirrors
// the DB-migration step but for OpenSearch. Run via `just lb-es-push`
// (or `pnpm run es:push-mappings`).

import {
  client,
  HYBRID_PIPELINE,
  PASSAGE_INDEX,
  VERSE_INDEX,
  waitForOpenSearch,
} from './client';
import {
  passageProperties,
  passageSettings,
  verseProperties,
  verseSettings,
} from './mappings';

await waitForOpenSearch();

// Fusion pipeline for the `hybrid` verse query (lexical bool + semantic knn).
// Score-normalized fusion (magnitude > rank), NOT rank-based RRF: min-max
// normalize each branch to [0,1] then take a weighted arithmetic mean. Weights
// lean SEMANTIC (0.4 lexical / 0.6 semantic) so paraphrases with little lexical
// overlap surface prominently — precise queries are unaffected because the
// lexical branch's exact-phrase boost (×5) keeps its normalized score ~1.0, so
// verbatim/reference matches still rank #1 even at this weighting (verified:
// "fruit of the Spirit" → Galatians 5:22 #1). Weights are the two hybrid
// sub-queries, in order.
await client.transport.request({
  method: 'PUT',
  path: `/_search/pipeline/${HYBRID_PIPELINE}`,
  body: {
    description:
      'lets.bible hybrid verse search: min-max normalize + weighted arithmetic mean (lexical-biased)',
    phase_results_processors: [
      {
        'normalization-processor': {
          normalization: { technique: 'min_max' },
          combination: {
            technique: 'arithmetic_mean',
            parameters: { weights: [0.4, 0.6] },
          },
        },
      },
    ],
  },
});
console.log(`Pushed search pipeline ${HYBRID_PIPELINE}.`);

// Idempotent + non-destructive: create the index (with static settings like
// `index.knn`) only if it's missing, otherwise just apply additive mapping
// updates. Static settings and incompatible mapping changes CAN'T be applied to
// a live index — for those, destroy the index first (done manually before the
// deploy that needs them, then this recreates it fresh and `es:index-verses`
// repopulates). So a normal deploy leaves an existing index untouched.
const exists = (await client.indices.exists({ index: VERSE_INDEX })).body;
if (!exists) {
  console.log(`Creating index ${VERSE_INDEX}`);
  await client.indices.create({
    index: VERSE_INDEX,
    body: {
      settings: verseSettings,
      mappings: { properties: verseProperties },
    },
  });
} else {
  await client.indices.putMapping({
    index: VERSE_INDEX,
    body: { properties: verseProperties },
  });
}

console.log(`Pushed mappings for ${VERSE_INDEX}.`);

// The passage (thought-unit) index — same idempotent create-or-update as above.
const passageExists = (await client.indices.exists({ index: PASSAGE_INDEX }))
  .body;
if (!passageExists) {
  console.log(`Creating index ${PASSAGE_INDEX}`);
  await client.indices.create({
    index: PASSAGE_INDEX,
    body: {
      settings: passageSettings,
      mappings: { properties: passageProperties },
    },
  });
} else {
  await client.indices.putMapping({
    index: PASSAGE_INDEX,
    body: { properties: passageProperties },
  });
}
console.log(`Pushed mappings for ${PASSAGE_INDEX}.`);
process.exit(0);
