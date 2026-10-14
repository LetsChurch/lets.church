import { db, Organization } from '@letschurch/db';
import { getLocation } from '@letschurch/s3/locations';
import { eq } from 'drizzle-orm';
import { invariant } from 'es-toolkit';

import { locationFromArg } from '../../storage/legacy';

export default async function setOrganizationCover(
  organizationId: string,
  path: string,
  _blurhash: string,
  // Absent for workflows started before storage locations existed.
  storageLocation?: string,
) {
  const row = await db
    .select({
      oldPath: Organization.coverPath,
      oldLocation: Organization.coverLocation,
    })
    .from(Organization)
    .where(eq(Organization.id, organizationId))
    .then((r) => r[0]);

  invariant(row, `Organization ${organizationId} not found`);

  await db
    .update(Organization)
    .set({
      coverPath: path,
      coverLocation: locationFromArg(storageLocation),
      updatedAt: new Date(),
    })
    .where(eq(Organization.id, organizationId));

  if (row.oldPath && row.oldPath !== path) {
    await getLocation(locationFromArg(row.oldLocation)).public.deleteFile(
      row.oldPath,
    );
  }
}
