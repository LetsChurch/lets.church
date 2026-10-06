import { afterEach, describe, expect, test, vi } from 'vitest';

import { toLetsChurchPublishedAt } from './dates';

describe('toLetsChurchPublishedAt', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('keeps the local calendar date for an evening publish west of UTC', () => {
    vi.stubEnv('TZ', 'America/New_York');
    // Oct 1 2026, 9:48 PM in New York (Oct 2 01:48 UTC), as YouTube reports it.
    const published = Date.UTC(2026, 9, 2, 1, 48, 39);
    expect(toLetsChurchPublishedAt(published).toISOString()).toBe(
      '2026-10-01T00:00:00.000Z',
    );
  });

  test('keeps the local calendar date for a morning publish east of UTC', () => {
    vi.stubEnv('TZ', 'Asia/Tokyo');
    // Oct 1 2026, 7:00 AM in Tokyo (Sep 30 22:00 UTC).
    const published = Date.UTC(2026, 8, 30, 22, 0, 0);
    expect(toLetsChurchPublishedAt(published).toISOString()).toBe(
      '2026-10-01T00:00:00.000Z',
    );
  });
});
