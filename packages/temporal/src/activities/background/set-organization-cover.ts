import { db, Organization } from '@letschurch/db';
import { publicS3 } from '@letschurch/s3/public';
import { eq } from 'drizzle-orm';
import { invariant } from 'es-toolkit';

export default async function setOrganizationCover(
  organizationId: string,
  path: string,
  _blurhash: string,
) {
  const row = await db
    .select({ coverPath: Organization.coverPath })
    .from(Organization)
    .where(eq(Organization.id, organizationId))
    .then((r) => r[0]);

  invariant(row, `Organization ${organizationId} not found`);
  const { coverPath: oldPath } = row;

  if (oldPath) {
    await publicS3.deleteFile(oldPath);
  }

  await db
    .update(Organization)
    .set({ coverPath: path, updatedAt: new Date() })
    .where(eq(Organization.id, organizationId));
}
