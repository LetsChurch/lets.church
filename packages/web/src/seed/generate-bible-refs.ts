// One-time bootstrap that re-indexes each LLM-seeded upload into lc_media_v1 so
// the doc-level `bibleRefs` (verse facet) and `bibleBooks` (book facet) fields
// get populated from existing BIBLE annotations. Use this after adding the
// scripture facets to a DB that was already seeded — cheaper than a full
// `LIVE_PIPELINE=1` reseed, and both fields are derived at index time from the
// annotations already in the DB, so nothing needs re-generating or dumping.
//
// `indexDocument` reads annotations straight from the DB, so when run against a
// freshly seeded snapshot DB the verses come from the same `seed-data/llm/*`
// annotations the live post-annotate path would produce.
//
// Flow:
//   just seed                      # baseline from existing snapshots
//   just os-push-mappings          # add the `bibleRefs` keyword field
//   just generate-seed-bible-refs  # this script — re-index media docs
//
// In production this corresponds to a full media re-index (every upload), not
// just the seed corpus.

import indexDocument from '@letschurch/temporal/activities/background/index-document';
import { LLM_SEEDED_UPLOAD_IDS } from './llm-seed';

let succeeded = 0;
let failed = 0;
for (const uploadId of LLM_SEEDED_UPLOAD_IDS) {
  console.log(`[bible-refs] ${uploadId} …`);
  try {
    await indexDocument('media', uploadId);
    console.log(`[bible-refs] ${uploadId} done`);
    succeeded += 1;
  } catch (err) {
    console.error(`[bible-refs] ${uploadId} FAILED:`, err);
    failed += 1;
  }
}

console.log(`[bible-refs] done: ${succeeded} succeeded, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
