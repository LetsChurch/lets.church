import { afterEach, describe, expect, it, vi } from 'vitest';

import { getStripeWebhookSecret } from './stripe-client';

describe('getStripeWebhookSecret', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns null when the secret is unset or blank', () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '');
    expect(getStripeWebhookSecret()).toBeNull();

    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '   ');
    expect(getStripeWebhookSecret()).toBeNull();
  });

  it('returns a configured signing secret', () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '  whsec_test  ');
    expect(getStripeWebhookSecret()).toBe('whsec_test');
  });
});
