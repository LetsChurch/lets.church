import { GetObjectCommand, PutObjectCommand, S3 } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import envariant from '@knpwrs/envariant';

const S3_REGION = envariant('S3_REGION');
const S3_ENDPOINT = envariant('S3_ENDPOINT');
const S3_BUCKET = envariant('S3_BUCKET');
const S3_ACCESS_KEY_ID = envariant('S3_ACCESS_KEY_ID');
const S3_SECRET_ACCESS_KEY = envariant('S3_SECRET_ACCESS_KEY');

export const client = new S3({
  region: S3_REGION,
  endpoint: S3_ENDPOINT,
  credentials: {
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
  },
});

// TODO: multipart upload
export async function createPresignedUploadUrl(
  key: string,
  contentType: string,
) {
  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: 5 * 60 },
  );
}

export async function createPresignedGetUrl(key: string) {
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    }),
    { expiresIn: 60 * 60 },
  );
}

export async function headObject(key: string) {
  try {
    return await client.headObject({
      Bucket: S3_BUCKET,
      Key: key,
    });
  } catch (e) {
    return null;
  }
}
