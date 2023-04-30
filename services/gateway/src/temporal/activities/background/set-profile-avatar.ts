import prisma from '../../../util/prisma';
import { deleteFile } from '../../../util/s3';

export default async function setProfileAvatar(
  userId: string,
  path: string,
  blurhash: string,
) {
  const { avatarPath: oldPath } = await prisma.appUser.findUniqueOrThrow({
    where: { id: userId },
    select: { avatarPath: true },
  });

  if (oldPath) {
    await deleteFile('PUBLIC', oldPath);
  }

  await prisma.appUser.update({
    where: { id: userId },
    data: { avatarPath: path, avatarBlurhash: blurhash },
  });
}
