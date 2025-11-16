import { z } from 'zod';
import { IncomingIdSchema } from '../common';

export const organizationIdSchema = IncomingIdSchema;

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
    userId: IncomingIdSchema,
  })
  .and(organizationMemberPermissionsSchema);

export const removeOrganizationMemberSchema = z.object({
  orgId: organizationIdSchema,
  appUserId: IncomingIdSchema,
});

export const userSearchOrganizationSchema = z.object({
  orgId: organizationIdSchema,
  query: z.string().min(1),
});

export const organizationFormSchema = z.object({
  name: z.string().min(1, 'Organization name is required'),
  slug: z.string().optional(),
  description: z.string().optional(),
  websiteUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
  primaryEmail: z.string().email('Invalid email').optional().or(z.literal('')),
  primaryPhoneNumber: z.string().optional().or(z.literal('')),
  tags: z.array(z.string()).optional(),
});

export const createOrganizationSchema = organizationFormSchema;

export const updateOrganizationSchema = organizationFormSchema.extend({
  orgId: organizationIdSchema,
});

export const organizationRelationshipSchema = z.object({
  orgId: organizationIdSchema,
  downstreamOrganizationId: organizationIdSchema,
});

export const upstreamAssociationActionSchema = z.object({
  orgId: organizationIdSchema,
  downstreamOrganizationId: organizationIdSchema,
});

export const getAllOrganizationsSchema = z.object({
  excludeChurchTypes: z.boolean().optional().default(false),
});

export const searchOrganizationsSchema = z.object({
  query: z.string().min(2, 'Search query must be at least 2 characters'),
  excludeChurchTypes: z.boolean().optional().default(false),
  limit: z.number().int().positive().max(50).optional().default(10),
});

export const getOrganizationsByIdsSchema = z.object({
  organizationIds: z.array(IncomingIdSchema).max(100), // Reasonable limit
});
