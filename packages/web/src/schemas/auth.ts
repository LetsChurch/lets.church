import { z } from 'zod';

export const loginSchema = z.object({
  id: z.string().min(1, 'Email or Username is required'),
  password: z.string().min(1, 'Password is required'),
  turnstile: z.string(),
});

export const registerSchema = z.object({
  email: z.email('Invalid email address'),
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string(),
  agreeToTheology: z
    .boolean()
    .refine(
      (val) => val === true,
      'You must agree to the Statement of Theology',
    ),
  agreeToTerms: z
    .boolean()
    .refine(
      (val) => val === true,
      'You must agree to the Terms and Conditions',
    ),
  subscribeNewsletter: z.boolean(),
  turnstile: z.string(),
});
