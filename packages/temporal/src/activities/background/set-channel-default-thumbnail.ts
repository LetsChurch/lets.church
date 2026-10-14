import { Channel, db } from '@letschurch/db';
import { getLocation } from '@letschurch/s3/locations';
import { eq } from 'drizzle-orm';
import { invariant } from 'es-toolkit';

import { locationFromArg } from '../../storage/legacy';

export default async function setChannelDefaultThumbnail(
  channelId: string,
  path: string,
  blurhash: string,
  // Absent for workflows started before storage locations existed.
  storageLocation?: string,
) {
  const row = await db
    .select({
      oldPath: Channel.defaultThumbnailPath,
      oldLocation: Channel.defaultThumbnailLocation,
    })
    .from(Channel)
    .where(eq(Channel.id, channelId))
    .then((r) => r[0]);

  invariant(row, `Channel ${channelId} not found`);

  await db
    .update(Channel)
    .set({
      defaultThumbnailPath: path,
      defaultThumbnailLocation: locationFromArg(storageLocation),
      defaultThumbnailBlurhash: blurhash,
      updatedAt: new Date(),
    })
    .where(eq(Channel.id, channelId));

  if (row.oldPath && row.oldPath !== path) {
    await getLocation(locationFromArg(row.oldLocation)).public.deleteFile(
      row.oldPath,
    );
  }
}
