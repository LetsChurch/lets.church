import type { z } from 'zod';

import { getThumbnailResize, type ThumbnailSize } from '@/schemas/common';
import { imageUrl } from '@/util/server-env';

/**
 * Resolves a thumbnail URL with fallback to channel default thumbnail.
 * Resolution order:
 * 1. Upload's override (manually uploaded) thumbnail
 * 2. Upload's default (auto-generated) thumbnail
 * 3. Channel's default thumbnail
 *
 * The upload's own thumbnails live at the record's `storageLocation`; the
 * channel default lives at the channel's `defaultThumbnailLocation`.
 *
 * @param options - Thumbnail resolution options
 * @param options.storageLocation - The upload record's storage location
 * @param options.overrideThumbnailPath - Manually uploaded thumbnail path
 * @param options.defaultThumbnailPath - Auto-generated thumbnail path
 * @param options.channelDefaultThumbnailPath - Channel's default thumbnail path
 * @param options.channelDefaultThumbnailLocation - Its storage location
 * @param options.size - Thumbnail size preset
 * @returns Resolved thumbnail URL or null if no thumbnails available
 */
export function resolveThumbnailUrl({
  storageLocation,
  overrideThumbnailPath,
  defaultThumbnailPath,
  channelDefaultThumbnailPath,
  channelDefaultThumbnailLocation,
  size,
}: {
  storageLocation?: string | null;
  overrideThumbnailPath?: string | null;
  defaultThumbnailPath?: string | null;
  channelDefaultThumbnailPath?: string | null;
  channelDefaultThumbnailLocation?: string | null;
  size: z.infer<typeof ThumbnailSize>;
}): string | null {
  const resize = getThumbnailResize(size);
  const own = overrideThumbnailPath ?? defaultThumbnailPath;
  if (own && storageLocation) {
    return imageUrl(storageLocation, own, resize);
  }
  return imageUrl(
    channelDefaultThumbnailLocation,
    channelDefaultThumbnailPath,
    resize,
  );
}
