// One-time backfill for upload descriptions that were stored as raw HTML by the
// RSS import scraper. The web render pipeline (remark/rehype, no
// allowDangerousHtml) drops raw-HTML blocks, so those descriptions render as
// "No description available" even though the text is still in the DB.
//
// The raw HTML is recovered from `UploadRecord.description` itself — it was
// never lost, just unrenderable. We scope to import-sourced rows by joining
// through `ImportHistory.uploadRecordId` so human-authored descriptions (which
// may legitimately contain a `<`) are never touched. `htmlToMarkdown` is
// idempotent on already-clean text, so re-running this is safe.
//
//   just backfill-html-descriptions

import { db, ImportHistory, UploadRecord } from '@letschurch/db';
import { htmlToMarkdown } from '@letschurch/temporal/util/import/html-to-markdown';
import { eq, isNotNull } from 'drizzle-orm';

const HTML_TAG = /<\/?[a-z][^>]*>/i;

const rows = await db
  .selectDistinct({
    id: UploadRecord.id,
    description: UploadRecord.description,
  })
  .from(UploadRecord)
  .innerJoin(ImportHistory, eq(ImportHistory.uploadRecordId, UploadRecord.id))
  .where(isNotNull(UploadRecord.description));

let updated = 0;
let skipped = 0;

for (const row of rows) {
  const description = row.description;
  if (!description || !HTML_TAG.test(description)) {
    skipped += 1;
    continue;
  }

  const markdown = htmlToMarkdown(description);
  if (markdown === description) {
    skipped += 1;
    continue;
  }

  await db
    .update(UploadRecord)
    .set({ description: markdown, updatedAt: new Date() })
    .where(eq(UploadRecord.id, row.id));
  updated += 1;
  console.log(`[backfill-html-descriptions] ${row.id} updated`);
}

console.log(
  `[backfill-html-descriptions] done: ${updated} updated, ${skipped} skipped (${rows.length} import-sourced rows scanned)`,
);
process.exit(0);
