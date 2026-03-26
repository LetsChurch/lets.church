import { db, Organization } from '@letschurch/db';
import { publicS3 } from '@letschurch/s3/public';
import { eq } from 'drizzle-orm';
import { invariant } from 'es-toolkit';

export default async function setOrganizationAvatar(
  organizationId: string,
  path: string,
  _blurhash: string,
) {
  const row = await db
    .select({ avatarPath: Organization.avatarPath })
    .from(Organization)
    .where(eq(Organization.id, organizationId))
    .then((r) => r[0]);

  invariant(row, `Organization ${organizationId} not found`);
  const { avatarPath: oldPath } = row;

  if (oldPath) {
    await publicS3.deleteFile(oldPath);
  }

  await db
    .update(Organization)
    .set({ avatarPath: path, updatedAt: new Date() })
    .where(eq(Organization.id, organizationId));
}
