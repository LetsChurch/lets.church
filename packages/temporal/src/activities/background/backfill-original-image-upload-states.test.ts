import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  headObjectIfExists: vi.fn(),
  insert: vi.fn(),
  listObjects: vi.fn(),
  select: vi.fn(),
  values: vi.fn(),
}));

const tables = vi.hoisted(() => ({
  AppUser: { id: 'appUser.id', avatarPath: 'appUser.avatarPath' },
  Channel: {
    id: 'channel.id',
    avatarPath: 'channel.avatarPath',
    defaultThumbnailPath: 'channel.defaultThumbnailPath',
  },
  Organization: {
    id: 'organization.id',
    avatarPath: 'organization.avatarPath',
  },
  UploadRecord: {
    id: 'uploadRecord.id',
    overrideThumbnailPath: 'uploadRecord.overrideThumbnailPath',
  },
  UploadState: { s3Key: 'uploadState.s3Key' },
}));

vi.mock('@letschurch/db', () => ({
  ...tables,
  db: { insert: mocks.insert, select: mocks.select },
  UploadStateType: {
    enumValues: [
      'MEDIA',
      'THUMBNAIL',
      'PROFILE_AVATAR',
      'CHANNEL_AVATAR',
      'CHANNEL_DEFAULT_THUMBNAIL',
      'ORGANIZATION_AVATAR',
    ],
  },
}));
vi.mock('@letschurch/s3/ingest', () => ({
  ingestS3: {
    headObjectIfExists: mocks.headObjectIfExists,
    listObjects: mocks.listObjects,
  },
}));
vi.mock('drizzle-orm', () => ({ eq: vi.fn() }));
vi.mock('../../util/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn() },
}));

import { backfillOriginalImageUploadStatesBatch } from './backfill-original-image-upload-states';

const originalKey = 'upload-record-id/original.jpg';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listObjects.mockImplementation(async function* () {
    yield { Key: `${originalKey}.imagemagick.json` };
  });
  mocks.values.mockResolvedValue(undefined);
  mocks.insert.mockReturnValue({ values: mocks.values });
  mocks.select.mockImplementation(() => ({
    from: (table: unknown) => ({
      where: () =>
        Promise.resolve(
          table === tables.UploadRecord
            ? [
                {
                  id: 'upload-record-id',
                  overrideThumbnailPath: originalKey,
                },
              ]
            : [],
        ),
    }),
  }));
});

describe('backfillOriginalImageUploadStatesBatch', () => {
  test('skips a positively missing original without inserting a row', async () => {
    mocks.headObjectIfExists.mockResolvedValueOnce(null);

    await expect(
      backfillOriginalImageUploadStatesBatch(10, 'ingest'),
    ).resolves.toEqual({ created: 0, remaining: 0 });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  test('propagates operational S3 failures without inserting a row', async () => {
    const error = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });
    mocks.headObjectIfExists.mockRejectedValueOnce(error);

    await expect(
      backfillOriginalImageUploadStatesBatch(10, 'ingest'),
    ).rejects.toBe(error);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  test('reuses one successful lookup and preserves a zero size', async () => {
    mocks.headObjectIfExists.mockResolvedValueOnce({ ContentLength: 0 });

    await expect(
      backfillOriginalImageUploadStatesBatch(10, 'ingest'),
    ).resolves.toEqual({ created: 1, remaining: 0 });
    expect(mocks.headObjectIfExists).toHaveBeenCalledTimes(1);
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        s3Key: originalKey,
        sizeBytes: 0n,
        uploadType: 'THUMBNAIL',
        uploadRecordId: 'upload-record-id',
      }),
    );
  });
});
