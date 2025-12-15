import { z } from 'zod';
import { LcS3Client } from './index.js';

const env = z
  .object({
    S3_PUBLIC_BUCKET: z.string(),
    S3_PUBLIC_REGION: z.string(),
    S3_PUBLIC_ENDPOINT: z.string(),
    S3_PUBLIC_ACCESS_KEY_ID: z.string(),
    S3_PUBLIC_SECRET_ACCESS_KEY: z.string(),
  })
  .parse(process.env);

export const publicS3 = new LcS3Client({
  bucket: env.S3_PUBLIC_BUCKET,
  region: env.S3_PUBLIC_REGION,
  endpoint: env.S3_PUBLIC_ENDPOINT,
  accessKeyId: env.S3_PUBLIC_ACCESS_KEY_ID,
  secretAccessKey: env.S3_PUBLIC_SECRET_ACCESS_KEY,
});
