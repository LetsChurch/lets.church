import { z } from 'zod';

import { DONATION_MAX_CENTS, DONATION_MIN_CENTS } from '@/donations/amounts';

const donationAmountCentsSchema = z
  .number()
  .int()
  .min(DONATION_MIN_CENTS, 'Donation must be at least $5')
  .max(DONATION_MAX_CENTS, 'Donation cannot exceed $50,000');

export const donationCheckoutSchema = z.object({
  amountCents: donationAmountCentsSchema,
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

// $1M/month is far beyond any real line item; it just bounds admin input.
const BUDGET_MAX_MONTHLY_CENTS = 100_000_000;

export const donationBudgetCategorySchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, 'Enter a name').max(80),
  description: z.string().trim().max(280),
  monthlyAmountCents: z
    .number()
    .int()
    .min(0, 'Amount cannot be negative')
    .max(BUDGET_MAX_MONTHLY_CENTS),
  sortOrder: z.number().int().min(0).max(10_000),
});

export const donationUntrackedGiftSchema = z.object({
  id: z.uuid().optional(),
  label: z.string().trim().min(1, 'Enter a label').max(120),
  monthlyAmountCents: z
    .number()
    .int()
    .min(1, 'Amount must be more than zero')
    .max(BUDGET_MAX_MONTHLY_CENTS),
});

export const donationSubscriptionBudgetOffsetSchema = z.object({
  subscriptionId: z.uuid(),
  budgetOffsetCents: z
    .number()
    .int()
    .min(-BUDGET_MAX_MONTHLY_CENTS)
    .max(BUDGET_MAX_MONTHLY_CENTS),
  budgetOffsetNote: z.string().trim().max(200),
});

export const donationSubscriptionAmountSchema = z.object({
  subscriptionId: z.uuid(),
  amountCents: donationAmountCentsSchema,
  coverFees: z.boolean(),
});
