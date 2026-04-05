import {
  ChannelVisibility,
  UploadLicense,
  UploadListType,
  UploadVisibility,
} from '@letschurch/db/types';
import sanitizeFilename from 'sanitize-filename';
import { z } from 'zod';
import { IncomingIdSchema } from '../common';

// Common field schemas
export const channelIdSchema = IncomingIdSchema;
export const uploadIdSchema = IncomingIdSchema;
export const userIdSchema = IncomingIdSchema;
export const playlistIdSchema = IncomingIdSchema;

export const paginationSchema = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
});

// Channel schemas
export const channelFormSchema = z.object({
  name: z.string().min(1, 'Channel name is required'),
  slug: z
    .string()
    .min(1, 'Channel slug is required')
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      'Slug can only contain letters, numbers, underscores, and hyphens',
    ),
  description: z.string(),
  visibility: z.nativeEnum(ChannelVisibility),
  websiteUrl: z.url('Invalid URL').optional().or(z.literal('')),
  facebookUrl: z.url('Invalid URL').optional().or(z.literal('')),
  instagramUrl: z.url('Invalid URL').optional().or(z.literal('')),
  xUrl: z.url('Invalid URL').optional().or(z.literal('')),
  youtubeUrl: z.url('Invalid URL').optional().or(z.literal('')),
  tiktokUrl: z.url('Invalid URL').optional().or(z.literal('')),
  linkedinUrl: z.url('Invalid URL').optional().or(z.literal('')),
  threadsUrl: z.url('Invalid URL').optional().or(z.literal('')),
  applePodcastsUrl: z.url('Invalid URL').optional().or(z.literal('')),
  spotifyUrl: z.url('Invalid URL').optional().or(z.literal('')),
  rssUrl: z.url('Invalid URL').optional().or(z.literal('')),
  defaultUploadVisibility: z.nativeEnum(UploadVisibility).nullable().optional(),
  defaultUploadLicense: z.nativeEnum(UploadLicense).nullable().optional(),
  defaultUploadCommentsEnabled: z.boolean().nullable().optional(),
  defaultUploadDownloadsEnabled: z.boolean().nullable().optional(),
});

export const createChannelSchema = channelFormSchema;

export const updateChannelSchema = channelFormSchema.extend({
  channelId: channelIdSchema,
});

// Upload schemas
export const uploadFormSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string(),
  license: z.nativeEnum(UploadLicense),
  publishedAt: z.date(),
  visibility: z.nativeEnum(UploadVisibility),
  userCommentsEnabled: z.boolean(),
  downloadsEnabled: z.boolean(),
  seriesIds: z.array(z.string()),
});

export const updateUploadSchema = uploadFormSchema.extend({
  channelId: channelIdSchema,
  uploadId: uploadIdSchema,
});

// Member management schemas
export const memberPermissionsSchema = z.object({
  isAdmin: z.boolean().default(false),
  canEdit: z.boolean().default(false),
  canUpload: z.boolean().default(true),
  canDownload: z.boolean().default(false),
});

export const addMemberSchema = z
  .object({
    channelId: channelIdSchema,
    userId: userIdSchema,
  })
  .and(memberPermissionsSchema);

export const removeMemberSchema = z.object({
  channelId: channelIdSchema,
  appUserId: userIdSchema,
});

// Query input schemas
export const channelQuerySchema = z.object({
  channelId: channelIdSchema,
});

export const uploadQuerySchema = z.object({
  channelId: channelIdSchema,
  uploadId: uploadIdSchema,
});

export const channelUploadsQuerySchema = channelQuerySchema
  .and(paginationSchema)
  .and(
    z.object({
      search: z.string().optional(),
    }),
  );

export const userSearchSchema = z.object({
  channelId: channelIdSchema,
  query: z.string().min(1),
});

export const inviteChannelMemberSchema = z
  .object({
    channelId: channelIdSchema,
    email: z.preprocess(
      (val) => (typeof val === 'string' ? val.toLowerCase().trim() : val),
      z.email('Invalid email address'),
    ),
  })
  .and(memberPermissionsSchema);

export const respondToChannelInvitationSchema = z.object({
  token: IncomingIdSchema,
  accept: z.boolean(),
});

export const cancelChannelInvitationSchema = z.object({
  channelId: channelIdSchema,
  invitationId: IncomingIdSchema,
});

export const resendChannelInvitationSchema = z.object({
  channelId: channelIdSchema,
  invitationId: IncomingIdSchema,
});

export const createUploadSchema = z.object({
  channelId: channelIdSchema,
  originalFileName: z
    .string()
    .optional()
    .transform((val) => (val ? sanitizeFilename(val) : val)),
});

export const deleteUploadSchema = z.object({
  channelId: channelIdSchema,
  uploadId: uploadIdSchema,
});

export const bulkSetVisibilitySchema = z.object({
  channelId: channelIdSchema,
  uploadIds: z
    .array(uploadIdSchema)
    .min(1, 'At least one upload must be selected'),
  visibility: z.nativeEnum(UploadVisibility),
});

// Playlist schemas
export const playlistFormSchema = z.object({
  title: z.string().min(1, 'Playlist title is required'),
  type: z.nativeEnum(UploadListType).default('PLAYLIST'),
});

export const createPlaylistSchema = playlistFormSchema.extend({
  channelId: channelIdSchema,
});

export const updatePlaylistSchema = playlistFormSchema.extend({
  channelId: channelIdSchema,
  playlistId: playlistIdSchema,
});

export const playlistQuerySchema = z.object({
  channelId: channelIdSchema,
  playlistId: playlistIdSchema,
});

export const deletePlaylistSchema = z.object({
  channelId: channelIdSchema,
  playlistId: playlistIdSchema,
});

export const addToPlaylistSchema = z.object({
  channelId: channelIdSchema,
  playlistId: playlistIdSchema,
  uploadId: uploadIdSchema,
});

export const removeFromPlaylistSchema = z.object({
  channelId: channelIdSchema,
  playlistId: playlistIdSchema,
  uploadId: uploadIdSchema,
});

export const reorderPlaylistSchema = z.object({
  channelId: channelIdSchema,
  playlistId: playlistIdSchema,
  uploadIds: z.array(uploadIdSchema).min(1),
});

export const searchChannelSeriesSchema = z.object({
  channelId: channelIdSchema,
  query: z.string().min(1, 'Search query is required'),
});

export const importMediaSchema = z.object({
  channelId: channelIdSchema,
  url: z.url('Please enter a valid URL'),
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  license: z.nativeEnum(UploadLicense).default('STANDARD'),
  visibility: z.nativeEnum(UploadVisibility).default('PUBLIC'),
  publishedAt: z.date(),
  userCommentsEnabled: z.boolean().default(true),
  trimSilence: z.boolean().default(false),
});
