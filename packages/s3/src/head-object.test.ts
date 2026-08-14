import type {
  HeadObjectCommandInput,
  HeadObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { LcS3Client } from './index';

const s3 = new LcS3Client({
  bucket: 'test-bucket',
  region: 'us-east-1',
  endpoint: 'http://127.0.0.1:1',
  accessKeyId: 'test',
  secretAccessKey: 'test',
});
const sdkHeadObject =
  vi.fn<(input: HeadObjectCommandInput) => Promise<HeadObjectCommandOutput>>();
Object.defineProperty(s3.getS3Client(), 'headObject', {
  value: sdkHeadObject,
});

beforeEach(() => {
  sdkHeadObject.mockReset();
});

describe('LcS3Client.headObject', () => {
  test.each([
    ['zero length', { ContentLength: 0, $metadata: {} }],
    ['missing length', { $metadata: {} }],
  ])('returns SDK metadata for %s', async (_description, response) => {
    sdkHeadObject.mockResolvedValueOnce(response);

    await expect(s3.headObject('key')).resolves.toBe(response);
  });

  test.each([
    ['not found', Object.assign(new Error('missing'), { name: 'NotFound' })],
    [
      'forbidden',
      Object.assign(new Error('forbidden'), {
        name: 'AccessDenied',
        $metadata: { httpStatusCode: 403 },
      }),
    ],
    [
      'throttling',
      Object.assign(new Error('slow down'), {
        name: 'SlowDown',
        $metadata: { httpStatusCode: 503 },
      }),
    ],
    [
      'network timeout',
      Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }),
    ],
    ['unknown value', 'unknown failure'],
  ])('rethrows %s failures', async (_description, error) => {
    sdkHeadObject.mockRejectedValueOnce(error);

    await expect(s3.headObject('key')).rejects.toBe(error);
  });
});

describe('LcS3Client.headObjectIfExists', () => {
  test.each([
    [
      'AWS 404 metadata',
      Object.assign(new Error('missing'), {
        name: 'NotFound',
        $metadata: { httpStatusCode: 404 },
      }),
    ],
    [
      'AWS NotFound name',
      Object.assign(new Error('missing'), { name: 'NotFound' }),
    ],
    [
      'S3 NoSuchKey name',
      Object.assign(new Error('missing'), { name: 'NoSuchKey' }),
    ],
    ['MinIO NoSuchKey code', { Code: 'NoSuchKey', message: 'missing' }],
    ['numeric string code', { code: '404', message: 'missing' }],
  ])('returns null only for %s', async (_description, error) => {
    sdkHeadObject.mockRejectedValueOnce(error);

    await expect(s3.headObjectIfExists('key')).resolves.toBeNull();
  });

  test.each([
    [
      'forbidden',
      Object.assign(new Error('forbidden'), {
        name: 'AccessDenied',
        $metadata: { httpStatusCode: 403 },
      }),
    ],
    [
      'throttling',
      Object.assign(new Error('throttled'), {
        name: 'Throttling',
        $metadata: { httpStatusCode: 429 },
      }),
    ],
    [
      'service outage',
      Object.assign(new Error('unavailable'), {
        name: 'ServiceUnavailable',
        $metadata: { httpStatusCode: 503 },
      }),
    ],
    [
      'network timeout',
      Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }),
    ],
    ['unknown value', Symbol('unknown failure')],
  ])('rethrows %s failures', async (_description, error) => {
    sdkHeadObject.mockRejectedValueOnce(error);

    await expect(s3.headObjectIfExists('key')).rejects.toBe(error);
  });

  test('preserves explicit zero and absent ContentLength metadata', async () => {
    sdkHeadObject
      .mockResolvedValueOnce({ ContentLength: 0, $metadata: {} })
      .mockResolvedValueOnce({ $metadata: {} });

    await expect(s3.headObjectIfExists('zero')).resolves.toMatchObject({
      ContentLength: 0,
    });
    await expect(s3.headObjectIfExists('unknown')).resolves.toEqual({
      $metadata: {},
    });
  });
});
