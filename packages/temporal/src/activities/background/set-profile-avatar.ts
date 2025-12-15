import { prisma } from '@letschurch/db';
import { publicS3 } from '@letschurch/s3/public';

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
    await publicS3.deleteFile(oldPath);
  }

  await prisma.appUser.update({
    where: { id: userId },
    data: { avatarPath: path, avatarBlurhash: blurhash },
  });
}
