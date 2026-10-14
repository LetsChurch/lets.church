import { describe, expect, test } from 'vitest';

import {
  chooseLocation,
  estimatePublicBytes,
  type LocationCandidate,
} from './placement';

const GB = 1_000_000_000n;

function candidate(
  id: string,
  overrides: Partial<LocationCandidate> = {},
): LocationCandidate {
  return {
    id,
    complete: true,
    weight: 1,
    acceptingUploads: true,
    ingestMax: null,
    publicMax: null,
    usage: {
      ingestUsed: 0n,
      publicUsed: 0n,
      publicReserved: 0n,
      publicRatio: null,
    },
    ...overrides,
  };
}

describe('estimatePublicBytes', () => {
  test('defaults to 1:1 without history and clamps outliers', () => {
    expect(estimatePublicBytes(10n * GB, null)).toBe(10n * GB);
    expect(estimatePublicBytes(10n * GB, 0.5)).toBe(5n * GB);
    expect(estimatePublicBytes(10n * GB, 100)).toBe(40n * GB);
    expect(estimatePublicBytes(10n * GB, 0.001)).toBe(2_500_000_000n);
  });
});

describe('chooseLocation', () => {
  test('uncapped locations are always eligible', () => {
    const chosen = chooseLocation([candidate('a')], {
      sourceBytes: 1_000_000n * GB,
    });
    expect(chosen?.id).toBe('a');
  });

  test('weights distribute proportionally', () => {
    const cands = [
      candidate('a', { weight: 3 }),
      candidate('b', { weight: 1 }),
    ];
    expect(chooseLocation(cands, { sourceBytes: GB }, () => 0.74)?.id).toBe(
      'a',
    );
    expect(chooseLocation(cands, { sourceBytes: GB }, () => 0.76)?.id).toBe(
      'b',
    );
  });

  test('skips draining, weight-0, incomplete and excluded locations', () => {
    const cands = [
      candidate('drain', { acceptingUploads: false }),
      candidate('zero', { weight: 0 }),
      candidate('half', { complete: false }),
      candidate('excluded'),
      candidate('ok'),
    ];
    expect(
      chooseLocation(cands, { sourceBytes: GB, exclude: ['excluded'] })?.id,
    ).toBe('ok');
  });

  test('ingest fits but the processed-output reservation does not', () => {
    const tight = candidate('tight', {
      ingestMax: 100n * GB,
      publicMax: 10n * GB,
      usage: {
        ingestUsed: 0n,
        publicUsed: 4n * GB,
        publicReserved: 3n * GB,
        publicRatio: 1,
      },
    });
    // 2GB source → 2GB estimated output: 4 + 3 + 2 = 9 ≤ 10 fits.
    expect(chooseLocation([tight], { sourceBytes: 2n * GB })?.id).toBe('tight');
    // 4GB source fits ingest easily but 4 + 3 + 4 = 11 > 10.
    expect(chooseLocation([tight], { sourceBytes: 4n * GB })).toBeNull();
  });

  test('ingest cap is enforced', () => {
    const full = candidate('full', {
      ingestMax: 10n * GB,
      usage: {
        ingestUsed: 9n * GB,
        publicUsed: 0n,
        publicReserved: 0n,
        publicRatio: null,
      },
    });
    expect(chooseLocation([full], { sourceBytes: 2n * GB })).toBeNull();
  });

  test('ignorePolicy allows admin targets that are not accepting uploads', () => {
    const cands = [candidate('drain', { acceptingUploads: false, weight: 0 })];
    expect(chooseLocation(cands, { sourceBytes: GB })).toBeNull();
    expect(
      chooseLocation(cands, { sourceBytes: GB, ignorePolicy: true })?.id,
    ).toBe('drain');
  });
});
