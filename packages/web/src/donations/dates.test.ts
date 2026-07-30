import { describe, expect, it } from 'vitest';

import { donationStatementYear, formatDonationDate } from './dates';

describe('donation dates', () => {
  it('uses UTC for tax years and displayed calendar dates', () => {
    const instant = new Date('2026-01-01T00:30:00.000Z');
    expect(donationStatementYear(instant)).toBe(2026);
    expect(formatDonationDate(instant)).toBe('1/1/2026');
  });
});
