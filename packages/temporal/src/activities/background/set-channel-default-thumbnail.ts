import { prisma } from '@letschurch/db';
import { publicS3 } from '../../util/s3';

export default async function setChannelDefaultThumbnail(
  channelid: string,
  path: string,
  blurhash: string,
) {
  const { defaultThumbnailPath: oldPath } =
    await prisma.channel.findUniqueOrThrow({
      where: { id: channelid },
      select: { defaultThumbnailPath: true },
    });

  if (oldPath) {
    await publicS3.deleteFile(oldPath);
  }

  await prisma.channel.update({
    where: { id: channelid },
    data: { defaultThumbnailPath: path, defaultThumbnailBlurhash: blurhash },
  });
}
