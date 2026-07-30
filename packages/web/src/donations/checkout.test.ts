import { describe, expect, it } from 'vitest';

import { donationCheckoutCustomerParams } from './checkout-customer';

describe('donation Checkout customer isolation', () => {
  it('uses the entered address for receipts without selecting a saved Customer', () => {
    expect(donationCheckoutCustomerParams(' Donor@Example.com ')).toEqual({
      customer_email: 'donor@example.com',
    });
    expect(
      donationCheckoutCustomerParams('donor@example.com'),
    ).not.toHaveProperty('customer');
  });
});
