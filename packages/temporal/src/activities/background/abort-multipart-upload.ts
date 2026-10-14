import { getLocation } from '@letschurch/s3/locations';

import { locationFromArg } from '../../storage/legacy';

export default async function abortMultipartUploadAction(
  uploadId: string,
  uploadKey: string,
  // Absent for workflows started before storage locations existed.
  storageLocation?: string,
) {
  await getLocation(
    locationFromArg(storageLocation),
  ).ingest.abortMultipartUpload(uploadId, uploadKey);
}
