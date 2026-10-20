import { describe, expect, it } from 'vitest';

import {
  donationAmounts,
  estimatedCardFeeCents,
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

  it('estimates the card fee on a charge', () => {
    expect(estimatedCardFeeCents(10_000)).toBe(320);
    // The fee on a grossed-up charge is the coverage that was added.
    expect(estimatedCardFeeCents(estimatedFeeCoveredTotal(2_500))).toBe(106);
  });

  it('formats cents as US currency', () => {
    expect(formatDonationAmount(2_500)).toBe('$25.00');
  });
});
