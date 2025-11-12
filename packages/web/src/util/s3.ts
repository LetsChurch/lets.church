import {
  createS3Clients,
  getS3Client as getS3ClientBase,
  type LcS3Client,
  PART_SIZE,
  parseS3Env,
  type S3ClientId,
} from '@letschurch/s3';
import logger from './logger';

const env = parseS3Env();

const { ingestS3, publicS3 } = createS3Clients({
  ingest: {
    bucket: env.S3_INGEST_BUCKET,
    region: env.S3_INGEST_REGION,
    endpoint: env.S3_INGEST_ENDPOINT,
    accessKeyId: env.S3_INGEST_ACCESS_KEY_ID,
    secretAccessKey: env.S3_INGEST_SECRET_ACCESS_KEY,
  },
  public: {
    bucket: env.S3_PUBLIC_BUCKET,
    region: env.S3_PUBLIC_REGION,
    endpoint: env.S3_PUBLIC_ENDPOINT,
    accessKeyId: env.S3_PUBLIC_ACCESS_KEY_ID,
    secretAccessKey: env.S3_PUBLIC_SECRET_ACCESS_KEY,
  },
  logger: logger.child({ module: 'util/s3' }),
});

export { ingestS3, publicS3, PART_SIZE };
export type { LcS3Client, S3ClientId };

export function getS3Client(clientId: S3ClientId): LcS3Client {
  return getS3ClientBase(clientId, ingestS3, publicS3);
}
