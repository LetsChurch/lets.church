import type { z } from 'zod';
import { getThumbnailResize, type ThumbnailSize } from '@/schemas/common';
import { publicS3 } from '@/util/s3';
import { getPublicImageUrl } from '@/util/url';

/**
 * Resolves a thumbnail URL with fallback to channel default thumbnail.
 * Resolution order:
 * 1. Upload's override (manually uploaded) thumbnail
 * 2. Upload's default (auto-generated) thumbnail
 * 3. Channel's default thumbnail
 *
 * @param options - Thumbnail resolution options
 * @param options.overrideThumbnailPath - Manually uploaded thumbnail path
 * @param options.defaultThumbnailPath - Auto-generated thumbnail path
 * @param options.channelDefaultThumbnailPath - Channel's default thumbnail path
 * @param options.size - Thumbnail size preset
 * @returns Resolved thumbnail URL or null if no thumbnails available
 */
export function resolveThumbnailUrl({
  overrideThumbnailPath,
  defaultThumbnailPath,
  channelDefaultThumbnailPath,
  size,
}: {
  overrideThumbnailPath?: string | null;
  defaultThumbnailPath?: string | null;
  channelDefaultThumbnailPath?: string | null;
  size: z.infer<typeof ThumbnailSize>;
}): string | null {
  const thumbnailPath =
    overrideThumbnailPath ??
    defaultThumbnailPath ??
    channelDefaultThumbnailPath;

  return thumbnailPath
    ? getPublicImageUrl(
        publicS3.getS3ProtocolUri(thumbnailPath),
        getThumbnailResize(size),
      )
    : null;
}
