import prisma from '../../../util/prisma';
import { deleteFile, S3_PUBLIC_BUCKET } from '../../../util/s3';

export default async function setProfileAvatar(
  userId: string,
  path: string,
  blurhash: string,
) {
  const { avatarUrl: oldPath } = await prisma.appUser.findUniqueOrThrow({
    where: { id: userId },
  });

  if (oldPath) {
    await deleteFile(S3_PUBLIC_BUCKET, oldPath);
  }

  await prisma.appUser.update({
    where: { id: userId },
    data: { avatarUrl: path, avatarBlurhash: blurhash },
  });
}
