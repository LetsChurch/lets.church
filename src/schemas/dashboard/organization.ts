import { z } from 'zod';

export const organizationIdSchema = z.uuid();

export const organizationQuerySchema = z.object({
  orgId: organizationIdSchema,
});

export const organizationMemberPermissionsSchema = z.object({
  isAdmin: z.boolean().default(false),
  canEdit: z.boolean().default(false),
});

export const addOrganizationMemberSchema = z
  .object({
    orgId: organizationIdSchema,
    userId: z.uuid(),
  })
  .and(organizationMemberPermissionsSchema);

export const removeOrganizationMemberSchema = z.object({
  orgId: organizationIdSchema,
  appUserId: z.uuid(),
});

export const userSearchOrganizationSchema = z.object({
  orgId: organizationIdSchema,
  query: z.string().min(1),
});

export const updateOrganizationSchema = z.object({
  orgId: organizationIdSchema,
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  websiteUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
  primaryEmail: z.string().email('Invalid email').optional().or(z.literal('')),
  primaryPhoneNumber: z.string().optional().or(z.literal('')),
});
