import { describe, expect, test } from 'vitest';

import {
  StorageRegistry,
  UnknownStorageLocationError,
  parseByteSize,
} from './locations';

const bucketEnv = (id: string, kind: 'INGEST' | 'PUBLIC') => ({
  [`STORAGE_${id}_${kind}_BUCKET`]: `${id.toLowerCase()}-${kind.toLowerCase()}`,
  [`STORAGE_${id}_${kind}_ENDPOINT`]: `https://${id.toLowerCase()}.example.test`,
  [`STORAGE_${id}_${kind}_ACCESS_KEY_ID`]: 'key',
  [`STORAGE_${id}_${kind}_SECRET_ACCESS_KEY`]: 'secret',
});

describe('parseByteSize', () => {
  test.each([
    ['1500000', 1_500_000n],
    ['500GB', 500_000_000_000n],
    ['20TB', 20_000_000_000_000n],
    ['1.5 tb', 1_500_000_000_000n],
    ['10 KB', 10_000n],
    ['7B', 7n],
  ])('parses %s', (raw, expected) => {
    expect(parseByteSize(raw)).toBe(expected);
  });

  test.each(['', 'lots', '-5GB', '5 GiB', '1e9'])('rejects %j', (raw) => {
    expect(() => parseByteSize(raw)).toThrow();
  });
});

describe('StorageRegistry', () => {
  test('discovers locations from bucket keys and lowercases ids', () => {
    const registry = new StorageRegistry({
      ...bucketEnv('IDRIVE', 'INGEST'),
      ...bucketEnv('IDRIVE', 'PUBLIC'),
      ...bucketEnv('RUSTFS', 'INGEST'),
      STORAGE_EMPTY_INGEST_BUCKET: '',
      UNRELATED: 'x',
    });

    expect(registry.ids()).toEqual(['idrive', 'rustfs']);
    expect(registry.get('idrive').isComplete).toBe(true);
    expect(registry.get('rustfs').isComplete).toBe(false);
    expect(registry.get('rustfs').configured).toEqual({
      INGEST: true,
      PUBLIC: false,
    });
  });

  test('unknown or malformed ids throw', () => {
    const registry = new StorageRegistry(bucketEnv('IDRIVE', 'INGEST'));
    expect(() => registry.get('rustfs')).toThrow(UnknownStorageLocationError);
    expect(() => registry.get('IDRIVE')).toThrow(UnknownStorageLocationError);
  });

  test('buckets validate lazily, naming the missing vars', () => {
    const env: Record<string, string> = {
      ...bucketEnv('IDRIVE', 'INGEST'),
      STORAGE_IDRIVE_PUBLIC_BUCKET: 'public',
    };
    const location = new StorageRegistry(env).get('idrive');

    expect(location.ingest.getBucket()).toBe('idrive-ingest');
    expect(() => location.public).toThrow(
      /STORAGE_IDRIVE_PUBLIC_ENDPOINT.*STORAGE_IDRIVE_PUBLIC_ACCESS_KEY_ID/,
    );
  });

  test('caps are optional', () => {
    const location = new StorageRegistry({
      ...bucketEnv('IDRIVE', 'INGEST'),
      ...bucketEnv('IDRIVE', 'PUBLIC'),
      STORAGE_IDRIVE_INGEST_MAX_BYTES: '2TB',
      STORAGE_IDRIVE_PUBLIC_MAX_BYTES: ' ',
    }).get('idrive');

    expect(location.maxBytes('INGEST')).toBe(2_000_000_000_000n);
    expect(location.maxBytes('PUBLIC')).toBeNull();
  });

  test('public object urls join the configured CDN base', () => {
    const location = new StorageRegistry({
      ...bucketEnv('IDRIVE', 'PUBLIC'),
      STORAGE_IDRIVE_PUBLIC_URL: 'https://cdn.example.test/',
    }).get('idrive');

    expect(location.publicObjectUrl('/abc/master.m3u8')).toBe(
      'https://cdn.example.test/abc/master.m3u8',
    );
  });
});
