import { Channel, db } from '@letschurch/db';
import { publicS3 } from '@letschurch/s3/public';
import { eq } from 'drizzle-orm';
import { invariant } from 'es-toolkit';

export default async function setChannelAvatar(
  channelid: string,
  path: string,
  blurhash: string,
) {
  const row = await db
    .select({ avatarPath: Channel.avatarPath })
    .from(Channel)
    .where(eq(Channel.id, channelid))
    .then((r) => r[0]);

  invariant(row, `Channel ${channelid} not found`);
  const { avatarPath: oldPath } = row;

  if (oldPath) {
    await publicS3.deleteFile(oldPath);
  }

  await db
    .update(Channel)
    .set({ avatarPath: path, avatarBlurhash: blurhash, updatedAt: new Date() })
    .where(eq(Channel.id, channelid));
}
