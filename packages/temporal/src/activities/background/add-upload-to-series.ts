import { db, UploadListEntry } from '@letschurch/db';

import logger from '../../util/logger';

const moduleLogger = logger.child({
  module: 'temporal/activities/background/add-upload-to-series',
});

/**
 * Place an imported upload in a series at a fixed rank. Idempotent, so it is
 * safe under activity retries and workflow replays. The starter resolved the
 * series against the channel already; this re-checks it (the series could have
 * been deleted or the upload could already be in another series by the time a
 * long download finishes) and skips rather than failing the import, since the
 * media itself landed fine.
 */
export default async function addUploadToSeries(
  uploadRecordId: string,
  seriesId: string,
  rank: number,
) {
  const [series, upload, otherSeries] = await Promise.all([
    db.query.UploadList.findFirst({
      columns: { id: true, channelId: true, type: true },
      where: (t, { eq }) => eq(t.id, seriesId),
    }),
    db.query.UploadRecord.findFirst({
      columns: { id: true, channelId: true },
      where: (t, { eq }) => eq(t.id, uploadRecordId),
    }),
    db.query.UploadListEntry.findFirst({
      columns: { uploadListId: true },
      with: { uploadList: { columns: { type: true } } },
      where: (t, { and, eq, ne }) =>
        and(eq(t.uploadRecordId, uploadRecordId), ne(t.uploadListId, seriesId)),
    }),
  ]);

  const log = moduleLogger.child({
    uploadId: uploadRecordId,
    context: { seriesId, rank },
  });

  if (!series || series.type !== 'SERIES' || !upload) {
    log.warn('Series or upload not found; not adding upload to series');
    return { added: false };
  }
  if (series.channelId !== upload.channelId) {
    log.warn('Series belongs to another channel; not adding upload to series');
    return { added: false };
  }
  if (otherSeries?.uploadList.type === 'SERIES') {
    log.warn('Upload already belongs to another series');
    return { added: false };
  }

  await db
    .insert(UploadListEntry)
    .values({ uploadListId: seriesId, uploadRecordId, rank })
    .onConflictDoUpdate({
      target: [UploadListEntry.uploadListId, UploadListEntry.uploadRecordId],
      set: { rank },
    });

  log.info('Added imported upload to series');
  return { added: true };
}
