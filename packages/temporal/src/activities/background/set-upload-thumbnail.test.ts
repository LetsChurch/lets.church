import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  returning: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
  where: vi.fn(),
}));

// Real schema (column refs render into SQL); only the connected `db` is faked.
vi.mock('@letschurch/db', async () => ({
  ...(await vi.importActual<object>('@letschurch/db/schema')),
  db: { update: mocks.update },
}));

import setUploadThumbnail from './set-upload-thumbnail';

const dialect = new PgDialect();

function whereQuery() {
  return dialect.sqlToQuery(mocks.where.mock.calls[0]?.[0] as SQL);
}

function setArg(): Record<string, unknown> {
  return mocks.set.mock.calls[0]?.[0] as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.returning.mockResolvedValue([{ id: 'upload-1' }]);
  mocks.where.mockReturnValue({ returning: mocks.returning });
  mocks.set.mockReturnValue({ where: mocks.where });
  mocks.update.mockReturnValue({ set: mocks.set });
});

describe('setUploadThumbnail', () => {
  test('only applies when no thumbnail choice was made after the request', async () => {
    const requestedAt = '2026-11-20T19:00:00.000Z';

    await expect(
      setUploadThumbnail(
        'upload-1',
        'upload-1/custom.jpg',
        'LKO2',
        requestedAt,
      ),
    ).resolves.toEqual({ applied: true });

    const set = setArg();
    expect(set.overrideThumbnailPath).toBe('upload-1/custom.jpg');
    expect(set.overrideThumbnailBlurhash).toBe('LKO2');
    expect(set.useChannelDefaultThumbnail).toBe(false);
    // Kept so the editor can switch back to it later.
    expect(set.customThumbnailPath).toBe('upload-1/custom.jpg');
    expect(set.customThumbnailBlurhash).toBe('LKO2');
    expect(set.thumbnailChosenAt).toEqual(new Date(requestedAt));

    const where = whereQuery();
    expect(where.sql).toBe(
      '("upload_record"."id" = $1 and ("upload_record"."thumbnail_chosen_at" is null or "upload_record"."thumbnail_chosen_at" <= $2))',
    );
    expect(where.params).toEqual(['upload-1', '2026-11-20T19:00:00.000Z']);
  });

  test('reports a superseded image as not applied', async () => {
    mocks.returning.mockResolvedValue([]);

    await expect(
      setUploadThumbnail(
        'upload-1',
        'upload-1/custom.jpg',
        'LKO2',
        '2026-11-20T19:00:00.000Z',
      ),
    ).resolves.toEqual({ applied: false });
  });

  test.each([null, 'not a date'])(
    'treats a missing or invalid request time (%s) as unguarded',
    async (requestedAt) => {
      await setUploadThumbnail(
        'upload-1',
        'upload-1/custom.jpg',
        'LKO2',
        requestedAt,
      );

      expect(setArg()).not.toHaveProperty('thumbnailChosenAt');
      expect(whereQuery().sql).toBe('"upload_record"."id" = $1');
    },
  );

  test('applies unconditionally for workflows started before the guard', async () => {
    await setUploadThumbnail('upload-1', 'upload-1/custom.jpg', 'LKO2');

    expect(setArg()).not.toHaveProperty('thumbnailChosenAt');
    const where = whereQuery();
    expect(where.sql).toBe('"upload_record"."id" = $1');
  });
});
