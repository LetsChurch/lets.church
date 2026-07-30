import Stripe from 'stripe';
import { z } from 'zod';

const stripeEnvSchema = z.object({
  STRIPE_SECRET_KEY: z.string().min(1),
  WEB_URL: z.url(),
});

let stripeClient: Stripe | undefined;

export function getStripeConfig() {
  return stripeEnvSchema.parse(process.env);
}

export function getStripeWebhookSecret() {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;
}

export function getStripe() {
  if (!stripeClient) {
    const { STRIPE_SECRET_KEY } = getStripeConfig();
    stripeClient = new Stripe(STRIPE_SECRET_KEY, {
      appInfo: {
        name: "Let's Church Donations",
        version: '1.0.0',
      },
    });
  }

  return stripeClient;
}
