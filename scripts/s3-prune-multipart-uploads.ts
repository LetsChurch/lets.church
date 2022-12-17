import envariant from '@knpwrs/envariant';
import {
  S3Client,
  ListMultipartUploadsCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';

const client = new S3Client({
  region: envariant('S3_INGEST_REGION'),
  endpoint: envariant('S3_INGEST_ENDPOINT'),
  credentials: {
    accessKeyId: envariant('S3_INGEST_ACCESS_KEY_ID'),
    secretAccessKey: envariant('S3_INGEST_SECRET_ACCESS_KEY'),
  },
});

const bucket = envariant('S3_BUCKET');

const { Uploads: uploads = [] } = await client.send(
  new ListMultipartUploadsCommand({ Bucket: bucket }),
);

console.log(`Found ${uploads.length} uploads`);

for (const { Key, UploadId } of uploads) {
  console.log(`Aborting upload ${Key} (${UploadId})`);
  await client.send(
    new AbortMultipartUploadCommand({
      Bucket: bucket,
      Key,
      UploadId,
    }),
  );
  console.log('Done');
}

console.log('Done done');
