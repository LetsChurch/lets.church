import { describe, expect, test } from 'vitest';

import { creatorEmailLabel } from './creator-email';

describe('creatorEmailLabel', () => {
  test('returns null when there are no emails', () => {
    expect(creatorEmailLabel(undefined)).toBeNull();
    expect(creatorEmailLabel([])).toBeNull();
  });

  test('prefers a verified address', () => {
    expect(
      creatorEmailLabel([
        { email: 'new@example.com', verifiedAt: null },
        { email: 'old@example.com', verifiedAt: new Date() },
      ]),
    ).toBe('old@example.com');
  });

  test('falls back to an unverified address, flagged', () => {
    expect(
      creatorEmailLabel([{ email: 'new@example.com', verifiedAt: null }]),
    ).toBe('new@example.com (unverified)');
  });
});
