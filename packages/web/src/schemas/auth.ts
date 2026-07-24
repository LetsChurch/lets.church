import { z } from 'zod';

// Shared username validator. Disallow `@` (and whitespace) so a username can't
// be shaped like an email address and shadow another user's email at login /
// password recovery. Used by every path that writes AppUser.username
// (registration, self-service profile edit, and admin create/update).
export const usernameSchema = z
  .string()
  .min(1, 'Username is required')
  .regex(/^[^@\s]+$/, 'Username cannot contain "@" or spaces');

export const loginSchema = z.object({
  id: z.string().min(1, 'Email or Username is required'),
  password: z.string().min(1, 'Password is required'),
  hcaptchaToken: z.string().min(1, 'Please complete the CAPTCHA'),
});

export const registerSchema = z.object({
  email: z.email('Invalid email address'),
  username: usernameSchema,
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(1024, 'Password is too long'),
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
  hcaptchaToken: z.string().min(1, 'Please complete the CAPTCHA'),
});
