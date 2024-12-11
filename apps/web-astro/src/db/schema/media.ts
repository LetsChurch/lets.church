import {
  bigint,
  boolean,
  doublePrecision,
  foreignKey,
  index,
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
  varchar,
} from 'drizzle-orm/pg-core';
import { appUser } from './users';
import { relations, sql } from 'drizzle-orm';
import { citext } from './common';
import {
  organization,
  organizationTag,
  organizationTagInstance,
  organizationTagSuggestion,
} from './organizations';

export const channelVisibility = pgEnum('channel_visibility', [
  'PUBLIC',
  'PRIVATE',
  'UNLISTED',
]);

export const rating = pgEnum('rating', ['LIKE', 'DISLIKE']);

export const uploadLicense = pgEnum('upload_license', [
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

export const uploadListType = pgEnum('upload_list_type', [
  'SERIES',
  'PLAYLIST',
]);

export const uploadVariant = pgEnum('upload_variant', [
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

export const uploadVisibility = pgEnum('upload_visibility', [
  'PUBLIC',
  'PRIVATE',
  'UNLISTED',
]);

export const trackingSalt = pgTable('tracking_salt', {
  id: serial().primaryKey().notNull(),
  salt: integer().notNull(),
  createdAt: timestamp({ precision: 3, mode: 'string' })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

export const channel = pgTable(
  'channel',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    name: text().notNull(),
    avatarPath: varchar('avatar_path', { length: 255 }),
    avatarBlurhash: varchar('avatar_blurhash', { length: 255 }),
    slug: citext('slug').notNull(),
    description: text(),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp('updated_at', {
      precision: 3,
      mode: 'string',
    }).notNull(),
    defaultThumbnailBlurhash: varchar('default_thumbnail_blurhash', {
      length: 255,
    }),
    defaultThumbnailPath: varchar('default_thumbnail_path', { length: 255 }),
    visibility: channelVisibility().default('PUBLIC').notNull(),
  },
  (table) => [
    {
      slugKey: uniqueIndex('channel_slug_key').using(
        'btree',
        table.slug.asc().nullsLast().op('citext_ops'),
      ),
    },
  ],
);

export const uploadRecordDownloadSize = pgTable(
  'upload_record_download_size',
  {
    uploadRecordId: uuid('upload_record_id').notNull(),
    variant: uploadVariant().notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  },
  (table) => [
    {
      uploadRecordIdVariantKey: uniqueIndex(
        'upload_record_download_size_upload_record_id_variant_key',
      ).using(
        'btree',
        table.uploadRecordId.asc().nullsLast().op('uuid_ops'),
        table.variant.asc().nullsLast().op('uuid_ops'),
      ),
      uploadRecordDownloadSizeUploadRecordIdFkey: foreignKey({
        columns: [table.uploadRecordId],
        foreignColumns: [uploadRecord.id],
        name: 'upload_record_download_size_upload_record_id_fkey',
      })
        .onUpdate('cascade')
        .onDelete('cascade'),
    },
  ],
);

export const uploadUserComment = pgTable(
  'upload_user_comment',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp('updated_at', {
      precision: 3,
      mode: 'string',
    }).notNull(),
    authorId: uuid('author_id').notNull(),
    uploadId: uuid('upload_id').notNull(),
    replyingToId: uuid('replying_to_id'),
    text: text().notNull(),
    score: doublePrecision().default(0).notNull(),
    scoreStaleAt: timestamp('score_stale_at', {
      precision: 3,
      mode: 'string',
    }).default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    {
      replyingToIdIdx: index('upload_user_comment_replying_to_id_idx').using(
        'btree',
        table.replyingToId.asc().nullsLast().op('uuid_ops'),
      ),
      scoreIdx: index('upload_user_comment_score_idx').using(
        'btree',
        table.score.asc().nullsLast().op('float8_ops'),
      ),
      scoreStaleAtIdx: index('upload_user_comment_score_stale_at_idx').using(
        'btree',
        table.scoreStaleAt.asc().nullsLast().op('timestamp_ops'),
      ),
      uploadUserCommentAuthorIdFkey: foreignKey({
        columns: [table.authorId],
        foreignColumns: [appUser.id],
        name: 'upload_user_comment_author_id_fkey',
      })
        .onUpdate('cascade')
        .onDelete('cascade'),
      uploadUserCommentUploadIdFkey: foreignKey({
        columns: [table.uploadId],
        foreignColumns: [uploadRecord.id],
        name: 'upload_user_comment_upload_id_fkey',
      })
        .onUpdate('cascade')
        .onDelete('cascade'),
      uploadUserCommentReplyingToIdFkey: foreignKey({
        columns: [table.replyingToId],
        foreignColumns: [table.id],
        name: 'upload_user_comment_replying_to_id_fkey',
      })
        .onUpdate('cascade')
        .onDelete('set null'),
    },
  ],
);

export const uploadRecord = pgTable(
  'upload_record',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    title: text(),
    description: text(),
    appUserId: uuid('app_user_id').notNull(),
    license: uploadLicense().notNull(),
    channelId: uuid('channel_id').notNull(),
    visibility: uploadVisibility().notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    uploadSizeBytes: bigint('upload_size_bytes', { mode: 'number' }),
    uploadFinalized: boolean('upload_finalized').default(false).notNull(),
    uploadFinalizedById: uuid('upload_finalized_by_id'),
    defaultThumbnailPath: text('default_thumbnail_path'),
    lengthSeconds: doublePrecision('length_seconds'),
    defaultThumbnailBlurhash: text('default_thumbnail_blurhash'),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp('updated_at', {
      precision: 3,
      mode: 'string',
    }).notNull(),
    publishedAt: timestamp('published_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    transcodingStartedAt: timestamp('transcoding_started_at', {
      precision: 3,
      mode: 'string',
    }),
    transcodingFinishedAt: timestamp('transcoding_finished_at', {
      precision: 3,
      mode: 'string',
    }),
    transcodingProgress: doublePrecision('transcoding_progress')
      .default(0)
      .notNull(),
    transcribingStartedAt: timestamp('transcribing_started_at', {
      precision: 3,
      mode: 'string',
    }),
    transcribingFinishedAt: timestamp('transcribing_finished_at', {
      precision: 3,
      mode: 'string',
    }),
    deletedAt: timestamp('deleted_at', { precision: 3, mode: 'string' }),
    variants: uploadVariant().array(),
    score: doublePrecision().default(0).notNull(),
    scoreStaleAt: timestamp('score_stale_at', {
      precision: 3,
      mode: 'string',
    }).default(sql`CURRENT_TIMESTAMP`),
    userCommentsEnabled: boolean('user_comments_enabled')
      .default(true)
      .notNull(),
    downloadsEnabled: boolean('downloads_enabled').default(true).notNull(),
    finalizedUploadKey: text('finalized_upload_key'),
    overrideThumbnailBlurhash: text('override_thumbnail_blurhash'),
    overrideThumbnailPath: text('override_thumbnail_path'),
    thumbnailCount: integer('thumbnail_count'),
    uploadFinalizedAt: timestamp('upload_finalized_at', {
      precision: 3,
      mode: 'string',
    }),
    probe: jsonb(),
  },
  (table) => [
    {
      createdAtIdIdx: index('upload_record_created_at_id_idx').using(
        'btree',
        table.createdAt.asc().nullsLast().op('uuid_ops'),
        table.id.asc().nullsLast().op('timestamp_ops'),
      ),
      scoreIdx: index('upload_record_score_idx').using(
        'btree',
        table.score.asc().nullsLast().op('float8_ops'),
      ),
      scoreStaleAtIdx: index('upload_record_score_stale_at_idx').using(
        'btree',
        table.scoreStaleAt.asc().nullsLast().op('timestamp_ops'),
      ),
      uploadRecordAppUserIdFkey: foreignKey({
        columns: [table.appUserId],
        foreignColumns: [appUser.id],
        name: 'upload_record_app_user_id_fkey',
      })
        .onUpdate('cascade')
        .onDelete('restrict'),
      uploadRecordChannelIdFkey: foreignKey({
        columns: [table.channelId],
        foreignColumns: [channel.id],
        name: 'upload_record_channel_id_fkey',
      })
        .onUpdate('cascade')
        .onDelete('restrict'),
      uploadRecordUploadFinalizedByIdFkey: foreignKey({
        columns: [table.uploadFinalizedById],
        foreignColumns: [appUser.id],
        name: 'upload_record_upload_finalized_by_id_fkey',
      })
        .onUpdate('cascade')
        .onDelete('set null'),
    },
  ],
);

export const uploadList = pgTable(
  'upload_list',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp('updated_at', {
      precision: 3,
      mode: 'string',
    }).notNull(),
    title: text().notNull(),
    authorId: uuid('author_id').notNull(),
    channelId: uuid('channel_id'),
    type: uploadListType().notNull(),
  },
  (table) => [
    {
      createdAtIdKey: uniqueIndex('upload_list_created_at_id_key').using(
        'btree',
        table.createdAt.asc().nullsLast().op('timestamp_ops'),
        table.id.asc().nullsLast().op('timestamp_ops'),
      ),
      uploadListAuthorIdFkey: foreignKey({
        columns: [table.authorId],
        foreignColumns: [appUser.id],
        name: 'upload_list_author_id_fkey',
      })
        .onUpdate('cascade')
        .onDelete('cascade'),
      uploadListChannelIdFkey: foreignKey({
        columns: [table.channelId],
        foreignColumns: [channel.id],
        name: 'upload_list_channel_id_fkey',
      })
        .onUpdate('cascade')
        .onDelete('set null'),
    },
  ],
);

export const uploadViewRanges = pgTable(
  'upload_view_ranges',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    uploadRecordId: uuid('upload_record_id').notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    viewerHash: bigint('viewer_hash', { mode: 'number' }).notNull(),
    appUserId: uuid('app_user_id'),
    viewTimestamp: timestamp('view_timestamp', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    ranges: jsonb().default([]).notNull(),
    totalTime: doublePrecision('total_time').notNull(),
  },
  (table) => [
    {
      uploadRecordIdViewerHashIdx: index(
        'upload_view_ranges_upload_record_id_viewer_hash_idx',
      ).using(
        'btree',
        table.uploadRecordId.asc().nullsLast().op('int8_ops'),
        table.viewerHash.asc().nullsLast().op('int8_ops'),
      ),
      viewTimestampIdx: index('upload_view_ranges_view_timestamp_idx').using(
        'btree',
        table.viewTimestamp.asc().nullsLast().op('timestamp_ops'),
      ),
      uploadViewRangesUploadRecordIdFkey: foreignKey({
        columns: [table.uploadRecordId],
        foreignColumns: [uploadRecord.id],
        name: 'upload_view_ranges_upload_record_id_fkey',
      })
        .onUpdate('cascade')
        .onDelete('cascade'),
      uploadViewRangesAppUserIdFkey: foreignKey({
        columns: [table.appUserId],
        foreignColumns: [appUser.id],
        name: 'upload_view_ranges_app_user_id_fkey',
      })
        .onUpdate('cascade')
        .onDelete('set null'),
    },
  ],
);

export const channelSubscription = pgTable(
  'channel_subscription',
  {
    appUserId: uuid('app_user_id').notNull(),
    channelId: uuid('channel_id').notNull(),
  },
  (table) => [
    {
      channelSubscriptionAppUserIdFkey: foreignKey({
        columns: [table.appUserId],
        foreignColumns: [appUser.id],
        name: 'channel_subscription_app_user_id_fkey',
      })
        .onUpdate('cascade')
        .onDelete('cascade'),
      channelSubscriptionChannelIdFkey: foreignKey({
        columns: [table.channelId],
        foreignColumns: [channel.id],
        name: 'channel_subscription_channel_id_fkey',
      })
        .onUpdate('cascade')
        .onDelete('cascade'),
      channelSubscriptionPkey: primaryKey({
        columns: [table.appUserId, table.channelId],
        name: 'channel_subscription_pkey',
      }),
    },
  ],
);

export const uploadListEntry = pgTable(
  'upload_list_entry',
  {
    uploadListId: uuid('upload_list_id').notNull(),
    uploadRecordId: uuid('upload_record_id').notNull(),
    rank: varchar({ length: 12 }).notNull(),
  },
  (table) => [
    {
      uploadListIdUploadRecordIdKey: uniqueIndex(
        'upload_list_entry_upload_list_id_upload_record_id_key',
      ).using(
        'btree',
        table.uploadListId.asc().nullsLast().op('uuid_ops'),
        table.uploadRecordId.asc().nullsLast().op('uuid_ops'),
      ),
      uploadListEntryUploadListIdFkey: foreignKey({
        columns: [table.uploadListId],
        foreignColumns: [uploadList.id],
        name: 'upload_list_entry_upload_list_id_fkey',
      })
        .onUpdate('cascade')
        .onDelete('restrict'),
      uploadListEntryUploadRecordIdFkey: foreignKey({
        columns: [table.uploadRecordId],
        foreignColumns: [uploadRecord.id],
        name: 'upload_list_entry_upload_record_id_fkey',
      })
        .onUpdate('cascade')
        .onDelete('cascade'),
      uploadListEntryPkey: primaryKey({
        columns: [table.uploadListId, table.rank],
        name: 'upload_list_entry_pkey',
      }),
    },
  ],
);

export const uploadUserRating = pgTable(
  'upload_user_rating',
  {
    appUserId: uuid('app_user_id').notNull(),
    uploadId: uuid('upload_id').notNull(),
    rating: rating().notNull(),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    {
      appUserIdRatingIdx: index(
        'upload_user_rating_app_user_id_rating_idx',
      ).using(
        'btree',
        table.appUserId.asc().nullsLast().op('uuid_ops'),
        table.rating.asc().nullsLast().op('enum_ops'),
      ),
      uploadIdRatingIdx: index('upload_user_rating_upload_id_rating_idx').using(
        'btree',
        table.uploadId.asc().nullsLast().op('enum_ops'),
        table.rating.asc().nullsLast().op('enum_ops'),
      ),
      uploadUserRatingAppUserIdFkey: foreignKey({
        columns: [table.appUserId],
        foreignColumns: [appUser.id],
        name: 'upload_user_rating_app_user_id_fkey',
      })
        .onUpdate('cascade')
        .onDelete('cascade'),
      uploadUserRatingUploadIdFkey: foreignKey({
        columns: [table.uploadId],
        foreignColumns: [uploadRecord.id],
        name: 'upload_user_rating_upload_id_fkey',
      })
        .onUpdate('cascade')
        .onDelete('cascade'),
      uploadUserRatingPkey: primaryKey({
        columns: [table.appUserId, table.uploadId],
        name: 'upload_user_rating_pkey',
      }),
    },
  ],
);

export const uploadUserCommentRating = pgTable(
  'upload_user_comment_rating',
  {
    appUserId: uuid('app_user_id').notNull(),
    uploadUserCommentId: uuid('upload_user_comment_id').notNull(),
    rating: rating().notNull(),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    {
      appUserIdRatingIdx: index(
        'upload_user_comment_rating_app_user_id_rating_idx',
      ).using(
        'btree',
        table.appUserId.asc().nullsLast().op('uuid_ops'),
        table.rating.asc().nullsLast().op('enum_ops'),
      ),
      uploadUserCommentIdRatingIdx: index(
        'upload_user_comment_rating_upload_user_comment_id_rating_idx',
      ).using(
        'btree',
        table.uploadUserCommentId.asc().nullsLast().op('enum_ops'),
        table.rating.asc().nullsLast().op('enum_ops'),
      ),
      uploadUserCommentRatingAppUserIdFkey: foreignKey({
        columns: [table.appUserId],
        foreignColumns: [appUser.id],
        name: 'upload_user_comment_rating_app_user_id_fkey',
      })
        .onUpdate('cascade')
        .onDelete('cascade'),
      uploadUserCommentRatingUploadUserCommentIdFkey: foreignKey({
        columns: [table.uploadUserCommentId],
        foreignColumns: [uploadUserComment.id],
        name: 'upload_user_comment_rating_upload_user_comment_id_fkey',
      })
        .onUpdate('cascade')
        .onDelete('cascade'),
      uploadUserCommentRatingPkey: primaryKey({
        columns: [table.appUserId, table.uploadUserCommentId],
        name: 'upload_user_comment_rating_pkey',
      }),
    },
  ],
);

export const uploadView = pgTable(
  'upload_view',
  {
    uploadRecordId: uuid('upload_record_id').notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    viewHash: bigint('view_hash', { mode: 'number' }).notNull(),
    appUserId: uuid('app_user_id'),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    count: integer().default(1).notNull(),
  },
  (table) => [
    {
      appUserIdUploadRecordIdIdx: index(
        'upload_view_app_user_id_upload_record_id_idx',
      ).using(
        'btree',
        table.appUserId.asc().nullsLast().op('uuid_ops'),
        table.uploadRecordId.asc().nullsLast().op('uuid_ops'),
      ),
      createdAtIdx: index('upload_view_created_at_idx').using(
        'btree',
        table.createdAt.asc().nullsLast().op('timestamp_ops'),
      ),
      uploadViewAppUserIdFkey: foreignKey({
        columns: [table.appUserId],
        foreignColumns: [appUser.id],
        name: 'upload_view_app_user_id_fkey',
      })
        .onUpdate('cascade')
        .onDelete('set null'),
      uploadViewUploadRecordIdFkey: foreignKey({
        columns: [table.uploadRecordId],
        foreignColumns: [uploadRecord.id],
        name: 'upload_view_upload_record_id_fkey',
      })
        .onUpdate('cascade')
        .onDelete('cascade'),
      uploadViewPkey: primaryKey({
        columns: [table.uploadRecordId, table.viewHash],
        name: 'upload_view_pkey',
      }),
    },
  ],
);

export const channelMembership = pgTable(
  'channel_membership',
  {
    channelId: uuid('channel_id').notNull(),
    appUserId: uuid('app_user_id').notNull(),
    isAdmin: boolean('is_admin').default(false).notNull(),
    canEdit: boolean('can_edit').default(false).notNull(),
    canUpload: boolean('can_upload').default(false).notNull(),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp('updated_at', {
      precision: 3,
      mode: 'string',
    }).notNull(),
  },
  (table) => [
    {
      channelMembershipChannelIdFkey: foreignKey({
        columns: [table.channelId],
        foreignColumns: [channel.id],
        name: 'channel_membership_channel_id_fkey',
      })
        .onUpdate('cascade')
        .onDelete('cascade'),
      channelMembershipAppUserIdFkey: foreignKey({
        columns: [table.appUserId],
        foreignColumns: [appUser.id],
        name: 'channel_membership_app_user_id_fkey',
      })
        .onUpdate('cascade')
        .onDelete('cascade'),
      channelMembershipPkey: primaryKey({
        columns: [table.channelId, table.appUserId],
        name: 'channel_membership_pkey',
      }),
    },
  ],
);

export const channelSubscriptionRelations = relations(
  channelSubscription,
  ({ one }) => ({
    appUser: one(appUser, {
      fields: [channelSubscription.appUserId],
      references: [appUser.id],
    }),
    channel: one(channel, {
      fields: [channelSubscription.channelId],
      references: [channel.id],
    }),
  }),
);

export const organizationTagSuggestionRelations = relations(
  organizationTagSuggestion,
  ({ one }) => ({
    organizationTag_parentSlug: one(organizationTag, {
      fields: [organizationTagSuggestion.parentSlug],
      references: [organizationTag.slug],
      relationName: 'organizationTagSuggestion_parentSlug_organizationTag_slug',
    }),
    organizationTag_recommendedSlug: one(organizationTag, {
      fields: [organizationTagSuggestion.recommendedSlug],
      references: [organizationTag.slug],
      relationName:
        'organizationTagSuggestion_recommendedSlug_organizationTag_slug',
    }),
  }),
);

export const organizationTagRelations = relations(
  organizationTag,
  ({ many }) => ({
    organizationTagSuggestions_parentSlug: many(organizationTagSuggestion, {
      relationName: 'organizationTagSuggestion_parentSlug_organizationTag_slug',
    }),
    organizationTagSuggestions_recommendedSlug: many(
      organizationTagSuggestion,
      {
        relationName:
          'organizationTagSuggestion_recommendedSlug_organizationTag_slug',
      },
    ),
    organizationTagInstances: many(organizationTagInstance),
  }),
);

export const organizationTagInstanceRelations = relations(
  organizationTagInstance,
  ({ one }) => ({
    organization: one(organization, {
      fields: [organizationTagInstance.organizationId],
      references: [organization.id],
    }),
    organizationTag: one(organizationTag, {
      fields: [organizationTagInstance.tagSlug],
      references: [organizationTag.slug],
    }),
  }),
);

export const uploadListEntryRelations = relations(
  uploadListEntry,
  ({ one }) => ({
    uploadList: one(uploadList, {
      fields: [uploadListEntry.uploadListId],
      references: [uploadList.id],
    }),
    uploadRecord: one(uploadRecord, {
      fields: [uploadListEntry.uploadRecordId],
      references: [uploadRecord.id],
    }),
  }),
);

export const uploadUserRatingRelations = relations(
  uploadUserRating,
  ({ one }) => ({
    appUser: one(appUser, {
      fields: [uploadUserRating.appUserId],
      references: [appUser.id],
    }),
    uploadRecord: one(uploadRecord, {
      fields: [uploadUserRating.uploadId],
      references: [uploadRecord.id],
    }),
  }),
);

export const uploadUserCommentRatingRelations = relations(
  uploadUserCommentRating,
  ({ one }) => ({
    appUser: one(appUser, {
      fields: [uploadUserCommentRating.appUserId],
      references: [appUser.id],
    }),
    uploadUserComment: one(uploadUserComment, {
      fields: [uploadUserCommentRating.uploadUserCommentId],
      references: [uploadUserComment.id],
    }),
  }),
);

export const uploadViewRelations = relations(uploadView, ({ one }) => ({
  appUser: one(appUser, {
    fields: [uploadView.appUserId],
    references: [appUser.id],
  }),
  uploadRecord: one(uploadRecord, {
    fields: [uploadView.uploadRecordId],
    references: [uploadRecord.id],
  }),
}));

export const channelMembershipRelations = relations(
  channelMembership,
  ({ one }) => ({
    channel: one(channel, {
      fields: [channelMembership.channelId],
      references: [channel.id],
    }),
    appUser: one(appUser, {
      fields: [channelMembership.appUserId],
      references: [appUser.id],
    }),
  }),
);
