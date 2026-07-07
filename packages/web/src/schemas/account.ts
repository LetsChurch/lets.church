import { z } from 'zod';

import { usernameSchema } from './auth';

export const profileUpdateSchema = z.object({
  fullName: z.string(),
  email: z.email('Invalid email address').min(1, 'Email is required'),
  username: usernameSchema,
});

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(1024, 'Password is too long'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });
