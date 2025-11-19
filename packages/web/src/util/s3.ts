import {
  createS3Clients,
  getS3Client as getS3ClientBase,
  getS3ConfigFromEnv,
  type LcS3Client,
  PART_SIZE,
  type S3ClientId,
} from '@letschurch/s3';
import logger from './logger';

const { ingestS3, publicS3, backupS3 } = createS3Clients({
  ...getS3ConfigFromEnv(),
  logger: logger.child({ module: 'util/s3' }),
});

export { ingestS3, publicS3, backupS3, PART_SIZE };
export type { LcS3Client, S3ClientId };

export function getS3Client(clientId: S3ClientId): LcS3Client {
  return getS3ClientBase(clientId, ingestS3, publicS3, backupS3);
}
