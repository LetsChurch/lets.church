import { prisma } from '@/util/db';
import { deleteFile } from '../../../util/s3';

export default async function setOrganizationAvatar(
  organizationId: string,
  path: string,
  _blurhash: string,
) {
  const { avatarPath: oldPath } = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { avatarPath: true },
  });

  if (oldPath) {
    await deleteFile('PUBLIC', oldPath);
  }

  await prisma.organization.update({
    where: { id: organizationId },
    data: { avatarPath: path },
  });
}
