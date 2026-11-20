import { db, UploadRecord } from '@letschurch/db';
import { and, eq, isNull, lte, or } from 'drizzle-orm';

import logger from '../../util/logger';

const moduleLogger = logger.child({
  module: 'temporal/activities/background/set-upload-thumbnail',
});

/**
 * Install a processed custom thumbnail as the upload's override.
 *
 * `requestedAt` is when the editor asked for it (see uploadDoneSignal). If the editor made another thumbnail choice after that (picked a
 * frame or reset to the video/channel default) while this image was still
 * processing, that later choice wins and this one is discarded. Absent for
 * workflows started before this guard existed, which apply unconditionally.
 */
export default async function setUploadThumbnail(
  uploadRecordId: string,
  path: string,
  blurhash: string,
  requestedAt?: string | Date | null,
): Promise<{ applied: boolean }> {
  // Anything that isn't a real time (absent, null, unparseable) means "no
  // ordering": apply unguarded rather than compare against a bogus cutoff
  // (e.g. `new Date(null)` = 1970) that would silently discard the image.
  const parsed = requestedAt == null ? null : new Date(requestedAt);
  const requested = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;

  const updated = await db
    .update(UploadRecord)
    .set({
      overrideThumbnailPath: path,
      overrideThumbnailBlurhash: blurhash,
      // Kept so the editor can switch back to it after choosing another.
      customThumbnailPath: path,
      customThumbnailBlurhash: blurhash,
      useChannelDefaultThumbnail: false,
      ...(requested ? { thumbnailChosenAt: requested } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(UploadRecord.id, uploadRecordId),
        requested
          ? or(
              isNull(UploadRecord.thumbnailChosenAt),
              lte(UploadRecord.thumbnailChosenAt, requested),
            )
          : undefined,
      ),
    )
    .returning({ id: UploadRecord.id });

  const applied = updated.length > 0;
  if (!applied) {
    // The processed image stays in storage unreferenced, like a replaced
    // thumbnail does.
    moduleLogger.info(
      { uploadRecordId, context: { path, requestedAt } },
      'Discarded custom thumbnail: superseded by a later thumbnail choice, or the upload no longer exists',
    );
  }
  return { applied };
}
