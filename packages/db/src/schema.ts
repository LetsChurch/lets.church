import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  doublePrecision,
  foreignKey,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const AppUserRole = pgEnum('app_user_role', ['USER', 'ADMIN']);

export const TagColor = pgEnum('TagColor', [
  'GRAY',
  'RED',
  'YELLOW',
  'GREEN',
  'BLUE',
  'INDIGO',
  'PURPLE',
  'PINK',
]);

export const OrganizationType = pgEnum('organization_type', [
  'CHURCH',
  'MINISTRY',
]);

export const InvitationStatus = pgEnum('invitation_status', [
  'PENDING',
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
  'CANCELLED',
]);

export const OrganizationTagCategory = pgEnum('organization_tag_category', [
  'DENOMINATION',
  'DOCTRINE',
  'ESCHATOLOGY',
  'WORSHIP',
  'CONFESSION',
  'GOVERNMENT',
  'OTHER',
]);

export const AddressType = pgEnum('address_type', [
  'MAILING',
  'MEETING',
  'OFFICE',
  'OTHER',
]);

export const OrganizationLeaderType = pgEnum('organization_leader_type', [
  'ELDER',
  'DEACON',
  'OTHER',
]);

export const ChannelVisibility = pgEnum('channel_visibility', [
  'PUBLIC',
  'PRIVATE',
  'UNLISTED',
]);

export const UploadLicense = pgEnum('upload_license', [
  'STANDARD',
  'PUBLIC_DOMAIN',
  'CC_BY',
  'CC_BY_SA',
  'CC_BY_NC',
  'CC_BY_NC_SA',
  'CC_BY_ND',
  'CC_BY_NC_ND',
  'CC0',
]);

export const UploadVisibility = pgEnum('upload_visibility', [
  'PUBLIC',
  'PRIVATE',
  'UNLISTED',
]);

export const UploadVariant = pgEnum('upload_variant', [
  'VIDEO_4K',
  'VIDEO_4K_DOWNLOAD',
  'VIDEO_1080P',
  'VIDEO_1080P_DOWNLOAD',
  'VIDEO_720P',
  'VIDEO_720P_DOWNLOAD',
  'VIDEO_480P',
  'VIDEO_480P_DOWNLOAD',
  'VIDEO_360P',
  'VIDEO_360P_DOWNLOAD',
  'AUDIO',
  'AUDIO_DOWNLOAD',
]);

export const UploadStateType = pgEnum('upload_state_type', [
  'MEDIA',
  'THUMBNAIL',
  'PROFILE_AVATAR',
  'CHANNEL_AVATAR',
  'CHANNEL_COVER',
  'ORGANIZATION_AVATAR',
  'ORGANIZATION_COVER',
  'CHANNEL_DEFAULT_THUMBNAIL',
]);

export const BackupStatus = pgEnum('backup_status', [
  'NOT_BACKED_UP',
  'BACKING_UP',
  'BACKED_UP',
  'BACKUP_FAILED',
]);

export const Rating = pgEnum('rating', ['LIKE', 'DISLIKE']);

export const UploadViewSource = pgEnum('upload_view_source', [
  'WEBSITE',
  'EMBED',
]);

export const UploadListType = pgEnum('upload_list_type', [
  'SERIES',
  'PLAYLIST',
]);

export const NewsletterListType = pgEnum('newsletter_list_type', [
  'public',
  'private',
]);

export const NewsletterListOptin = pgEnum('newsletter_list_optin', [
  'single',
  'double',
]);

export const ChannelImportSourceWorkflowStatus = pgEnum(
  'channel_import_source_workflow_status',
  ['NOT_STARTED', 'RUNNING', 'PAUSED', 'FAILED'],
);

export const ChannelImportRunStatus = pgEnum('channel_import_run_status', [
  'IN_PROGRESS',
  'COMPLETED',
  'FAILED',
  'PARTIAL',
]);

export const TrackingSalt = pgTable('tracking_salt', {
  id: serial('id').notNull().primaryKey(),
  salt: integer('salt').notNull(),
  createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
});

export const AppUser = pgTable('app_user', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: text('username').notNull().unique(),
  password: text('password').notNull(),
  fullName: text('full_name'),
  avatarPath: text('avatar_path'),
  avatarBlurhash: text('avatar_blurhash'),
  createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { precision: 3 }).notNull(),
  deletedAt: timestamp('deleted_at', { precision: 3 }),
  role: AppUserRole('role').notNull().default('USER'),
});

