// One-time backfill for storage-location caps: measure each processed upload's
// public prefix (`{id}/` in its location's public bucket) and record it as
// upload_record.public_size_bytes. New uploads are measured by
// processMediaWorkflow; this covers everything transcoded before that existed.
// Idempotent — only rows with no measurement are visited — so it's safe to
// interrupt and re-run.
//
//   just backfill-public-sizes
//   (prod: run `pnpm --filter @letschurch/web run backfill-public-sizes` in a
//   web pod)

import { db, UploadRecord } from "@letschurch/db";
import { measurePrefixBytes } from "@letschurch/temporal/storage/usage";
import { and, asc, eq, gt, isNotNull, isNull } from "drizzle-orm";

const BATCH = 200;
const CONCURRENCY = Number(process.env.BACKFILL_CONCURRENCY ?? 8);

let cursor: string | null = null;
let measured = 0;
let failed = 0;
let bytes = 0n;

for (;;) {
  const rows: Array<{ id: string; storageLocation: string }> = await db
    .select({ id: UploadRecord.id, storageLocation: UploadRecord.storageLocation })
    .from(UploadRecord)
    .where(
      and(
        isNull(UploadRecord.publicSizeBytes),
        isNotNull(UploadRecord.transcodingFinishedAt),
        cursor ? gt(UploadRecord.id, cursor) : undefined,
      ),
    )
    .orderBy(asc(UploadRecord.id))
    .limit(BATCH);
  if (rows.length === 0) break;

  const queue = [...rows];
  const measure = async (row: (typeof rows)[number]) => {
    try {
      const result = await measurePrefixBytes(row.storageLocation, "PUBLIC", `${row.id}/`);
      await db
        .update(UploadRecord)
        .set({ publicSizeBytes: result.bytes, publicReservedBytes: null })
        .where(eq(UploadRecord.id, row.id));
      measured += 1;
      bytes += result.bytes;
    } catch (err) {
      failed += 1;
      console.error(`Failed to measure ${row.id}:`, err);
    }
  };
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let row = queue.shift(); row; row = queue.shift()) {
        await measure(row);
      }
    }),
  );

  cursor = rows.at(-1)?.id ?? cursor;
  console.log(`Measured ${measured} uploads (${bytes} bytes), ${failed} failed; last ${cursor}`);
}

console.log(`Done: ${measured} measured, ${failed} failed, ${bytes} bytes total`);
process.exit(failed > 0 ? 1 : 0);
