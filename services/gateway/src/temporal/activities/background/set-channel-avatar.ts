import prisma from '../../../util/prisma';
import { deleteFile, S3_PUBLIC_BUCKET } from '../../../util/s3';

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
    await deleteFile(S3_PUBLIC_BUCKET, oldPath);
  }

  await prisma.channel.update({
    where: { id: channelid },
    data: { avatarPath: path, avatarBlurhash: blurhash },
  });
}
