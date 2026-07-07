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
  websiteUrl: z
    .url({ protocol: /^https?$/, message: 'Invalid URL' })
    .optional()
    .or(z.literal('')),
  facebookUrl: z
    .url({ protocol: /^https?$/, message: 'Invalid URL' })
    .optional()
    .or(z.literal('')),
  instagramUrl: z
    .url({ protocol: /^https?$/, message: 'Invalid URL' })
    .optional()
    .or(z.literal('')),
  xUrl: z
    .url({ protocol: /^https?$/, message: 'Invalid URL' })
    .optional()
    .or(z.literal('')),
  youtubeUrl: z
    .url({ protocol: /^https?$/, message: 'Invalid URL' })
    .optional()
    .or(z.literal('')),
  tiktokUrl: z
    .url({ protocol: /^https?$/, message: 'Invalid URL' })
    .optional()
    .or(z.literal('')),
  linkedinUrl: z
    .url({ protocol: /^https?$/, message: 'Invalid URL' })
    .optional()
    .or(z.literal('')),
  threadsUrl: z
    .url({ protocol: /^https?$/, message: 'Invalid URL' })
    .optional()
    .or(z.literal('')),
  applePodcastsUrl: z
    .url({ protocol: /^https?$/, message: 'Invalid URL' })
    .optional()
    .or(z.literal('')),
  spotifyUrl: z
    .url({ protocol: /^https?$/, message: 'Invalid URL' })
    .optional()
    .or(z.literal('')),
  rssUrl: z
    .url({ protocol: /^https?$/, message: 'Invalid URL' })
    .optional()
    .or(z.literal('')),
  defaultUploadVisibility: z.nativeEnum(UploadVisibility).nullable().optional(),
  defaultUploadLicense: z.nativeEnum(UploadLicense).nullable().optional(),
  defaultUploadCommentsEnabled: z.boolean().nullable().optional(),
  defaultUploadDownloadsEnabled: z.boolean().nullable().optional(),
});

// On create, a blank slug is allowed: the create procedure auto-generates one
// from the name (mirrors churches). Editing keeps the slug required so an
// existing channel's web address can't be blanked out.
export const createChannelSchema = channelFormSchema.extend({
  slug: z
    .string()
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      'Slug can only contain letters, numbers, underscores, and hyphens',
    )
    .optional()
    .or(z.literal('')),
});

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
  seriesId: z.string().nullable(),
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

// Speaker library schemas
export const speakerIdSchema = IncomingIdSchema;
const speakerLabelSchema = z.string().trim().min(1).max(120);

export const uploadSpeakerQuerySchema = z.object({
  channelId: channelIdSchema,
  uploadId: uploadIdSchema,
});

export const setParagraphLabelSchema = z.object({
  channelId: channelIdSchema,
  uploadId: uploadIdSchema,
  paragraphId: IncomingIdSchema,
  label: speakerLabelSchema,
});

// Batched save of a labeling session: paragraph-label overrides + label→speaker
// attributions applied in one transaction with a single reindex. A null
// speakerId unassigns the label.
export const saveSpeakerLabelingSchema = z.object({
  channelId: channelIdSchema,
  uploadId: uploadIdSchema,
  paragraphLabels: z
    .array(
      z.object({
        paragraphId: IncomingIdSchema,
        label: speakerLabelSchema,
      }),
    )
    .default([]),
  attributions: z
    .array(
      z.object({
        speakerLabel: speakerLabelSchema,
        speakerId: speakerIdSchema.nullable(),
      }),
    )
    .default([]),
});

export const attributeSpeakerSchema = z.object({
  channelId: channelIdSchema,
  uploadId: uploadIdSchema,
  speakerLabel: speakerLabelSchema,
  speakerId: speakerIdSchema,
});

export const unattributeSpeakerSchema = z.object({
  channelId: channelIdSchema,
  uploadId: uploadIdSchema,
  speakerLabel: speakerLabelSchema,
});

export const suggestSpeakerCandidatesSchema = z.object({
  channelId: channelIdSchema,
  uploadId: uploadIdSchema,
  speakerLabel: speakerLabelSchema,
});

export const createSpeakerSchema = z.object({
  channelId: channelIdSchema,
  name: z.string().trim().min(1, 'Name is required').max(200),
  slug: z
    .string()
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'Slug can only contain lowercase letters, numbers, and hyphens',
    )
    .optional(),
  bio: z.string().max(2000).optional(),
});

export const updateSpeakerSchema = z.object({
  channelId: channelIdSchema,
  speakerId: speakerIdSchema,
  name: z.string().trim().min(1).max(200).optional(),
  bio: z.string().max(2000).nullable().optional(),
});

