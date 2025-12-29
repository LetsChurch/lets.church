import { z } from 'zod';
import { IncomingIdSchema } from '../common';

export const churchIdSchema = IncomingIdSchema;

export const churchQuerySchema = z.object({
  churchId: churchIdSchema,
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
      (val) => !val || val === '' || z.email().safeParse(val).success,
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
      (val) => !val || val === '' || z.email().safeParse(val).success,
      'Invalid email',
    ),
  phoneNumber: z.string().optional(),
});

export const removeLeaderSchema = z.object({
  churchId: churchIdSchema,
  leaderId: IncomingIdSchema,
});

const addressTypeSchema = z.enum(['MAILING', 'MEETING', 'OFFICE', 'OTHER']);

const addressSchema = z.object({
  type: addressTypeSchema,
  name: z.string().optional(),
  streetAddress: z.string().optional(),
  locality: z.string().optional(),
  region: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  postOfficeBoxNumber: z.string().optional(),
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
      (val) => !val || val === '' || z.email().safeParse(val).success,
      'Invalid email',
    ),
  primaryPhoneNumber: z.string().optional(),
  tags: z.array(z.string()).optional(),
  associatedOrganizations: z.array(IncomingIdSchema).optional(),
  addresses: z.array(addressSchema).optional(),
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
      (val) => !val || val === '' || z.email().safeParse(val).success,
      'Invalid email',
    ),
  primaryPhoneNumber: z.string().optional(),
  tags: z.array(z.string()).optional(),
  associatedOrganizations: z.array(IncomingIdSchema).optional(),
  addresses: z.array(addressSchema).optional(),
  facebookUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
  instagramUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
  xUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
  youtubeUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
  tiktokUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
  linkedinUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
  threadsUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
  applePodcastsUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
  spotifyUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
  rssUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
});
