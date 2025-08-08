import db from '@/util/db';
import { deleteFile } from '../../../util/s3';

export default async function setProfileAvatar(
  userId: string,
  path: string,
  blurhash: string,
) {
  const { avatarPath: oldPath } = await db.appUser.findUniqueOrThrow({
    where: { id: userId },
    select: { avatarPath: true },
  });

  if (oldPath) {
    await deleteFile('PUBLIC', oldPath);
  }

  await db.appUser.update({
    where: { id: userId },
    data: { avatarPath: path, avatarBlurhash: blurhash },
  });
}
