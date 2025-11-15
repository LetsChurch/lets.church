import { prisma } from '@letschurch/db';
import { publicS3 } from '../../util/s3';

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
    await publicS3.deleteFile(oldPath);
  }

  await prisma.organization.update({
    where: { id: organizationId },
    data: { avatarPath: path },
  });
}
