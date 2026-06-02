// One-time bootstrap script that re-runs the new `summarizeUpload` activity
// against each LLM-seeded upload, then re-embeds the resulting summary +
// searchSummary. Use this when the summarize prompt changes (e.g. the
// YouTube-style sections rollout) and existing snapshots need refreshing
// without paying for a full `LIVE_PIPELINE=1` reseed.
//
// Reads OUTLINE annotations off whatever is currently in the DB — when run
// against a freshly seeded snapshot DB those annotations come straight from
// `seed-data/llm/*.json`, so summarize gets the same outline input the live
// post-annotate path would see.
//
// Flow:
//   just seed                          # baseline from existing snapshots
//   just generate-seed-summaries       # this script — re-summarize + re-embed
//   just dump-llm-seed-data            # capture into seed-data/llm/*.json
//   commit refreshed snapshots
//
// Both activities are plain async functions (no temporalio/activity runtime
// dependency) so we invoke them directly here, no Temporal workflow.

import embedUpload from '@letschurch/temporal/activities/background/embed-upload';
import summarizeUpload from '@letschurch/temporal/activities/background/summarize-upload';
import { LLM_SEEDED_UPLOAD_IDS } from './llm-seed';

let succeeded = 0;
let failed = 0;
for (const uploadId of LLM_SEEDED_UPLOAD_IDS) {
  console.log(`[summarize] ${uploadId} …`);
  try {
    // `force: true` on both so re-running this script after a prompt
    // change actually rewrites summary text AND the matching summary
    // embeddings. Skipping the embed force-flag would leave the old
    // vectors pointing at the new text — silent search-quality drift in
    // the next dump.
    await summarizeUpload(uploadId, { force: true });
    await embedUpload(uploadId, { force: true });
    console.log(`[summarize] ${uploadId} done`);
    succeeded += 1;
  } catch (err) {
    console.error(`[summarize] ${uploadId} FAILED:`, err);
    failed += 1;
  }
}

console.log(`[summarize] done: ${succeeded} succeeded, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
