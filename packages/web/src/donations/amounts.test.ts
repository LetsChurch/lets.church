import { describe, expect, it } from 'vitest';

import {
  donationAmounts,
  estimatedFeeCoveredTotal,
  formatDonationAmount,
} from './amounts';

describe('donation amounts', () => {
  it('keeps the selected amount when fee coverage is off', () => {
    expect(donationAmounts(2_500, false)).toEqual({
      baseAmountCents: 2_500,
      feeCoverageCents: 0,
      amountCents: 2_500,
    });
  });

  it('grosses up the selected amount for the fee estimate', () => {
    expect(estimatedFeeCoveredTotal(2_500)).toBe(2_606);
    expect(donationAmounts(2_500, true)).toEqual({
      baseAmountCents: 2_500,
      feeCoverageCents: 106,
      amountCents: 2_606,
    });
  });

  it('formats cents as US currency', () => {
    expect(formatDonationAmount(2_500)).toBe('$25.00');
  });
});
