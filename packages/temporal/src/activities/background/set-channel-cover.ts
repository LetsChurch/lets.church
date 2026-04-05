import { Channel, db } from '@letschurch/db';
import { publicS3 } from '@letschurch/s3/public';
import { eq } from 'drizzle-orm';
import { invariant } from 'es-toolkit';

export default async function setChannelCover(
  channelid: string,
  path: string,
  blurhash: string,
) {
  const row = await db
    .select({ coverPath: Channel.coverPath })
    .from(Channel)
    .where(eq(Channel.id, channelid))
    .then((r) => r[0]);

  invariant(row, `Channel ${channelid} not found`);
  const { coverPath: oldPath } = row;

  if (oldPath) {
    await publicS3.deleteFile(oldPath);
  }

  await db
    .update(Channel)
    .set({ coverPath: path, coverBlurhash: blurhash, updatedAt: new Date() })
    .where(eq(Channel.id, channelid));
}
