import { z } from 'zod';

import { LcS3Client } from './index.js';

const envSchema = z.object({
  S3_BACKUP_BUCKET: z.string(),
  S3_BACKUP_REGION: z.string(),
  S3_BACKUP_ENDPOINT: z.string(),
  S3_BACKUP_ACCESS_KEY_ID: z.string(),
  S3_BACKUP_SECRET_ACCESS_KEY: z.string(),
});

let client: LcS3Client | undefined;

// Validated on first use rather than on import, so processes that import a
// module touching backups but never call it (e.g. web routes) don't need
// the S3_BACKUP_* vars.
function getBackupClient(): LcS3Client {
  if (!client) {
    const env = envSchema.parse(process.env);
    client = new LcS3Client({
      bucket: env.S3_BACKUP_BUCKET,
      region: env.S3_BACKUP_REGION,
      endpoint: env.S3_BACKUP_ENDPOINT,
      accessKeyId: env.S3_BACKUP_ACCESS_KEY_ID,
      secretAccessKey: env.S3_BACKUP_SECRET_ACCESS_KEY,
      storageClass: 'DEEP_ARCHIVE',
    });
  }
  return client;
}

export const backupS3: LcS3Client = new Proxy({} as LcS3Client, {
  get(_target, prop) {
    const target = getBackupClient();
    const value: unknown = Reflect.get(target, prop, target);
    return typeof value === 'function' ? value.bind(target) : value;
  },
});
