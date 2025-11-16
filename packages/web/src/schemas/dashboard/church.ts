import { z } from 'zod';
import { AvatarSize, IncomingIdSchema } from '../common';

export const churchIdSchema = IncomingIdSchema;

export const churchQuerySchema = z.object({
  churchId: churchIdSchema,
  avatarSize: AvatarSize,
});

export const churchMemberPermissionsSchema = z.object({
  isAdmin: z.boolean().default(false),
  canEdit: z.boolean().default(false),
});

export const addChurchMemberSchema = z
  .object({
    churchId: churchIdSchema,
    userId: IncomingIdSchema,
  })
  .and(churchMemberPermissionsSchema);

export const removeChurchMemberSchema = z.object({
  churchId: churchIdSchema,
  appUserId: IncomingIdSchema,
});

export const userSearchChurchSchema = z.object({
  churchId: churchIdSchema,
  query: z.string().min(1),
});

export const channelSearchChurchSchema = z.object({
  churchId: churchIdSchema,
  query: z.string().min(1),
});

export const linkChannelSchema = z.object({
  churchId: churchIdSchema,
  channelId: IncomingIdSchema,
  officialChannel: z.boolean().default(false),
});

export const unlinkChannelSchema = z.object({
  churchId: churchIdSchema,
  channelId: IncomingIdSchema,
});

export const leaderTypeSchema = z.enum(['ELDER', 'DEACON', 'OTHER']);

export const addLeaderSchema = z.object({
  churchId: churchIdSchema,
  type: leaderTypeSchema,
  name: z.string().min(1, 'Name is required'),
  email: z
    .string()
    .optional()
    .refine(
      (val) => !val || val === '' || z.string().email().safeParse(val).success,
      'Invalid email',
    ),
  phoneNumber: z.string().optional(),
});

export const updateLeaderSchema = z.object({
  churchId: churchIdSchema,
  leaderId: IncomingIdSchema,
  type: leaderTypeSchema,
  name: z.string().min(1, 'Name is required'),
  email: z
    .string()
    .optional()
    .refine(
      (val) => !val || val === '' || z.string().email().safeParse(val).success,
      'Invalid email',
    ),
  phoneNumber: z.string().optional(),
});

export const removeLeaderSchema = z.object({
  churchId: churchIdSchema,
  leaderId: IncomingIdSchema,
});

export const createChurchSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  slug: z.string().optional(),
  description: z.string().optional(),
  websiteUrl: z
    .string()
    .optional()
    .refine(
      (val) => !val || val === '' || z.string().url().safeParse(val).success,
      'Invalid URL',
    ),
  primaryEmail: z
    .string()
    .optional()
    .refine(
      (val) => !val || val === '' || z.string().email().safeParse(val).success,
      'Invalid email',
    ),
  primaryPhoneNumber: z.string().optional(),
  tags: z.array(z.string()).optional(),
  associatedOrganizations: z.array(IncomingIdSchema).optional(),
});

export const updateChurchSchema = z.object({
  churchId: churchIdSchema,
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  websiteUrl: z
    .string()
    .optional()
    .refine(
      (val) => !val || val === '' || z.string().url().safeParse(val).success,
      'Invalid URL',
    ),
  primaryEmail: z
    .string()
    .optional()
    .refine(
      (val) => !val || val === '' || z.string().email().safeParse(val).success,
      'Invalid email',
    ),
  primaryPhoneNumber: z.string().optional(),
  tags: z.array(z.string()).optional(),
  associatedOrganizations: z.array(IncomingIdSchema).optional(),
});
