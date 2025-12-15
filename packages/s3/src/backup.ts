import { z } from 'zod';
import { LcS3Client } from './index.js';

const env = z
  .object({
    S3_BACKUP_BUCKET: z.string(),
    S3_BACKUP_REGION: z.string(),
    S3_BACKUP_ENDPOINT: z.string(),
    S3_BACKUP_ACCESS_KEY_ID: z.string(),
    S3_BACKUP_SECRET_ACCESS_KEY: z.string(),
  })
  .parse(process.env);

export const backupS3 = new LcS3Client({
  bucket: env.S3_BACKUP_BUCKET,
  region: env.S3_BACKUP_REGION,
  endpoint: env.S3_BACKUP_ENDPOINT,
  accessKeyId: env.S3_BACKUP_ACCESS_KEY_ID,
  secretAccessKey: env.S3_BACKUP_SECRET_ACCESS_KEY,
  storageClass: 'DEEP_ARCHIVE',
});
