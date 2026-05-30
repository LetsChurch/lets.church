// One-time bootstrap script that runs the new `annotateTranscript` activity
// against each LLM-seeded upload's already-seeded paragraphs. Use this when
// adding annotations to an existing dev DB that was seeded from snapshots —
// avoids paying for a full `LIVE_PIPELINE=1` refresh (re-summarize +
// re-embed everything) when only annotations are missing.
//
// Flow:
//   just seed                          # baseline from existing snapshots
//   just generate-seed-annotations     # this script — ~$0.18 × N uploads
//   just dump-llm-seed-data            # capture into seed-data/llm/*.json
//   commit refreshed snapshots
//
// The activity is a plain async function (no temporalio/activity runtime
// dependency) so we can invoke it directly here, no Temporal workflow.

import annotateTranscript from '@letschurch/temporal/activities/background/annotate-transcript';
import { LLM_SEEDED_UPLOAD_IDS } from './llm-seed';

let succeeded = 0;
let failed = 0;
for (const uploadId of LLM_SEEDED_UPLOAD_IDS) {
  console.log(`[annotate] ${uploadId} …`);
  try {
    // `force: true` so re-running this script after a prompt change
    // actually re-annotates; the activity's default idempotency check
    // would otherwise skip any upload that already has annotation rows.
    const res = await annotateTranscript(uploadId, { force: true });
    console.log(
      `[annotate] ${uploadId} done (${res.paragraphs} paragraphs → ` +
        `${res.outline} outline + ${res.bible} bible + ${res.keyword} keyword, ` +
        `${res.skipped} skipped)`,
    );
    succeeded += 1;
  } catch (err) {
    console.error(`[annotate] ${uploadId} FAILED:`, err);
    failed += 1;
  }
}

console.log(`[annotate] done: ${succeeded} succeeded, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
