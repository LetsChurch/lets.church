import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  headObjectIfExists: vi.fn(),
  limit: vi.fn(),
  select: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
  updateWhere: vi.fn(),
}));

vi.mock('@letschurch/db', () => ({
  db: { select: mocks.select, update: mocks.update },
  UploadState: {
    createdAt: 'uploadState.createdAt',
    id: 'uploadState.id',
    s3Bucket: 'uploadState.s3Bucket',
    s3Key: 'uploadState.s3Key',
    sizeBytes: 'uploadState.sizeBytes',
  },
}));
vi.mock('@letschurch/s3', () => ({
  LcS3Client: class {
    headObjectIfExists = mocks.headObjectIfExists;
  },
}));
vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  count: vi.fn(() => 'count'),
  eq: vi.fn(),
  gt: vi.fn(),
  isNull: vi.fn(),
  or: vi.fn(),
}));
vi.mock('../../util/logger', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { backfillUploadStateSizesBatch } from './backfill-upload-state-sizes';

const createdAt = new Date('2026-01-01T00:00:00.000Z');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.limit.mockResolvedValue([
    {
      id: 'upload-state-id',
      s3Key: 'key',
      s3Bucket: 'ingest',
      createdAt,
    },
  ]);
  mocks.select.mockImplementation((selection: Record<string, unknown>) => ({
    from: () => ({
      where: () =>
        Object.hasOwn(selection, 'count')
          ? Promise.resolve([{ count: 1 }])
          : {
              orderBy: () => ({ limit: mocks.limit }),
            },
    }),
  }));
  mocks.updateWhere.mockResolvedValue(undefined);
  mocks.set.mockReturnValue({ where: mocks.updateWhere });
  mocks.update.mockReturnValue({ set: mocks.set });
});

function runBatch() {
  return backfillUploadStateSizesBatch(
    10,
    'ingest',
    'http://127.0.0.1:1',
    'us-east-1',
    'access-key',
    'secret-key',
    null,
  );
}

describe('backfillUploadStateSizesBatch', () => {
  test('skips a positively missing legacy object', async () => {
    mocks.headObjectIfExists.mockResolvedValueOnce(null);

    await expect(runBatch()).resolves.toEqual({
      updated: 0,
      skipped: 1,
      processed: 1,
      remaining: 1,
      nextCursor: {
        id: 'upload-state-id',
        createdAt: createdAt.toISOString(),
      },
      done: true,
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  test('propagates operational S3 failures', async () => {
    const error = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });
    mocks.headObjectIfExists.mockRejectedValueOnce(error);

    await expect(runBatch()).rejects.toBe(error);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  test('updates an explicitly zero-byte object', async () => {
    mocks.headObjectIfExists.mockResolvedValueOnce({ ContentLength: 0 });

    await expect(runBatch()).resolves.toMatchObject({ updated: 1, skipped: 0 });
    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({ sizeBytes: 0n }),
    );
  });
});
