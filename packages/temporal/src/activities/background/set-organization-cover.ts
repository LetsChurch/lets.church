import { prisma } from '@letschurch/db';
import { publicS3 } from '@letschurch/s3/public';

export default async function setOrganizationCover(
  organizationId: string,
  path: string,
  _blurhash: string,
) {
  const { coverPath: oldPath } = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { coverPath: true },
  });

  if (oldPath) {
    await publicS3.deleteFile(oldPath);
  }

  await prisma.organization.update({
    where: { id: organizationId },
    data: { coverPath: path },
  });
}
