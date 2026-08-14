import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  headObject: vi.fn(),
  limit: vi.fn(),
  select: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
  updateWhere: vi.fn(),
}));

vi.mock('@letschurch/db', () => ({
  db: { select: mocks.select, update: mocks.update },
  UploadRecord: {
    finalizedUploadKey: 'uploadRecord.finalizedUploadKey',
    id: 'uploadRecord.id',
    originalFileName: 'uploadRecord.originalFileName',
    title: 'uploadRecord.title',
    uploadFinalized: 'uploadRecord.uploadFinalized',
  },
}));
vi.mock('@letschurch/s3/ingest', () => ({
  ingestS3: {
    getBucket: vi.fn(),
    getS3Client: vi.fn(),
    headObject: mocks.headObject,
  },
}));
vi.mock('@tokenizer/s3', () => ({ makeChunkedTokenizerFromS3: vi.fn() }));
vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  count: vi.fn(() => 'count'),
  eq: vi.fn(),
  isNotNull: vi.fn(),
  isNull: vi.fn(),
}));
vi.mock('file-type', () => ({ fileTypeFromTokenizer: vi.fn() }));
vi.mock('sanitize-filename', () => ({ default: (value: string) => value }));

import { backfillFilenamesBatch } from './backfill-original-filenames';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.limit.mockResolvedValue([
    {
      id: 'upload-record-id',
      finalizedUploadKey: 'upload-record-id/original',
      title: 'Sermon',
    },
  ]);
  mocks.select.mockImplementation((selection: Record<string, unknown>) => ({
    from: () => ({
      where: () =>
        Object.hasOwn(selection, 'count')
          ? Promise.resolve([{ count: 0 }])
          : { limit: mocks.limit },
    }),
  }));
  mocks.updateWhere.mockResolvedValue(undefined);
  mocks.set.mockReturnValue({ where: mocks.updateWhere });
  mocks.update.mockReturnValue({ set: mocks.set });
});

describe('backfillFilenamesBatch', () => {
  test('uses strict metadata lookup and propagates an S3 failure', async () => {
    const error = Object.assign(new Error('unavailable'), {
      name: 'ServiceUnavailable',
    });
    mocks.headObject.mockRejectedValueOnce(error);

    await expect(backfillFilenamesBatch(10)).rejects.toBe(error);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  test('updates a filename from successful metadata', async () => {
    mocks.headObject.mockResolvedValueOnce({ ContentType: 'video/mp4' });

    await expect(backfillFilenamesBatch(10)).resolves.toEqual({
      processed: 1,
      updated: 1,
      remaining: 0,
    });
    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({ originalFileName: 'Sermon.mp4' }),
    );
  });
});
