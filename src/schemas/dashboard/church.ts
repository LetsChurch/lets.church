import { z } from 'zod';

export const churchIdSchema = z.uuid();

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
    userId: z.uuid(),
  })
  .and(churchMemberPermissionsSchema);

export const removeChurchMemberSchema = z.object({
  churchId: churchIdSchema,
  appUserId: z.uuid(),
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
  channelId: z.uuid(),
  officialChannel: z.boolean().default(false),
});

export const unlinkChannelSchema = z.object({
  churchId: churchIdSchema,
  channelId: z.uuid(),
});

export const leaderTypeSchema = z.enum(['ELDER', 'DEACON', 'OTHER']);

export const addLeaderSchema = z.object({
  churchId: churchIdSchema,
  type: leaderTypeSchema,
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phoneNumber: z.string().optional().or(z.literal('')),
});

export const updateLeaderSchema = z.object({
  churchId: churchIdSchema,
  leaderId: z.uuid(),
  type: leaderTypeSchema,
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phoneNumber: z.string().optional().or(z.literal('')),
});

export const removeLeaderSchema = z.object({
  churchId: churchIdSchema,
  leaderId: z.uuid(),
});
