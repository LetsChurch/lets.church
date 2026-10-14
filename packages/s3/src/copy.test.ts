import { describe, expect, test, vi } from 'vitest';

import { copyObjectBetween } from './copy';
import type { LcS3Client } from './index';

type Stored = { body: Buffer; etag: string; contentType: string };

function fakeBucket(objects: Record<string, Stored> = {}) {
  const store = new Map(Object.entries(objects));
  const head = (key: string) => {
    const o = store.get(key);
    return o
      ? {
          ContentLength: o.body.length,
          ETag: o.etag,
          ContentType: o.contentType,
        }
      : null;
  };
  const client = {
    headObject: vi.fn(async (key: string) => {
      const h = head(key);
      if (!h) throw Object.assign(new Error('missing'), { name: 'NotFound' });
      return h;
    }),
    headObjectIfExists: vi.fn(async (key: string) => head(key)),
    getObject: vi.fn(async (key: string) => ({
      Body: { transformToByteArray: async () => store.get(key)?.body },
    })),
    putFile: vi.fn(
      async ({
        key,
        body,
        contentType,
      }: {
        key: string;
        body: Buffer;
        contentType: string;
      }) => {
        store.set(key, { body, etag: `"new-${body.length}"`, contentType });
      },
    ),
  };
  return { client: client as unknown as LcS3Client, store, mocks: client };
}

const obj = (text: string, etag: string): Stored => ({
  body: Buffer.from(text),
  etag,
  contentType: 'application/vnd.apple.mpegurl',
});

describe('copyObjectBetween', () => {
  test('copies a missing object and preserves its content type', async () => {
    const source = fakeBucket({ 'a/master.m3u8': obj('#EXTM3U', '"abc"') });
    const target = fakeBucket();

    await expect(
      copyObjectBetween(source.client, target.client, 'a/master.m3u8'),
    ).resolves.toEqual({ key: 'a/master.m3u8', bytes: 7, skipped: false });
    expect(target.store.get('a/master.m3u8')?.contentType).toBe(
      'application/vnd.apple.mpegurl',
    );
  });

  test('skips an identical object (same size and single-part ETag)', async () => {
    const source = fakeBucket({ k: obj('same', '"e1"') });
    const target = fakeBucket({ k: obj('same', '"e1"') });

    const result = await copyObjectBetween(source.client, target.client, 'k');
    expect(result.skipped).toBe(true);
    expect(target.mocks.putFile).not.toHaveBeenCalled();
  });

  test('recopies a same-size object whose content changed', async () => {
    const source = fakeBucket({ k: obj('new!', '"e2"') });
    const target = fakeBucket({ k: obj('old!', '"e1"') });

    const result = await copyObjectBetween(source.client, target.client, 'k');
    expect(result.skipped).toBe(false);
    expect(target.store.get('k')?.body.toString()).toBe('new!');
  });

  test('falls back to size when either ETag is multipart', async () => {
    const source = fakeBucket({ k: obj('data', '"abc-3"') });
    const target = fakeBucket({ k: obj('data', '"def"') });

    const result = await copyObjectBetween(source.client, target.client, 'k');
    expect(result.skipped).toBe(true);
  });
});
