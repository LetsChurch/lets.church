import { z } from 'zod';

import { DONATION_MAX_CENTS, DONATION_MIN_CENTS } from '@/donations/amounts';

export const donationCheckoutSchema = z.object({
  amountCents: z
    .number()
    .int()
    .min(DONATION_MIN_CENTS, 'Donation must be at least $5')
    .max(DONATION_MAX_CENTS, 'Donation cannot exceed $50,000'),
  frequency: z.enum(['ONE_TIME', 'MONTHLY']),
  coverFees: z.boolean(),
  email: z
    .string()
    .trim()
    .max(320)
    .pipe(z.email('Enter a valid email address')),
  name: z.string().trim().max(120),
  hcaptchaToken: z.string().min(1, 'Complete the CAPTCHA'),
});

export const checkoutStatusSchema = z.object({
  sessionId: z.string().min(1).max(255),
});
