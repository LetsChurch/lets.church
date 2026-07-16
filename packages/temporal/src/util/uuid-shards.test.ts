import { describe, expect, test } from 'vitest';

import { uuidShards } from './uuid-shards';

const MIN_UUID = '00000000-0000-0000-0000-000000000000';

describe('uuidShards', () => {
  test('returns one unbounded shard for count 1', () => {
    expect(uuidShards(1)).toEqual([{ index: 0, lo: MIN_UUID, hi: null }]);
  });

  test.each([1, 2, 3, 4, 7, 8, 16, 32])(
    'tiles the uuid space exactly with count %i',
    (count) => {
      const shards = uuidShards(count);
      expect(shards).toHaveLength(count);

      // The reindex relies on these ranges covering every id exactly once: a gap
      // silently skips documents, an overlap indexes them twice. So the first
      // shard must start at the minimum uuid, each shard must pick up precisely
      // where the previous one stopped, and the last must be unbounded.
      expect(shards[0]?.lo).toBe(MIN_UUID);
      for (let i = 1; i < shards.length; i++) {
        expect(shards[i]?.lo).toBe(shards[i - 1]?.hi);
      }
      expect(shards.at(-1)?.hi).toBeNull();
    },
  );

  test('boundaries are well-formed uuids in ascending order', () => {
    const shards = uuidShards(8);
    for (const shard of shards) {
      expect(shard.lo).toMatch(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
      if (shard.hi) expect(shard.hi > shard.lo).toBe(true);
    }
  });

  test('cuts above the v4 version/variant bits so shards stay balanced', () => {
    // Balance depends on the bits we cut on being uniformly random. uuid v4
    // pins the version nibble (hex digit 13) and variant (digit 17); both sit
    // below the leading 32 bits, so every boundary must vary only in the first
    // group and zero out the rest.
    for (const { lo } of uuidShards(16)) {
      expect(lo.slice(8)).toBe('-0000-0000-0000-000000000000');
    }
  });

  test('rejects a non-positive or fractional count', () => {
    expect(() => uuidShards(0)).toThrow();
    expect(() => uuidShards(-1)).toThrow();
    expect(() => uuidShards(2.5)).toThrow();
  });
});
