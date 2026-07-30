import { describe, expect, it } from 'vitest';

import { donationCheckoutSchema } from '@/schemas/donations';
import { normalizeEmail } from '@/util/normalize-email';

describe('normalizeDonationEmail', () => {
  it('normalizes case and surrounding whitespace for donor linking', () => {
    expect(normalizeEmail('  Donor@Example.COM  ')).toBe('donor@example.com');
  });

  it('trims donor email input before validation', () => {
    const parsed = donationCheckoutSchema.parse({
      amountCents: 2_500,
      frequency: 'MONTHLY',
      coverFees: true,
      email: '  Donor@Example.COM  ',
      name: 'Donor',
      hcaptchaToken: 'token',
    });

    expect(parsed.email).toBe('Donor@Example.COM');
  });
});
