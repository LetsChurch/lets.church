import { prisma } from '@letschurch/db';
import { publicS3 } from '@letschurch/s3/public';

export default async function setChannelCover(
  channelid: string,
  path: string,
  blurhash: string,
) {
  const { coverPath: oldPath } = await prisma.channel.findUniqueOrThrow({
    where: { id: channelid },
    select: { coverPath: true },
  });

  if (oldPath) {
    await publicS3.deleteFile(oldPath);
  }

  await prisma.channel.update({
    where: { id: channelid },
    data: { coverPath: path, coverBlurhash: blurhash },
  });
}
