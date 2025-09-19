import { z } from 'zod';

export const userIdSchema = z.uuid();

export const basePermissionsSchema = z.object({
  isAdmin: z.boolean().default(false),
  canEdit: z.boolean().default(false),
});

export const channelPermissionsSchema = basePermissionsSchema.extend({
  canUpload: z.boolean().default(true),
});

export const addMemberBaseSchema = z.object({
  userId: userIdSchema,
});

export const removeMemberBaseSchema = z.object({
  appUserId: userIdSchema,
});

export const userSearchBaseSchema = z.object({
  query: z.string().min(1),
});

export type BasePermissions = z.infer<typeof basePermissionsSchema>;
export type ChannelPermissions = z.infer<typeof channelPermissionsSchema>;

export type BaseMembershipUser = {
  id: string;
  username: string;
  fullName: string | null;
  avatarPath: string | null;
};

export type BaseMembership = {
  appUserId: string;
  isAdmin: boolean;
  canEdit: boolean;
  createdAt: Date;
  appUser: BaseMembershipUser;
};

export type ChannelMembershipWithUser = BaseMembership & {
  channelId: string;
  canUpload: boolean;
};

export type ChurchMembershipWithUser = BaseMembership & {
  organizationId: string;
};
