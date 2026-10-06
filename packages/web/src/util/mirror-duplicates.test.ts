import { describe, expect, test } from 'vitest';

import {
  type ExistingUpload,
  matchMirrorCandidates,
  type MirrorCandidate,
  mirrorCandidateDateWindow,
  normalizeMirrorTitle,
} from './mirror-duplicates';

const day = (iso: string) => new Date(`${iso}T15:00:00.000Z`);

function existing(overrides: Partial<ExistingUpload>): ExistingUpload {
  return {
    id: 'upload-1',
    title: 'Sunday Service',
    publishedAt: day('2026-09-27'),
    lengthSeconds: 3600,
    originalFileName: 'service.mp4',
    ...overrides,
  };
}

function candidate(overrides: Partial<MirrorCandidate>): MirrorCandidate {
  return {
    key: 'yt-1',
    title: 'Sunday Service',
    publishedAt: day('2026-09-27'),
    lengthSeconds: 3600,
    originalFileName: 'other.mp4',
    ...overrides,
  };
}

describe('normalizeMirrorTitle', () => {
  test('ignores case, punctuation, and whitespace runs', () => {
    expect(normalizeMirrorTitle('  Romans 8:28 — “Good”!  ')).toBe(
      normalizeMirrorTitle('romans 8 28 good'),
    );
  });
});

describe('matchMirrorCandidates', () => {
  test('same title and publish day is exact', () => {
    const matches = matchMirrorCandidates(
      [candidate({ title: 'SUNDAY service!', lengthSeconds: null })],
      [existing({ lengthSeconds: null, originalFileName: null })],
    );
    expect(matches['yt-1']).toEqual({
      uploadId: 'upload-1',
      title: 'Sunday Service',
      confidence: 'exact',
    });
  });

  test('tolerates a timezone shift but not a week', () => {
    const shifted = matchMirrorCandidates(
      [candidate({ publishedAt: new Date('2026-09-28T02:00:00.000Z') })],
      [existing({ lengthSeconds: null })],
    );
    expect(shifted['yt-1']?.confidence).toBe('exact');

    const nextWeek = matchMirrorCandidates(
      [candidate({ publishedAt: day('2026-10-04'), lengthSeconds: 1200 })],
      [existing({})],
    );
    expect(nextWeek['yt-1']).toBeUndefined();
  });

  test('same file name and duration is exact even with a different title', () => {
    const matches = matchMirrorCandidates(
      [
        candidate({
          title: 'Renamed',
          publishedAt: day('2025-01-01'),
          originalFileName: 'SERVICE.mp4',
          lengthSeconds: 3601,
        }),
      ],
      [existing({})],
    );
    expect(matches['yt-1']?.confidence).toBe('exact');
  });

  test('same title and duration on a different date is likely', () => {
    const matches = matchMirrorCandidates(
      [candidate({ publishedAt: day('2026-01-01') })],
      [existing({})],
    );
    expect(matches['yt-1']?.confidence).toBe('likely');
  });

  test('same date and duration with a different title is likely', () => {
    const matches = matchMirrorCandidates(
      [candidate({ title: 'Morning Worship', lengthSeconds: 3599 })],
      [existing({})],
    );
    expect(matches['yt-1']?.confidence).toBe('likely');
  });

  test('prefers an exact match over an earlier likely one', () => {
    const matches = matchMirrorCandidates(
      [candidate({})],
      [
        existing({
          id: 'likely',
          title: 'Different',
          originalFileName: null,
        }),
        existing({ id: 'exact' }),
      ],
    );
    expect(matches['yt-1']).toMatchObject({
      uploadId: 'exact',
      confidence: 'exact',
    });
  });

  test('unrelated uploads do not match', () => {
    const matches = matchMirrorCandidates(
      [candidate({ title: 'Bible Study', lengthSeconds: 1800 })],
      [existing({ publishedAt: day('2026-09-20') })],
    );
    expect(matches).toEqual({});
  });
});

describe('mirrorCandidateDateWindow', () => {
  test('spans all candidates plus tolerance', () => {
    const window = mirrorCandidateDateWindow([
      candidate({ publishedAt: day('2026-01-10') }),
      candidate({ publishedAt: day('2026-03-01') }),
    ]);
    expect(window?.from.getTime()).toBeLessThan(day('2026-01-10').getTime());
    expect(window?.to.getTime()).toBeGreaterThan(day('2026-03-01').getTime());
  });

  test('is null for no candidates', () => {
    expect(mirrorCandidateDateWindow([])).toBeNull();
  });
});
