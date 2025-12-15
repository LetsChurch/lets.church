import { prisma } from '@letschurch/db';
import { publicS3 } from '@letschurch/s3/public';

export default async function setChannelAvatar(
  channelid: string,
  path: string,
  blurhash: string,
) {
  const { avatarPath: oldPath } = await prisma.channel.findUniqueOrThrow({
    where: { id: channelid },
    select: { avatarPath: true },
  });

  if (oldPath) {
    await publicS3.deleteFile(oldPath);
  }

  await prisma.channel.update({
    where: { id: channelid },
    data: { avatarPath: path, avatarBlurhash: blurhash },
  });
}
