import { db } from '@letschurch/db';

// True once a recording has been imported onto the upload record (its source
// file is staged in ingest S3). Used by muxImportRecordingWorkflow to make the
// import idempotent so the 1-day fallback no-ops when the primary already ran.
export default async function isUploadFinalized(
  uploadRecordId: string,
): Promise<boolean> {
  const rec = await db.query.UploadRecord.findFirst({
    columns: { finalizedUploadKey: true },
    where: (t, { eq }) => eq(t.id, uploadRecordId),
  });
  return Boolean(rec?.finalizedUploadKey);
}
