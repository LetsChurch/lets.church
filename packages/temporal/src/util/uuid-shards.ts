import { invariant } from 'es-toolkit';

/**
 * A contiguous, half-open slice of the uuid space: `lo <= id < hi`. The last
 * shard has `hi: null` (unbounded) so the ranges tile the space exactly.
 */
export type UuidShard = {
  index: number;
  lo: string;
  /** Exclusive upper bound; null on the final shard. */
  hi: string | null;
};

// Boundaries are cut on the leading 32 bits, expressed as a fraction of 2^32.
const SPACE = 2 ** 32;

function boundary(i: number, count: number): string {
  const prefix = Math.floor((i * SPACE) / count)
    .toString(16)
    .padStart(8, '0');
  return `${prefix}-0000-0000-0000-000000000000`;
}

/**
 * Tile the uuid space into `count` ranges for parallel keyset scans.
 *
 * Sharding this way is what lets a keyset walk fan out at all: a single cursor
 * is inherently serial (batch N+1 needs batch N's last id), but each shard owns
 * a disjoint id range and can walk its own cursor independently. Because these
 * are range predicates on a uuid PK, each shard is an ordered index scan — the
 * same access path the unsharded query used.
 *
 * Balance comes free from the id generation: our uuids are `defaultRandom()`
 * (v4), whose leading 32 bits are uniformly random — the version/variant bits
 * sit at hex digits 13 and 17, well below where we cut. So shards come out
 * near-equal in size without knowing anything about the data. (This is exactly
 * what pagination on `createdAt` would *not* give you: import history is lumpy,
 * so time-ranges would be wildly uneven.)
 */
export function uuidShards(count: number): UuidShard[] {
  invariant(
    Number.isInteger(count) && count >= 1,
    `uuidShards: count must be a positive integer, got ${count}`,
  );
  return Array.from({ length: count }, (_, i) => ({
    index: i,
    lo: boundary(i, count),
    hi: i === count - 1 ? null : boundary(i + 1, count),
  }));
}
