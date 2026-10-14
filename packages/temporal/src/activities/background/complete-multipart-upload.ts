import { getLocation } from '@letschurch/s3/locations';

import { locationFromArg } from '../../storage/legacy';

export default async function completeMultipartUploadAction(
  uploadId: string,
  uploadKey: string,
  eTags: Array<string>,
  // Absent for workflows started before storage locations existed.
  storageLocation?: string,
): Promise<string> {
  const { ingest } = getLocation(locationFromArg(storageLocation));
  await ingest.completeMultipartUpload(uploadId, uploadKey, eTags);

  // Return as string since Temporal cannot serialize bigint
  const { ContentLength } = await ingest.headObject(uploadKey);
  if (
    typeof ContentLength !== 'number' ||
    !Number.isFinite(ContentLength) ||
    ContentLength < 0
  ) {
    throw new Error(
      `HeadObject returned an invalid ContentLength for ${uploadKey}`,
    );
  }

  return String(ContentLength);
}
