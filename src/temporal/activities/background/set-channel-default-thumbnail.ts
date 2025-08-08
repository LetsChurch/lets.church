import db from '@/util/db';
import { deleteFile } from '../../../util/s3';

export default async function setChannelDefaultThumbnail(
  channelid: string,
  path: string,
  blurhash: string,
) {
  const { defaultThumbnailPath: oldPath } = await db.channel.findUniqueOrThrow({
    where: { id: channelid },
    select: { defaultThumbnailPath: true },
  });

  if (oldPath) {
    await deleteFile('PUBLIC', oldPath);
  }

  await db.channel.update({
    where: { id: channelid },
    data: { defaultThumbnailPath: path, defaultThumbnailBlurhash: blurhash },
  });
}
