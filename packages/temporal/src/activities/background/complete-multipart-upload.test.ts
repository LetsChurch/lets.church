import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  completeMultipartUpload: vi.fn(),
  headObject: vi.fn(),
}));

vi.mock('@letschurch/s3/ingest', () => ({
  ingestS3: mocks,
}));

import completeMultipartUpload from './complete-multipart-upload';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.completeMultipartUpload.mockResolvedValue(undefined);
});

describe('completeMultipartUpload', () => {
  test('returns an explicit zero ContentLength', async () => {
    mocks.headObject.mockResolvedValueOnce({ ContentLength: 0 });

    await expect(
      completeMultipartUpload('upload-id', 'upload-key', ['etag']),
    ).resolves.toBe('0');
  });

  test.each([
    ['missing', undefined],
    ['negative', -1],
    ['not finite', Number.NaN],
  ])(
    'rejects %s ContentLength metadata',
    async (_description, ContentLength) => {
      mocks.headObject.mockResolvedValueOnce({ ContentLength });

      await expect(
        completeMultipartUpload('upload-id', 'upload-key', ['etag']),
      ).rejects.toThrow('invalid ContentLength');
    },
  );

  test.each([
    [
      'missing object',
      Object.assign(new Error('missing'), { name: 'NotFound' }),
    ],
    [
      'transient failure',
      Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }),
    ],
  ])('propagates %s lookup failures', async (_description, error) => {
    mocks.headObject.mockRejectedValueOnce(error);

    await expect(
      completeMultipartUpload('upload-id', 'upload-key', ['etag']),
    ).rejects.toBe(error);
  });
});