export const deleteSpeakerSchema = z.object({
  channelId: channelIdSchema,
  speakerId: speakerIdSchema,
});

export const searchSpeakersSchema = z.object({
  channelId: channelIdSchema,
  query: z.string().trim().min(1).max(200),
});

// Site-admin speaker search. Without `channelId` it spans every channel (the
// merge target picker); with one it's scoped to that channel's assignable pool
// (own + ACCEPTED links), for picking an existing speaker to attribute a queue
// cluster to. `excludeId` drops one speaker (e.g. a merge's source).
export const adminSearchSpeakersSchema = z.object({
  query: z.string().trim().min(1).max(200),
  channelId: channelIdSchema.optional(),
  excludeId: speakerIdSchema.optional(),
});

// Merge the `sourceId` speaker into `targetId`: move every attribution, link,
// and tag request onto the target, then permanently delete the source.
export const mergeSpeakersSchema = z.object({
  sourceId: speakerIdSchema,
  targetId: speakerIdSchema,
});

export const requestSpeakerLinkSchema = z.object({
  channelId: channelIdSchema,
  speakerId: speakerIdSchema,
  forUploadId: uploadIdSchema.optional(),
});

export const speakerLinkActionSchema = z.object({
  channelId: channelIdSchema,
  linkId: IncomingIdSchema,
});

export const approveSpeakerLinkSchema = z.object({
  channelId: channelIdSchema,
  linkId: IncomingIdSchema,
  scope: z.enum(['upload', 'channel']),
});

// One (upload, effective-label) → speaker assignment from the labeling queue.
export const speakerAssignmentSchema = z.object({
  uploadId: uploadIdSchema,
  speakerLabel: speakerLabelSchema,
  speakerId: speakerIdSchema,
});

// Per-channel labeling queue (channel admins).
export const getSpeakerLabelingQueueSchema = z.object({
  channelId: channelIdSchema,
  minMatchPercent: z.number().min(0).max(100).optional(),
  // Pagination over the unlabeled segments (most-spoken first). One page bounds
  // the per-request scan + kNN + clustering so large channels don't time out.
  limit: z.number().min(1).max(500).optional(),
  offset: z.number().min(0).optional(),
});

export const getSpeakerAppearancesSchema = z.object({
  channelId: channelIdSchema,
  limit: z.number().min(1).max(500).optional(),
  offset: z.number().min(0).optional(),
});

export const assignSpeakerLabelsSchema = z.object({
  channelId: channelIdSchema,
  assignments: z.array(speakerAssignmentSchema).min(1).max(500),
});

// Site-admin labeling queue (across all channels).
export const adminLabelingQueueSchema = z.object({
  minMatchPercent: z.number().min(0).max(100).optional(),
  limit: z.number().min(1).max(1000).optional(),
  offset: z.number().min(0).optional(),
});

export const adminAssignSpeakerLabelsSchema = z.object({
  assignments: z.array(speakerAssignmentSchema).min(1).max(500),
});

// Mass-mark a cluster of unlabeled segments as one new speaker.
const clusterMemberSchema = z.object({
  uploadId: uploadIdSchema,
  speakerLabel: speakerLabelSchema,
});

export const createSpeakerFromClusterSchema = z.object({
  channelId: channelIdSchema,
  name: z.string().trim().min(1, 'Name is required').max(200),
  members: z.array(clusterMemberSchema).min(1).max(500),
});

export const adminCreateSpeakerFromClusterSchema = z.object({
  channelId: channelIdSchema,
  name: z.string().trim().min(1, 'Name is required').max(200),
  members: z.array(clusterMemberSchema).min(1).max(500),
});

// Owner asks the content channel to tag its speaker on another channel's upload.
export const requestSpeakerTagSchema = z.object({
  channelId: channelIdSchema,
  speakerId: speakerIdSchema,
  uploadId: uploadIdSchema,
  speakerLabel: speakerLabelSchema,
});

export const tagRequestActionSchema = z.object({
  channelId: channelIdSchema,
  requestId: IncomingIdSchema,
});

export const adminSpeakersPageSchema = z.object({
  page: z.number().min(1).default(1),
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
  // NOTE: scheme restriction only. Full SSRF protection (blocking
  // loopback/private/link-local/metadata IPs after DNS resolution, redirect
  // revalidation) must be enforced in the import worker before fetching.
  url: z.url({ protocol: /^https?$/, message: 'Please enter a valid URL' }),
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  license: z.nativeEnum(UploadLicense).default('STANDARD'),
  visibility: z.nativeEnum(UploadVisibility).default('PUBLIC'),
  publishedAt: z.date(),
  userCommentsEnabled: z.boolean().default(true),
  trimSilence: z.boolean().default(false),
});
