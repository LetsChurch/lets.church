import { normalizeEmail } from '@/util/normalize-email';

/**
 * An entered email is receipt routing, not proof of identity. Never use it to
 * recover a stored Stripe Customer: that could expose or charge somebody
 * else's saved payment method. Stripe creates a fresh Customer as needed for
 * subscription-mode Checkout.
 */
export function donationCheckoutCustomerParams(email: string) {
  return {
    customer_email: normalizeEmail(email),
  } as const;
}