export const AppUserEmail = pgTable(
  'app_user_email',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appUserId: uuid('app_user_id').notNull(),
    email: text('email').notNull().unique(),
    key: uuid('key').notNull().defaultRandom(),
    verifiedAt: timestamp('verified_at', { precision: 3 }),
  },
  (AppUserEmail) => ({
    app_user_email_appUser_fkey: foreignKey({
      name: 'app_user_email_appUser_fkey',
      columns: [AppUserEmail.appUserId],
      foreignColumns: [AppUser.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
  }),
);

export const AppSession = pgTable(
  'app_session',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appUserId: uuid('app_user_id').notNull(),
    expiresAt: timestamp('expires_at', { precision: 3 })
      .notNull()
      .default(sql`(now() + '30 days'::interval)`),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { precision: 3 }).notNull(),
    deletedAt: timestamp('deleted_at', { precision: 3 }),
  },
  (AppSession) => ({
    app_session_appUser_fkey: foreignKey({
      name: 'app_session_appUser_fkey',
      columns: [AppSession.appUserId],
      foreignColumns: [AppUser.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
  }),
);

export const ChannelSubscription = pgTable(
  'channel_subscription',
  {
    appUserId: uuid('app_user_id').notNull(),
    channelId: uuid('channel_id').notNull(),
  },
  (ChannelSubscription) => ({
    channel_subscription_appUser_fkey: foreignKey({
      name: 'channel_subscription_appUser_fkey',
      columns: [ChannelSubscription.appUserId],
      foreignColumns: [AppUser.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    channel_subscription_channel_fkey: foreignKey({
      name: 'channel_subscription_channel_fkey',
      columns: [ChannelSubscription.channelId],
      foreignColumns: [Channel.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    ChannelSubscription_cpk: primaryKey({
      name: 'ChannelSubscription_cpk',
      columns: [ChannelSubscription.appUserId, ChannelSubscription.channelId],
    }),
  }),
);

export const OrganizationTag = pgTable('organization_tag', {
  slug: text('slug').notNull().unique(),
  label: text('label').notNull(),
  description: text('description'),
  moreInfoLink: text('more_info_link'),
  category: OrganizationTagCategory('category').notNull(),
  color: TagColor('color').notNull().default('GRAY'),
});

export const OrganizationTagSuggestion = pgTable(
  'organization_tag_suggestion',
  {
    parentSlug: text('parent_slug').notNull(),
    suggestedSlug: text('recommended_slug').notNull(),
  },
  (OrganizationTagSuggestion) => ({
    organization_tag_suggestion_parent_fkey: foreignKey({
      name: 'organization_tag_suggestion_parent_fkey',
      columns: [OrganizationTagSuggestion.parentSlug],
      foreignColumns: [OrganizationTag.slug],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    organization_tag_suggestion_suggested_fkey: foreignKey({
      name: 'organization_tag_suggestion_suggested_fkey',
      columns: [OrganizationTagSuggestion.suggestedSlug],
      foreignColumns: [OrganizationTag.slug],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    OrganizationTagSuggestion_cpk: primaryKey({
      name: 'OrganizationTagSuggestion_cpk',
      columns: [
        OrganizationTagSuggestion.parentSlug,
        OrganizationTagSuggestion.suggestedSlug,
      ],
    }),
  }),
);

export const OrganizationTagInstance = pgTable(
  'organization_tag_instance',
  {
    organizationId: uuid('organization_id').notNull(),
    tagSlug: text('tag_slug').notNull(),
  },
  (OrganizationTagInstance) => ({
    organization_tag_instance_organization_fkey: foreignKey({
      name: 'organization_tag_instance_organization_fkey',
      columns: [OrganizationTagInstance.organizationId],
      foreignColumns: [Organization.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    organization_tag_instance_tag_fkey: foreignKey({
      name: 'organization_tag_instance_tag_fkey',
      columns: [OrganizationTagInstance.tagSlug],
      foreignColumns: [OrganizationTag.slug],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    OrganizationTagInstance_cpk: primaryKey({
      name: 'OrganizationTagInstance_cpk',
      columns: [
        OrganizationTagInstance.organizationId,
        OrganizationTagInstance.tagSlug,
      ],
    }),
  }),
);

export const Organization = pgTable(
  'organization',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: OrganizationType('type').notNull().default('MINISTRY'),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    avatarPath: text('avatar_path'),
    coverPath: text('cover_path'),
    primaryEmail: text('primary_email'),
    primaryPhoneNumber: text('primary_phone_number'),
    websiteUrl: text('website_url'),
    facebookUrl: text('facebook_url'),
    instagramUrl: text('instagram_url'),
    xUrl: text('x_url'),
    youtubeUrl: text('youtube_url'),
    tiktokUrl: text('tiktok_url'),
    linkedinUrl: text('linkedin_url'),
    threadsUrl: text('threads_url'),
    applePodcastsUrl: text('apple_podcasts_url'),
    spotifyUrl: text('spotify_url'),
    rssUrl: text('rss_url'),
    description: text('description'),
    automaticallyApproveOrganizationAssociations: boolean(
      'automatically_approve_organization_associations',
    ).notNull(),
    approvedById: uuid('approved_by_id'),
    approvedAt: timestamp('approved_at', { precision: 3 }),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { precision: 3 }).notNull(),
  },
  (Organization) => ({
    organization_approvedBy_fkey: foreignKey({
      name: 'organization_approvedBy_fkey',
      columns: [Organization.approvedById],
      foreignColumns: [AppUser.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
  }),
);

export const OrganizationAddress = pgTable(
  'organization_address',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull(),
    type: AddressType('type').notNull(),
    name: text('name'),
    query: text('query'),
    geocodingJson: jsonb('geocoding_json'),
    country: text('country'),
    locality: text('locality'),
    region: text('region'),
    postOfficeBoxNumber: text('post_office_box_number'),
    postalCode: text('postal_code'),
    streetAddress: text('street_address'),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
  },
  (OrganizationAddress) => ({
    organization_address_organization_fkey: foreignKey({
      name: 'organization_address_organization_fkey',
      columns: [OrganizationAddress.organizationId],
      foreignColumns: [Organization.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
  }),
);

export const OrganizationLeader = pgTable(
  'organization_leader',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull(),
    type: OrganizationLeaderType('type').notNull(),
    name: text('name'),
    email: text('email'),
    phoneNumber: text('phone_number'),
  },
  (OrganizationLeader) => ({
    organization_leader_organization_fkey: foreignKey({
      name: 'organization_leader_organization_fkey',
      columns: [OrganizationLeader.organizationId],
      foreignColumns: [Organization.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
  }),
);

export const OrganizationMembership = pgTable(
  'organization_membership',
  {
    organizationId: uuid('organization_id').notNull(),
    appUserId: uuid('app_user_id').notNull(),
    isAdmin: boolean('is_admin').notNull(),
    canEdit: boolean('can_edit').notNull(),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { precision: 3 }).notNull(),
  },
  (OrganizationMembership) => ({
    organization_membership_organization_fkey: foreignKey({
      name: 'organization_membership_organization_fkey',
      columns: [OrganizationMembership.organizationId],
      foreignColumns: [Organization.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    organization_membership_appUser_fkey: foreignKey({
      name: 'organization_membership_appUser_fkey',
      columns: [OrganizationMembership.appUserId],
      foreignColumns: [AppUser.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    OrganizationMembership_cpk: primaryKey({
      name: 'OrganizationMembership_cpk',
      columns: [
        OrganizationMembership.organizationId,
        OrganizationMembership.appUserId,
      ],
    }),
  }),
);

export const OrganizationInvitation = pgTable(
  'organization_invitation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull(),
    email: text('email').notNull(),
    token: uuid('token').notNull().unique().defaultRandom(),
    status: InvitationStatus('status').notNull().default('PENDING'),
    isAdmin: boolean('is_admin').notNull(),
    canEdit: boolean('can_edit').notNull(),
    invitedById: uuid('invited_by_id').notNull(),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { precision: 3 }).notNull(),
    respondedAt: timestamp('responded_at', { precision: 3 }),
  },
  (OrganizationInvitation) => ({
    organization_invitation_organization_fkey: foreignKey({
      name: 'organization_invitation_organization_fkey',
      columns: [OrganizationInvitation.organizationId],
      foreignColumns: [Organization.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    organization_invitation_invitedBy_fkey: foreignKey({
      name: 'organization_invitation_invitedBy_fkey',
      columns: [OrganizationInvitation.invitedById],
      foreignColumns: [AppUser.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    OrganizationInvitation_organizationId_email_unique_idx: uniqueIndex(
      'OrganizationInvitation_organizationId_email_key',
    ).on(OrganizationInvitation.organizationId, OrganizationInvitation.email),
  }),
);

export const OrganizationOrganizationAssociation = pgTable(
  'organization_organization_association',
  {
    upstreamOrganizationId: uuid('upstream_organization_id').notNull(),
    downstreamOrganizationId: uuid('downstream_organization_id').notNull(),
    upstreamApproved: boolean('upstream_approved').notNull(),
    downstreamApproved: boolean('downstream_approved').notNull(),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { precision: 3 }).notNull(),
  },
  (OrganizationOrganizationAssociation) => ({
    organization_organization_association_upstreamOrganization_fkey: foreignKey(
      {
        name: 'organization_organization_association_upstreamOrganization_fkey',
        columns: [OrganizationOrganizationAssociation.upstreamOrganizationId],
        foreignColumns: [Organization.id],
      },
    )
      .onDelete('cascade')
      .onUpdate('cascade'),
    organization_organization_association_downstreamOrganization_fkey:
      foreignKey({
        name: 'organization_organization_association_downstreamOrganization_fkey',
        columns: [OrganizationOrganizationAssociation.downstreamOrganizationId],
        foreignColumns: [Organization.id],
      })
        .onDelete('cascade')
        .onUpdate('cascade'),
    OrganizationOrganizationAssociation_cpk: primaryKey({
      name: 'OrganizationOrganizationAssociation_cpk',
      columns: [
        OrganizationOrganizationAssociation.upstreamOrganizationId,
        OrganizationOrganizationAssociation.downstreamOrganizationId,
      ],
    }),
  }),
);

export const OrganizationChannelAssociation = pgTable(
  'organization_channel_association',
  {
    organizationId: uuid('organization_id').notNull(),
    channelId: uuid('channel_id').notNull(),
    officialChannel: boolean('official_channel').notNull(),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { precision: 3 }).notNull(),
  },
  (OrganizationChannelAssociation) => ({
    organization_channel_association_organization_fkey: foreignKey({
      name: 'organization_channel_association_organization_fkey',
      columns: [OrganizationChannelAssociation.organizationId],
      foreignColumns: [Organization.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    organization_channel_association_channel_fkey: foreignKey({
      name: 'organization_channel_association_channel_fkey',
      columns: [OrganizationChannelAssociation.channelId],
      foreignColumns: [Channel.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    OrganizationChannelAssociation_cpk: primaryKey({
      name: 'OrganizationChannelAssociation_cpk',
      columns: [
        OrganizationChannelAssociation.organizationId,
        OrganizationChannelAssociation.channelId,
      ],
    }),
  }),
);

export const Channel = pgTable(
  'channel',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    visibility: ChannelVisibility('visibility').notNull().default('PUBLIC'),
    avatarPath: text('avatar_path'),
    avatarBlurhash: text('avatar_blurhash'),
    coverPath: text('cover_path'),
    coverBlurhash: text('cover_blurhash'),
    slug: text('slug').notNull().unique(),
    description: text('description'),
    websiteUrl: text('website_url'),
    facebookUrl: text('facebook_url'),
    instagramUrl: text('instagram_url'),
    xUrl: text('x_url'),
    youtubeUrl: text('youtube_url'),
    tiktokUrl: text('tiktok_url'),
    linkedinUrl: text('linkedin_url'),
    threadsUrl: text('threads_url'),
    applePodcastsUrl: text('apple_podcasts_url'),
    spotifyUrl: text('spotify_url'),
    rssUrl: text('rss_url'),
    approvedById: uuid('approved_by_id'),
    approvedAt: timestamp('approved_at', { precision: 3 }),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { precision: 3 }).notNull(),
    deletedAt: timestamp('deleted_at', { precision: 3 }),
    defaultThumbnailPath: text('default_thumbnail_path'),
    defaultThumbnailBlurhash: text('default_thumbnail_blurhash'),
    defaultUploadVisibility: UploadVisibility('default_upload_visibility'),
    defaultUploadLicense: UploadLicense('default_upload_license'),
    defaultUploadCommentsEnabled: boolean('default_upload_comments_enabled'),
    defaultUploadDownloadsEnabled: boolean('default_upload_downloads_enabled'),
  },
  (Channel) => ({
    channel_approvedBy_fkey: foreignKey({
      name: 'channel_approvedBy_fkey',
      columns: [Channel.approvedById],
      foreignColumns: [AppUser.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
  }),
);

export const ChannelMembership = pgTable(
  'channel_membership',
  {
    channelId: uuid('channel_id').notNull(),
    appUserId: uuid('app_user_id').notNull(),
    isAdmin: boolean('is_admin').notNull(),
    canEdit: boolean('can_edit').notNull(),
    canUpload: boolean('can_upload').notNull().default(true),
    canDownload: boolean('can_download').notNull(),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { precision: 3 }).notNull(),
  },
  (ChannelMembership) => ({
    channel_membership_channel_fkey: foreignKey({
      name: 'channel_membership_channel_fkey',
      columns: [ChannelMembership.channelId],
      foreignColumns: [Channel.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    channel_membership_appUser_fkey: foreignKey({
      name: 'channel_membership_appUser_fkey',
      columns: [ChannelMembership.appUserId],
      foreignColumns: [AppUser.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    ChannelMembership_cpk: primaryKey({
      name: 'ChannelMembership_cpk',
      columns: [ChannelMembership.channelId, ChannelMembership.appUserId],
    }),
  }),
);

export const ChannelInvitation = pgTable(
  'channel_invitation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    channelId: uuid('channel_id').notNull(),
    email: text('email').notNull(),
    token: uuid('token').notNull().unique().defaultRandom(),
    status: InvitationStatus('status').notNull().default('PENDING'),
    isAdmin: boolean('is_admin').notNull(),
    canEdit: boolean('can_edit').notNull(),
    canUpload: boolean('can_upload').notNull().default(true),
    canDownload: boolean('can_download').notNull(),
    invitedById: uuid('invited_by_id').notNull(),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { precision: 3 }).notNull(),
    respondedAt: timestamp('responded_at', { precision: 3 }),
  },
  (ChannelInvitation) => ({
    channel_invitation_channel_fkey: foreignKey({
      name: 'channel_invitation_channel_fkey',
      columns: [ChannelInvitation.channelId],
      foreignColumns: [Channel.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    channel_invitation_invitedBy_fkey: foreignKey({
      name: 'channel_invitation_invitedBy_fkey',
      columns: [ChannelInvitation.invitedById],
      foreignColumns: [AppUser.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    ChannelInvitation_channelId_email_unique_idx: uniqueIndex(
      'ChannelInvitation_channelId_email_key',
    ).on(ChannelInvitation.channelId, ChannelInvitation.email),
  }),
);

export const UploadState = pgTable(
  'upload_state',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    s3Key: text('s3_key').notNull().unique(),
    s3Bucket: text('s3_bucket').notNull(),
    uploadType: UploadStateType('upload_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'bigint' }),
    uploadRecordId: uuid('upload_record_id'),
    appUserId: uuid('app_user_id'),
    channelId: uuid('channel_id'),
    organizationId: uuid('organization_id'),
    backupStatus: BackupStatus('backup_status')
      .notNull()
      .default('NOT_BACKED_UP'),
    backupKey: text('backup_key'),
    backedUpAt: timestamp('backed_up_at', { precision: 3 }),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { precision: 3 }).notNull(),
  },
  (UploadState) => ({
    upload_state_uploadRecord_fkey: foreignKey({
      name: 'upload_state_uploadRecord_fkey',
      columns: [UploadState.uploadRecordId],
      foreignColumns: [UploadRecord.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
    upload_state_appUser_fkey: foreignKey({
      name: 'upload_state_appUser_fkey',
      columns: [UploadState.appUserId],
      foreignColumns: [AppUser.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
    upload_state_channel_fkey: foreignKey({
      name: 'upload_state_channel_fkey',
      columns: [UploadState.channelId],
      foreignColumns: [Channel.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
    upload_state_organization_fkey: foreignKey({
      name: 'upload_state_organization_fkey',
      columns: [UploadState.organizationId],
      foreignColumns: [Organization.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
  }),
);

export const UploadRecord = pgTable(
  'upload_record',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title'),
    description: text('description'),
    appUserId: uuid('app_user_id').notNull(),
    license: UploadLicense('license').notNull(),
    channelId: uuid('channel_id').notNull(),
    visibility: UploadVisibility('visibility').notNull(),
    uploadSizeBytes: bigint('upload_size_bytes', { mode: 'bigint' }),
    uploadFinalized: boolean('upload_finalized').notNull(),
    uploadFinalizedAt: timestamp('upload_finalized_at', { precision: 3 }),
    uploadFinalizedById: uuid('upload_finalized_by_id'),
    finalizedUploadKey: text('finalized_upload_key'),
    originalFileName: text('original_file_name'),
    probe: jsonb('probe'),
    defaultThumbnailPath: text('default_thumbnail_path'),
    defaultThumbnailBlurhash: text('default_thumbnail_blurhash'),
    overrideThumbnailPath: text('override_thumbnail_path'),
    overrideThumbnailBlurhash: text('override_thumbnail_blurhash'),
    thumbnailCount: integer('thumbnail_count'),
    lengthSeconds: doublePrecision('length_seconds'),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { precision: 3 }).notNull(),
    publishedAt: timestamp('published_at', { precision: 3 })
      .notNull()
      .defaultNow(),
    transcodingStartedAt: timestamp('transcoding_started_at', { precision: 3 }),
    transcodingFinishedAt: timestamp('transcoding_finished_at', {
      precision: 3,
    }),
    transcodingProgress: doublePrecision('transcoding_progress').notNull(),
    transcribingStartedAt: timestamp('transcribing_started_at', {
      precision: 3,
    }),
    transcribingFinishedAt: timestamp('transcribing_finished_at', {
      precision: 3,
    }),
    deletedAt: timestamp('deleted_at', { precision: 3 }),
    variants: UploadVariant('variants').array().notNull(),
    score: doublePrecision('score').notNull(),
    scoreStaleAt: timestamp('score_stale_at', { precision: 3 }).defaultNow(),
    userCommentsEnabled: boolean('user_comments_enabled')
      .notNull()
      .default(true),
    downloadsEnabled: boolean('downloads_enabled').notNull().default(true),
  },
  (UploadRecord) => ({
    upload_record_createdBy_fkey: foreignKey({
      name: 'upload_record_createdBy_fkey',
      columns: [UploadRecord.appUserId],
      foreignColumns: [AppUser.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    upload_record_channel_fkey: foreignKey({
      name: 'upload_record_channel_fkey',
      columns: [UploadRecord.channelId],
      foreignColumns: [Channel.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    upload_record_uploadFinalizedBy_fkey: foreignKey({
      name: 'upload_record_uploadFinalizedBy_fkey',
      columns: [UploadRecord.uploadFinalizedById],
      foreignColumns: [AppUser.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
  }),
);

export const UploadRecordDownloadSize = pgTable(
  'upload_record_download_size',
  {
    uploadRecordId: uuid('upload_record_id').notNull(),
    variant: UploadVariant('variant').notNull(),
    bytes: bigint('size_bytes', { mode: 'bigint' }).notNull(),
  },
  (UploadRecordDownloadSize) => ({
    upload_record_download_size_uploadRecord_fkey: foreignKey({
      name: 'upload_record_download_size_uploadRecord_fkey',
      columns: [UploadRecordDownloadSize.uploadRecordId],
      foreignColumns: [UploadRecord.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    UploadRecordDownloadSize_uploadRecordId_variant_unique_idx: uniqueIndex(
      'UploadRecordDownloadSize_uploadRecordId_variant_key',
    ).on(
      UploadRecordDownloadSize.uploadRecordId,
      UploadRecordDownloadSize.variant,
    ),
  }),
);

export const UploadUserRating = pgTable(
  'upload_user_rating',
  {
    appUserId: uuid('app_user_id').notNull(),
    uploadRecordId: uuid('upload_id').notNull(),
    rating: Rating('rating').notNull(),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
  },
  (UploadUserRating) => ({
    upload_user_rating_appUser_fkey: foreignKey({
      name: 'upload_user_rating_appUser_fkey',
      columns: [UploadUserRating.appUserId],
      foreignColumns: [AppUser.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    upload_user_rating_uploadRecord_fkey: foreignKey({
      name: 'upload_user_rating_uploadRecord_fkey',
      columns: [UploadUserRating.uploadRecordId],
      foreignColumns: [UploadRecord.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    UploadUserRating_cpk: primaryKey({
      name: 'UploadUserRating_cpk',
      columns: [UploadUserRating.appUserId, UploadUserRating.uploadRecordId],
    }),
  }),
);

export const UploadUserComment = pgTable(
  'upload_user_comment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { precision: 3 }).notNull(),
    authorId: uuid('author_id').notNull(),
    uploadRecordId: uuid('upload_id').notNull(),
    replyingToId: uuid('replying_to_id'),
    text: text('text').notNull(),
    score: doublePrecision('score').notNull(),
    scoreStaleAt: timestamp('score_stale_at', { precision: 3 }).defaultNow(),
  },
  (UploadUserComment) => ({
    upload_user_comment_author_fkey: foreignKey({
      name: 'upload_user_comment_author_fkey',
      columns: [UploadUserComment.authorId],
      foreignColumns: [AppUser.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    upload_user_comment_upload_fkey: foreignKey({
      name: 'upload_user_comment_upload_fkey',
      columns: [UploadUserComment.uploadRecordId],
      foreignColumns: [UploadRecord.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    upload_user_comment_replyingTo_fkey: foreignKey({
      name: 'upload_user_comment_replyingTo_fkey',
      columns: [UploadUserComment.replyingToId],
      foreignColumns: [UploadUserComment.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
  }),
);

export const UploadUserCommentRating = pgTable(
  'upload_user_comment_rating',
  {
    appUserId: uuid('app_user_id').notNull(),
    uploadUserCommentId: uuid('upload_user_comment_id').notNull(),
    rating: Rating('rating').notNull(),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
  },
  (UploadUserCommentRating) => ({
    upload_user_comment_rating_appUser_fkey: foreignKey({
      name: 'upload_user_comment_rating_appUser_fkey',
      columns: [UploadUserCommentRating.appUserId],
      foreignColumns: [AppUser.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    upload_user_comment_rating_uploadUserComment_fkey: foreignKey({
      name: 'upload_user_comment_rating_uploadUserComment_fkey',
      columns: [UploadUserCommentRating.uploadUserCommentId],
      foreignColumns: [UploadUserComment.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    UploadUserCommentRating_cpk: primaryKey({
      name: 'UploadUserCommentRating_cpk',
      columns: [
        UploadUserCommentRating.appUserId,
        UploadUserCommentRating.uploadUserCommentId,
      ],
    }),
  }),
);

export const UploadView = pgTable(
  'upload_view',
  {
    uploadRecordId: uuid('upload_record_id').notNull(),
    viewHash: bigint('view_hash', { mode: 'bigint' }).notNull(),
    appUserId: uuid('app_user_id'),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    count: integer('count').notNull().default(1),
    source: UploadViewSource('source').default('WEBSITE'),
  },
  (UploadView) => ({
    upload_view_upload_fkey: foreignKey({
      name: 'upload_view_upload_fkey',
      columns: [UploadView.uploadRecordId],
      foreignColumns: [UploadRecord.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    upload_view_user_fkey: foreignKey({
      name: 'upload_view_user_fkey',
      columns: [UploadView.appUserId],
      foreignColumns: [AppUser.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    UploadView_cpk: primaryKey({
      name: 'UploadView_cpk',
      columns: [UploadView.uploadRecordId, UploadView.viewHash],
    }),
  }),
);

export const UploadViewSecond = pgTable(
  'upload_view_second',
  {
    uploadRecordId: uuid('upload_record_id').notNull(),
    viewHash: bigint('view_hash', { mode: 'bigint' }).notNull(),
    second: integer('second').notNull(),
  },
  (UploadViewSecond) => ({
    upload_view_second_view_fkey: foreignKey({
      name: 'upload_view_second_view_fkey',
      columns: [UploadViewSecond.uploadRecordId, UploadViewSecond.viewHash],
      foreignColumns: [UploadView.uploadRecordId, UploadView.viewHash],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    UploadViewSecond_cpk: primaryKey({
      name: 'UploadViewSecond_cpk',
      columns: [
        UploadViewSecond.uploadRecordId,
        UploadViewSecond.viewHash,
        UploadViewSecond.second,
      ],
    }),
  }),
);

export const UploadListEntry = pgTable(
  'upload_list_entry',
  {
    uploadListId: uuid('upload_list_id').notNull(),
    uploadRecordId: uuid('upload_record_id').notNull(),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    rank: integer('rank'),
  },
  (UploadListEntry) => ({
    upload_list_entry_uploadList_fkey: foreignKey({
      name: 'upload_list_entry_uploadList_fkey',
      columns: [UploadListEntry.uploadListId],
      foreignColumns: [UploadList.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    upload_list_entry_upload_fkey: foreignKey({
      name: 'upload_list_entry_upload_fkey',
      columns: [UploadListEntry.uploadRecordId],
      foreignColumns: [UploadRecord.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    UploadListEntry_cpk: primaryKey({
      name: 'UploadListEntry_cpk',
      columns: [UploadListEntry.uploadListId, UploadListEntry.uploadRecordId],
    }),
  }),
);

export const UploadList = pgTable(
  'upload_list',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { precision: 3 }).notNull(),
    title: text('title').notNull(),
    authorId: uuid('author_id').notNull(),
    channelId: uuid('channel_id'),
    type: UploadListType('type').notNull(),
  },
  (UploadList) => ({
    upload_list_author_fkey: foreignKey({
      name: 'upload_list_author_fkey',
      columns: [UploadList.authorId],
      foreignColumns: [AppUser.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    upload_list_channel_fkey: foreignKey({
      name: 'upload_list_channel_fkey',
      columns: [UploadList.channelId],
      foreignColumns: [Channel.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    UploadList_createdAt_id_unique_idx: uniqueIndex(
      'UploadList_createdAt_id_key',
    ).on(UploadList.createdAt, UploadList.id),
  }),
);

export const SearchLogEntry = pgTable(
  'search_log_entry',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    query: text('query').notNull(),
    params: jsonb('params').notNull().default('{}'),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    appUserId: uuid('app_user_id'),
    userDeletedAt: timestamp('user_deleted_at', { precision: 3 }),
    mediaCount: integer('media_count').notNull(),
    transcriptCount: integer('transcript_count').notNull(),
    channelCount: integer('channel_count').notNull(),
  },
  (SearchLogEntry) => ({
    search_log_entry_appUser_fkey: foreignKey({
      name: 'search_log_entry_appUser_fkey',
      columns: [SearchLogEntry.appUserId],
      foreignColumns: [AppUser.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
  }),
);

export const SavedMedia = pgTable(
  'saved_media',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appUserId: uuid('app_user_id').notNull(),
    uploadRecordId: uuid('upload_record_id').notNull(),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
  },
  (SavedMedia) => ({
    saved_media_appUser_fkey: foreignKey({
      name: 'saved_media_appUser_fkey',
      columns: [SavedMedia.appUserId],
      foreignColumns: [AppUser.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    saved_media_uploadRecord_fkey: foreignKey({
      name: 'saved_media_uploadRecord_fkey',
      columns: [SavedMedia.uploadRecordId],
      foreignColumns: [UploadRecord.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    SavedMedia_appUserId_uploadRecordId_unique_idx: uniqueIndex(
      'SavedMedia_appUserId_uploadRecordId_key',
    ).on(SavedMedia.appUserId, SavedMedia.uploadRecordId),
  }),
);

export const FeaturedUpload = pgTable(
  'featured_upload',
  {
    uploadRecordId: uuid('upload_record_id').notNull().primaryKey(),
    rank: integer('rank').notNull(),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { precision: 3 }).notNull(),
  },
  (FeaturedUpload) => ({
    featured_upload_uploadRecord_fkey: foreignKey({
      name: 'featured_upload_uploadRecord_fkey',
      columns: [FeaturedUpload.uploadRecordId],
      foreignColumns: [UploadRecord.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    FeaturedUpload_cpk: primaryKey({
      name: 'FeaturedUpload_cpk',
      columns: [FeaturedUpload.uploadRecordId],
    }),
  }),
);

export const NewsletterMailingList = pgTable('newsletter_mailing_list', {
  listmonkUuid: uuid('listmonk_uuid').notNull().primaryKey(),
  name: text('name').notNull(),
  type: NewsletterListType('type').notNull().default('public'),
  optin: NewsletterListOptin('optin').notNull().default('single'),
  enabled: boolean('enabled').notNull().default(true),
  subscribeOnRegistration: boolean('subscribe_on_registration').notNull(),
  createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { precision: 3 }).notNull(),
});

export const ChannelImportSource = pgTable(
  'channel_import_source',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    channelId: uuid('channel_id').notNull(),
    url: text('url').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    cronSchedule: text('cron_schedule').notNull().default('0 1 * * *'),
    timezone: text('timezone').notNull().default('America/New_York'),
    lastImportedAt: timestamp('last_imported_at', { precision: 3 }),
    lastSuccessfulImportAt: timestamp('last_successful_import_at', {
      precision: 3,
    }),
    lastErrorAt: timestamp('last_error_at', { precision: 3 }),
    lastErrorMessage: text('last_error_message'),
    earliestImportDate: timestamp('earliest_import_date', { precision: 3 }),
    lastImportedUploadDate: timestamp('last_imported_upload_date', {
      precision: 3,
    }),
    deduplicationEnabled: boolean('deduplication_enabled').notNull(),
    deduplicationFields: jsonb('deduplication_fields'),
    workflowId: text('workflow_id'),
    workflowStatus: ChannelImportSourceWorkflowStatus('workflow_status')
      .notNull()
      .default('NOT_STARTED'),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    createdById: uuid('created_by_id').notNull(),
    updatedAt: timestamp('updated_at', { precision: 3 }).notNull(),
    updatedById: uuid('updated_by_id'),
  },
  (ChannelImportSource) => ({
    channel_import_source_channel_fkey: foreignKey({
      name: 'channel_import_source_channel_fkey',
      columns: [ChannelImportSource.channelId],
      foreignColumns: [Channel.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    channel_import_source_createdBy_fkey: foreignKey({
      name: 'channel_import_source_createdBy_fkey',
      columns: [ChannelImportSource.createdById],
      foreignColumns: [AppUser.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    channel_import_source_updatedBy_fkey: foreignKey({
      name: 'channel_import_source_updatedBy_fkey',
      columns: [ChannelImportSource.updatedById],
      foreignColumns: [AppUser.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
  }),
);

export const ChannelImportRun = pgTable(
  'channel_import_run',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    importSourceId: uuid('import_source_id').notNull(),
    startedAt: timestamp('started_at', { precision: 3 }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { precision: 3 }),
    status: ChannelImportRunStatus('status').notNull(),
    itemsFound: integer('items_found').notNull(),
    itemsImported: integer('items_imported').notNull(),
    itemsSkipped: integer('items_skipped').notNull(),
    itemsFailed: integer('items_failed').notNull(),
    errorMessage: text('error_message'),
    errorDetails: jsonb('error_details'),
  },
  (ChannelImportRun) => ({
    channel_import_run_importSource_fkey: foreignKey({
      name: 'channel_import_run_importSource_fkey',
      columns: [ChannelImportRun.importSourceId],
      foreignColumns: [ChannelImportSource.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
  }),
);

export const ImportHistory = pgTable(
  'import_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    importSourceId: uuid('import_source_id').notNull(),
    uploadRecordId: uuid('upload_record_id'),
    title: text('title').notNull(),
    description: text('description'),
    url: text('url'),
    publishedAt: timestamp('published_at', { precision: 3 }).notNull(),
    source: text('source'),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
  },
  (ImportHistory) => ({
    import_history_importSource_fkey: foreignKey({
      name: 'import_history_importSource_fkey',
      columns: [ImportHistory.importSourceId],
      foreignColumns: [ChannelImportSource.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    import_history_uploadRecord_fkey: foreignKey({
      name: 'import_history_uploadRecord_fkey',
      columns: [ImportHistory.uploadRecordId],
      foreignColumns: [UploadRecord.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
  }),
);

export const AppUserRelations = relations(AppUser, ({ many }) => ({
  emails: many(AppUserEmail, {
    relationName: 'AppUserToAppUserEmail',
  }),
  sessions: many(AppSession, {
    relationName: 'AppSessionToAppUser',
  }),
  channelMemberships: many(ChannelMembership, {
    relationName: 'AppUserToChannelMembership',
  }),
  organizationMemberships: many(OrganizationMembership, {
    relationName: 'AppUserToOrganizationMembership',
  }),
  organizationInvitations: many(OrganizationInvitation, {
    relationName: 'invitedOrganizations',
  }),
  channelInvitations: many(ChannelInvitation, {
    relationName: 'invitedChannels',
  }),
  createdUploads: many(UploadRecord, {
    relationName: 'createdUploads',
  }),
  finalizedUploads: many(UploadRecord, {
    relationName: 'finalizedUploads',
  }),
  channelSubscriptions: many(ChannelSubscription, {
    relationName: 'AppUserToChannelSubscription',
  }),
  uploadUserComments: many(UploadUserComment, {
    relationName: 'AppUserToUploadUserComment',
  }),
  uploadUserRatings: many(UploadUserRating, {
    relationName: 'AppUserToUploadUserRating',
  }),
  uploadUserCommentRatings: many(UploadUserCommentRating, {
    relationName: 'AppUserToUploadUserCommentRating',
  }),
  uploadViews: many(UploadView, {
    relationName: 'AppUserToUploadView',
  }),
  uploadLists: many(UploadList, {
    relationName: 'AppUserToUploadList',
  }),
  savedMedia: many(SavedMedia, {
    relationName: 'AppUserToSavedMedia',
  }),
  approvedChannels: many(Channel, {
    relationName: 'AppUserToChannel',
  }),
  approvedOrganizations: many(Organization, {
    relationName: 'AppUserToOrganization',
  }),
  searches: many(SearchLogEntry, {
    relationName: 'AppUserToSearchLogEntry',
  }),
  uploadStates: many(UploadState, {
    relationName: 'AppUserToUploadState',
  }),
  createdImportSources: many(ChannelImportSource, {
    relationName: 'createdImportSources',
  }),
  updatedImportSources: many(ChannelImportSource, {
    relationName: 'updatedImportSources',
  }),
}));

export const AppUserEmailRelations = relations(AppUserEmail, ({ one }) => ({
  appUser: one(AppUser, {
    relationName: 'AppUserToAppUserEmail',
    fields: [AppUserEmail.appUserId],
    references: [AppUser.id],
  }),
}));

export const AppSessionRelations = relations(AppSession, ({ one }) => ({
  appUser: one(AppUser, {
    relationName: 'AppSessionToAppUser',
    fields: [AppSession.appUserId],
    references: [AppUser.id],
  }),
}));

export const ChannelSubscriptionRelations = relations(
  ChannelSubscription,
  ({ one }) => ({
    appUser: one(AppUser, {
      relationName: 'AppUserToChannelSubscription',
      fields: [ChannelSubscription.appUserId],
      references: [AppUser.id],
    }),
    channel: one(Channel, {
      relationName: 'ChannelToChannelSubscription',
      fields: [ChannelSubscription.channelId],
      references: [Channel.id],
    }),
  }),
);

export const OrganizationTagRelations = relations(
  OrganizationTag,
  ({ many }) => ({
    organizations: many(OrganizationTagInstance, {
      relationName: 'OrganizationTagToOrganizationTagInstance',
    }),
    suggestedBy: many(OrganizationTagSuggestion, {
      relationName: 'SuggestedBy',
    }),
    suggests: many(OrganizationTagSuggestion, {
      relationName: 'Suggests',
    }),
  }),
);

export const OrganizationTagSuggestionRelations = relations(
  OrganizationTagSuggestion,
  ({ one }) => ({
    parent: one(OrganizationTag, {
      relationName: 'SuggestedBy',
      fields: [OrganizationTagSuggestion.parentSlug],
      references: [OrganizationTag.slug],
    }),
    suggested: one(OrganizationTag, {
      relationName: 'Suggests',
      fields: [OrganizationTagSuggestion.suggestedSlug],
      references: [OrganizationTag.slug],
    }),
  }),
);

export const OrganizationTagInstanceRelations = relations(
  OrganizationTagInstance,
  ({ one }) => ({
    organization: one(Organization, {
      relationName: 'OrganizationToOrganizationTagInstance',
      fields: [OrganizationTagInstance.organizationId],
      references: [Organization.id],
    }),
    tag: one(OrganizationTag, {
      relationName: 'OrganizationTagToOrganizationTagInstance',
      fields: [OrganizationTagInstance.tagSlug],
      references: [OrganizationTag.slug],
    }),
  }),
);

export const OrganizationRelations = relations(
  Organization,
  ({ many, one }) => ({
    addresses: many(OrganizationAddress, {
      relationName: 'OrganizationToOrganizationAddress',
    }),
    leaders: many(OrganizationLeader, {
      relationName: 'OrganizationToOrganizationLeader',
    }),
    memberships: many(OrganizationMembership, {
      relationName: 'OrganizationToOrganizationMembership',
    }),
    invitations: many(OrganizationInvitation, {
      relationName: 'OrganizationToOrganizationInvitation',
    }),
    channelAssociations: many(OrganizationChannelAssociation, {
      relationName: 'OrganizationToOrganizationChannelAssociation',
    }),
    upstreamOrganizationAssociations: many(
      OrganizationOrganizationAssociation,
      {
        relationName: 'downstreamOrganization',
      },
    ),
    downstreamOrganizationAssociations: many(
      OrganizationOrganizationAssociation,
      {
        relationName: 'upstreamOrganization',
      },
    ),
    tags: many(OrganizationTagInstance, {
      relationName: 'OrganizationToOrganizationTagInstance',
    }),
    approvedBy: one(AppUser, {
      relationName: 'AppUserToOrganization',
      fields: [Organization.approvedById],
      references: [AppUser.id],
    }),
    uploadStates: many(UploadState, {
      relationName: 'OrganizationToUploadState',
    }),
  }),
);

export const OrganizationAddressRelations = relations(
  OrganizationAddress,
  ({ one }) => ({
    organization: one(Organization, {
      relationName: 'OrganizationToOrganizationAddress',
      fields: [OrganizationAddress.organizationId],
      references: [Organization.id],
    }),
  }),
);

export const OrganizationLeaderRelations = relations(
  OrganizationLeader,
  ({ one }) => ({
    organization: one(Organization, {
      relationName: 'OrganizationToOrganizationLeader',
      fields: [OrganizationLeader.organizationId],
      references: [Organization.id],
    }),
  }),
);

export const OrganizationMembershipRelations = relations(
  OrganizationMembership,
  ({ one }) => ({
    organization: one(Organization, {
      relationName: 'OrganizationToOrganizationMembership',
      fields: [OrganizationMembership.organizationId],
      references: [Organization.id],
    }),
    appUser: one(AppUser, {
      relationName: 'AppUserToOrganizationMembership',
      fields: [OrganizationMembership.appUserId],
      references: [AppUser.id],
    }),
  }),
);

export const OrganizationInvitationRelations = relations(
  OrganizationInvitation,
  ({ one }) => ({
    organization: one(Organization, {
      relationName: 'OrganizationToOrganizationInvitation',
      fields: [OrganizationInvitation.organizationId],
      references: [Organization.id],
    }),
    invitedBy: one(AppUser, {
      relationName: 'invitedOrganizations',
      fields: [OrganizationInvitation.invitedById],
      references: [AppUser.id],
    }),
  }),
);

export const OrganizationOrganizationAssociationRelations = relations(
  OrganizationOrganizationAssociation,
  ({ one }) => ({
    upstreamOrganization: one(Organization, {
      relationName: 'upstreamOrganization',
      fields: [OrganizationOrganizationAssociation.upstreamOrganizationId],
      references: [Organization.id],
    }),
    downstreamOrganization: one(Organization, {
      relationName: 'downstreamOrganization',
      fields: [OrganizationOrganizationAssociation.downstreamOrganizationId],
      references: [Organization.id],
    }),
  }),
);

export const OrganizationChannelAssociationRelations = relations(
  OrganizationChannelAssociation,
  ({ one }) => ({
    organization: one(Organization, {
      relationName: 'OrganizationToOrganizationChannelAssociation',
      fields: [OrganizationChannelAssociation.organizationId],
      references: [Organization.id],
    }),
    channel: one(Channel, {
      relationName: 'ChannelToOrganizationChannelAssociation',
      fields: [OrganizationChannelAssociation.channelId],
      references: [Channel.id],
    }),
  }),
);

export const ChannelRelations = relations(Channel, ({ many, one }) => ({
  memberships: many(ChannelMembership, {
    relationName: 'ChannelToChannelMembership',
  }),
  invitations: many(ChannelInvitation, {
    relationName: 'ChannelToChannelInvitation',
  }),
  organizationAssociations: many(OrganizationChannelAssociation, {
    relationName: 'ChannelToOrganizationChannelAssociation',
  }),
  approvedBy: one(AppUser, {
    relationName: 'AppUserToChannel',
    fields: [Channel.approvedById],
    references: [AppUser.id],
  }),
  uploadRecords: many(UploadRecord, {
    relationName: 'ChannelToUploadRecord',
  }),
  uploadLists: many(UploadList, {
    relationName: 'ChannelToUploadList',
  }),
  subscribers: many(ChannelSubscription, {
    relationName: 'ChannelToChannelSubscription',
  }),
  uploadStates: many(UploadState, {
    relationName: 'ChannelToUploadState',
  }),
  importSources: many(ChannelImportSource, {
    relationName: 'ChannelToChannelImportSource',
  }),
}));

export const ChannelMembershipRelations = relations(
  ChannelMembership,
  ({ one }) => ({
    channel: one(Channel, {
      relationName: 'ChannelToChannelMembership',
      fields: [ChannelMembership.channelId],
      references: [Channel.id],
    }),
    appUser: one(AppUser, {
      relationName: 'AppUserToChannelMembership',
      fields: [ChannelMembership.appUserId],
      references: [AppUser.id],
    }),
  }),
);

export const ChannelInvitationRelations = relations(
  ChannelInvitation,
  ({ one }) => ({
    channel: one(Channel, {
      relationName: 'ChannelToChannelInvitation',
      fields: [ChannelInvitation.channelId],
      references: [Channel.id],
    }),
    invitedBy: one(AppUser, {
      relationName: 'invitedChannels',
      fields: [ChannelInvitation.invitedById],
      references: [AppUser.id],
    }),
  }),
);

export const UploadStateRelations = relations(UploadState, ({ one }) => ({
  uploadRecord: one(UploadRecord, {
    relationName: 'UploadRecordToUploadState',
    fields: [UploadState.uploadRecordId],
    references: [UploadRecord.id],
  }),
  appUser: one(AppUser, {
    relationName: 'AppUserToUploadState',
    fields: [UploadState.appUserId],
    references: [AppUser.id],
  }),
  channel: one(Channel, {
    relationName: 'ChannelToUploadState',
    fields: [UploadState.channelId],
    references: [Channel.id],
  }),
  organization: one(Organization, {
    relationName: 'OrganizationToUploadState',
    fields: [UploadState.organizationId],
    references: [Organization.id],
  }),
}));

export const UploadRecordRelations = relations(
  UploadRecord,
  ({ one, many }) => ({
    createdBy: one(AppUser, {
      relationName: 'createdUploads',
      fields: [UploadRecord.appUserId],
      references: [AppUser.id],
    }),
    channel: one(Channel, {
      relationName: 'ChannelToUploadRecord',
      fields: [UploadRecord.channelId],
      references: [Channel.id],
    }),
    uploadFinalizedBy: one(AppUser, {
      relationName: 'finalizedUploads',
      fields: [UploadRecord.uploadFinalizedById],
      references: [AppUser.id],
    }),
    userRatings: many(UploadUserRating, {
      relationName: 'UploadRecordToUploadUserRating',
    }),
    userComments: many(UploadUserComment, {
      relationName: 'UploadRecordToUploadUserComment',
    }),
    downloadSizes: many(UploadRecordDownloadSize, {
      relationName: 'UploadRecordToUploadRecordDownloadSize',
    }),
    uploadViews: many(UploadView, {
      relationName: 'UploadRecordToUploadView',
    }),
    uploadListEntries: many(UploadListEntry, {
      relationName: 'UploadListEntryToUploadRecord',
    }),
    savedByUsers: many(SavedMedia, {
      relationName: 'SavedMediaToUploadRecord',
    }),
    featuredUpload: many(FeaturedUpload, {
      relationName: 'FeaturedUploadToUploadRecord',
    }),
    uploadStates: many(UploadState, {
      relationName: 'UploadRecordToUploadState',
    }),
    importHistory: many(ImportHistory, {
      relationName: 'ImportHistoryToUploadRecord',
    }),
  }),
);

export const UploadRecordDownloadSizeRelations = relations(
  UploadRecordDownloadSize,
  ({ one }) => ({
    uploadRecord: one(UploadRecord, {
      relationName: 'UploadRecordToUploadRecordDownloadSize',
      fields: [UploadRecordDownloadSize.uploadRecordId],
      references: [UploadRecord.id],
    }),
  }),
);

export const UploadUserRatingRelations = relations(
  UploadUserRating,
  ({ one }) => ({
    appUser: one(AppUser, {
      relationName: 'AppUserToUploadUserRating',
      fields: [UploadUserRating.appUserId],
      references: [AppUser.id],
    }),
    uploadRecord: one(UploadRecord, {
      relationName: 'UploadRecordToUploadUserRating',
      fields: [UploadUserRating.uploadRecordId],
      references: [UploadRecord.id],
    }),
  }),
);

export const UploadUserCommentRelations = relations(
  UploadUserComment,
  ({ one, many }) => ({
    author: one(AppUser, {
      relationName: 'AppUserToUploadUserComment',
      fields: [UploadUserComment.authorId],
      references: [AppUser.id],
    }),
    upload: one(UploadRecord, {
      relationName: 'UploadRecordToUploadUserComment',
      fields: [UploadUserComment.uploadRecordId],
      references: [UploadRecord.id],
    }),
    replies: many(UploadUserComment, {
      relationName: 'ThreadComments',
    }),
    replyingTo: one(UploadUserComment, {
      relationName: 'ThreadComments',
      fields: [UploadUserComment.replyingToId],
      references: [UploadUserComment.id],
    }),
    userRatings: many(UploadUserCommentRating, {
      relationName: 'UploadUserCommentToUploadUserCommentRating',
    }),
  }),
);

export const UploadUserCommentRatingRelations = relations(
  UploadUserCommentRating,
  ({ one }) => ({
    appUser: one(AppUser, {
      relationName: 'AppUserToUploadUserCommentRating',
      fields: [UploadUserCommentRating.appUserId],
      references: [AppUser.id],
    }),
    uploadUserComment: one(UploadUserComment, {
      relationName: 'UploadUserCommentToUploadUserCommentRating',
      fields: [UploadUserCommentRating.uploadUserCommentId],
      references: [UploadUserComment.id],
    }),
  }),
);

export const UploadViewRelations = relations(UploadView, ({ one, many }) => ({
  upload: one(UploadRecord, {
    relationName: 'UploadRecordToUploadView',
    fields: [UploadView.uploadRecordId],
    references: [UploadRecord.id],
  }),
  user: one(AppUser, {
    relationName: 'AppUserToUploadView',
    fields: [UploadView.appUserId],
    references: [AppUser.id],
  }),
  UploadViewSecond: many(UploadViewSecond, {
    relationName: 'UploadViewToUploadViewSecond',
  }),
}));

export const UploadViewSecondRelations = relations(
  UploadViewSecond,
  ({ one }) => ({
    view: one(UploadView, {
      relationName: 'UploadViewToUploadViewSecond',
      fields: [UploadViewSecond.uploadRecordId, UploadViewSecond.viewHash],
      references: [UploadView.uploadRecordId, UploadView.viewHash],
    }),
  }),
);

export const UploadListEntryRelations = relations(
  UploadListEntry,
  ({ one }) => ({
    uploadList: one(UploadList, {
      relationName: 'UploadListToUploadListEntry',
      fields: [UploadListEntry.uploadListId],
      references: [UploadList.id],
    }),
    upload: one(UploadRecord, {
      relationName: 'UploadListEntryToUploadRecord',
      fields: [UploadListEntry.uploadRecordId],
      references: [UploadRecord.id],
    }),
  }),
);

export const UploadListRelations = relations(UploadList, ({ one, many }) => ({
  author: one(AppUser, {
    relationName: 'AppUserToUploadList',
    fields: [UploadList.authorId],
    references: [AppUser.id],
  }),
  channel: one(Channel, {
    relationName: 'ChannelToUploadList',
    fields: [UploadList.channelId],
    references: [Channel.id],
  }),
  uploads: many(UploadListEntry, {
    relationName: 'UploadListToUploadListEntry',
  }),
}));

export const SearchLogEntryRelations = relations(SearchLogEntry, ({ one }) => ({
  appUser: one(AppUser, {
    relationName: 'AppUserToSearchLogEntry',
    fields: [SearchLogEntry.appUserId],
    references: [AppUser.id],
  }),
}));

export const SavedMediaRelations = relations(SavedMedia, ({ one }) => ({
  appUser: one(AppUser, {
    relationName: 'AppUserToSavedMedia',
    fields: [SavedMedia.appUserId],
    references: [AppUser.id],
  }),
  uploadRecord: one(UploadRecord, {
    relationName: 'SavedMediaToUploadRecord',
    fields: [SavedMedia.uploadRecordId],
    references: [UploadRecord.id],
  }),
}));

export const FeaturedUploadRelations = relations(FeaturedUpload, ({ one }) => ({
  uploadRecord: one(UploadRecord, {
    relationName: 'FeaturedUploadToUploadRecord',
    fields: [FeaturedUpload.uploadRecordId],
    references: [UploadRecord.id],
  }),
}));

export const ChannelImportSourceRelations = relations(
  ChannelImportSource,
  ({ one, many }) => ({
    channel: one(Channel, {
      relationName: 'ChannelToChannelImportSource',
      fields: [ChannelImportSource.channelId],
      references: [Channel.id],
    }),
    createdBy: one(AppUser, {
      relationName: 'createdImportSources',
      fields: [ChannelImportSource.createdById],
      references: [AppUser.id],
    }),
    updatedBy: one(AppUser, {
      relationName: 'updatedImportSources',
      fields: [ChannelImportSource.updatedById],
      references: [AppUser.id],
    }),
    importRuns: many(ChannelImportRun, {
      relationName: 'ChannelImportRunToChannelImportSource',
    }),
    importHistory: many(ImportHistory, {
      relationName: 'ChannelImportSourceToImportHistory',
    }),
  }),
);

export const ChannelImportRunRelations = relations(
  ChannelImportRun,
  ({ one }) => ({
    importSource: one(ChannelImportSource, {
      relationName: 'ChannelImportRunToChannelImportSource',
      fields: [ChannelImportRun.importSourceId],
      references: [ChannelImportSource.id],
    }),
  }),
);

export const ImportHistoryRelations = relations(ImportHistory, ({ one }) => ({
  importSource: one(ChannelImportSource, {
    relationName: 'ChannelImportSourceToImportHistory',
    fields: [ImportHistory.importSourceId],
    references: [ChannelImportSource.id],
  }),
  uploadRecord: one(UploadRecord, {
    relationName: 'ImportHistoryToUploadRecord',
    fields: [ImportHistory.uploadRecordId],
    references: [UploadRecord.id],
  }),
}));
