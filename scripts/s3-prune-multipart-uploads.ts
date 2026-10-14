import {
  AbortMultipartUploadCommand,
  ListMultipartUploadsCommand,
} from '@aws-sdk/client-s3';
import { listLocations } from '@letschurch/s3/locations';

// Abort every in-progress multipart upload in every configured storage
// location's ingest bucket. Locations are discovered from STORAGE_<ID>_* env
// keys (see packages/s3/README.md#storage-locations).

const locations = listLocations().filter(
  (location) => location.configured.INGEST,
);

if (locations.length === 0) {
  console.error(
    'No storage locations with an ingest bucket are configured (STORAGE_<ID>_INGEST_*).',
  );
  process.exit(1);
}

for (const location of locations) {
  const ingest = location.ingest;
  const client = ingest.getS3Client();
  const bucket = ingest.getBucket();
  console.log(`[${location.id}] Listing multipart uploads in ${bucket}`);

  let keyMarker: string | undefined;
  let uploadIdMarker: string | undefined;
  let total = 0;

  do {
    const page = await client.send(
      new ListMultipartUploadsCommand({
        Bucket: bucket,
        KeyMarker: keyMarker,
        UploadIdMarker: uploadIdMarker,
      }),
    );

    for (const { Key, UploadId } of page.Uploads ?? []) {
      console.log(`[${location.id}] Aborting upload ${Key} (${UploadId})`);
      await client.send(
        new AbortMultipartUploadCommand({ Bucket: bucket, Key, UploadId }),
      );
      total += 1;
    }

    keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
    uploadIdMarker = page.IsTruncated ? page.NextUploadIdMarker : undefined;
  } while (keyMarker);

  console.log(`[${location.id}] Aborted ${total} uploads`);
}

console.log('Done');
