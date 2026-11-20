import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  set: vi.fn(),
  update: vi.fn(),
  where: vi.fn(),
}));

// Real schema (column refs render into SQL); only the connected `db` is faked.
vi.mock('@letschurch/db', async () => ({
  ...(await vi.importActual<object>('@letschurch/db/schema')),
  db: { update: mocks.update },
}));

import updateUploadRecord from './update-upload-record';

const dialect = new PgDialect();
const render = (value: unknown) => dialect.sqlToQuery(value as SQL);

function setArg(): Record<string, unknown> {
  return mocks.set.mock.calls[0]?.[0] as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.where.mockResolvedValue(undefined);
  mocks.set.mockReturnValue({ where: mocks.where });
  mocks.update.mockReturnValue({ set: mocks.set });
});

describe('updateUploadRecord', () => {
  test('guards auto-generated default thumbnail writes with the channel-default flag', async () => {
    await updateUploadRecord('upload-1', {
      defaultThumbnailPath: 'upload-1/screenshot_v1_004.jpg',
      defaultThumbnailBlurhash: 'LKO2?U%2Tw=w',
    });

    const set = setArg();
    const path = render(set.defaultThumbnailPath);
    expect(path.sql).toBe(
      'case when "upload_record"."use_channel_default_thumbnail" then "upload_record"."default_thumbnail_path" else $1 end',
    );
    expect(path.params).toEqual(['upload-1/screenshot_v1_004.jpg']);

    const blurhash = render(set.defaultThumbnailBlurhash);
    expect(blurhash.sql).toBe(
      'case when "upload_record"."use_channel_default_thumbnail" then "upload_record"."default_thumbnail_blurhash" else $1 end',
    );
    expect(blurhash.params).toEqual(['LKO2?U%2Tw=w']);
  });

  test('records a default-only write (older transcode workers) as the automatic frame', async () => {
    await updateUploadRecord('upload-1', {
      defaultThumbnailPath: 'upload-1/screenshot_v1_004.jpg',
      defaultThumbnailBlurhash: 'LKO2',
    });

    const set = setArg();
    expect(set.autoThumbnailPath).toBe('upload-1/screenshot_v1_004.jpg');
    expect(set.autoThumbnailBlurhash).toBe('LKO2');
    // The displayed default stays guarded by the channel-default flag.
    expect(render(set.defaultThumbnailPath).sql).toContain('case when');
  });

  test('leaves an explicitly undefined default thumbnail untouched', async () => {
    await updateUploadRecord('upload-1', {
      title: 'Sermon',
      defaultThumbnailPath: undefined,
    });

    const set = setArg();
    expect(set.defaultThumbnailPath).toBeUndefined();
    expect(set.title).toBe('Sermon');
  });

  test('passes other fields through unguarded', async () => {
    await updateUploadRecord('upload-1', {
      overrideThumbnailPath: 'upload-1/custom.jpg',
      useChannelDefaultThumbnail: false,
    });

    const set = setArg();
    expect(set.overrideThumbnailPath).toBe('upload-1/custom.jpg');
    expect(set.useChannelDefaultThumbnail).toBe(false);
    expect(set.updatedAt).toBeInstanceOf(Date);
  });
});
