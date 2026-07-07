import { db, UploadView } from '@letschurch/db';
import type { MediaSegment } from '@letschurch/opensearch';
import { publicS3 } from '@letschurch/s3/public';
import { count, inArray } from 'drizzle-orm';

import { OutgoingIdSchema } from '@/schemas/common';
import { appAvatarXs2x } from '@/util/avatar-sizes';
import { getPublicImageUrl } from '@/util/server-env';
import { resolveThumbnailUrl } from '@/util/thumbnails';

/**
 * Hydrate Elasticsearch upload hits into the shape the search UI renders.
 * Elasticsearch is the relevance source of truth; the DB is the data source of
 * truth. Preserves the incoming `uploadIds` order (the ES ranking), filters to
 * public + approved channels, attaches view counts, thumbnails, channel
 * avatars, and — when provided — matched transcript `segments` per upload.
 *
 * Mirrors the media branch of `performSearch`; the new hybrid search path uses
 * this so the two don't drift. `segmentsByUploadId` times are expected already
 * in milliseconds (the lc_media paragraph seconds are converted upstream).
 */
export async function hydrateUploads(
  uploadIds: string[],
  segmentsByUploadId?: Map<string, MediaSegment[]>,
) {
  if (uploadIds.length === 0) return [];

  const [uploads, viewCountRows] = await Promise.all([
    db.query.UploadRecord.findMany({
      where: (t, { inArray: inArr, and, isNotNull }) =>
        and(inArr(t.id, uploadIds), isNotNull(t.transcodingFinishedAt)),
      columns: {
        id: true,
        title: true,
        description: true,
        createdAt: true,
        publishedAt: true,
        lengthSeconds: true,
        defaultThumbnailPath: true,
        overrideThumbnailPath: true,
      },
      with: {
        channel: {
          columns: {
            id: true,
            name: true,
            slug: true,
            avatarPath: true,
            defaultThumbnailPath: true,
            visibility: true,
            approvedAt: true,
          },
        },
      },
    }),
    db
      .select({ uploadRecordId: UploadView.uploadRecordId, cnt: count() })
      .from(UploadView)
      .where(inArray(UploadView.uploadRecordId, uploadIds))
      .groupBy(UploadView.uploadRecordId),
  ]);

  const viewCountMap = new Map(
    viewCountRows.map((r) => [r.uploadRecordId, Number(r.cnt)]),
  );

  const uploadsMap = new Map(
    uploads
      .filter(
        (u) =>
          u.channel.visibility === 'PUBLIC' && u.channel.approvedAt !== null,
      )
      .map((u) => [u.id, u]),
  );

  return uploadIds
    .map((id) => uploadsMap.get(id))
    .filter((u): u is NonNullable<typeof u> => Boolean(u))
    .map((upload) => {
      const {
        defaultThumbnailPath,
        overrideThumbnailPath,
        channel,
        ...uploadRest
      } = upload;

      const thumbnailUrl = resolveThumbnailUrl({
        overrideThumbnailPath,
        defaultThumbnailPath,
        channelDefaultThumbnailPath: channel.defaultThumbnailPath,
        size: 'card',
      });

      const channelAvatarUrl = channel.avatarPath
        ? getPublicImageUrl(publicS3.getS3ProtocolUri(channel.avatarPath), {
            resize: appAvatarXs2x,
          })
        : null;

      return {
        ...uploadRest,
        id: OutgoingIdSchema.parse(uploadRest.id),
        thumbnailUrl,
        _count: { uploadViews: viewCountMap.get(upload.id) ?? 0 },
        channel: {
          ...channel,
          id: OutgoingIdSchema.parse(channel.id),
          avatarUrl: channelAvatarUrl,
        },
        segments: segmentsByUploadId?.get(upload.id) ?? [],
      };
    });
}
