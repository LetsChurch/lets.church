import {
  pgTable,
  varchar,
  timestamp,
  text,
  uniqueIndex,
  uuid,
  foreignKey,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { citext } from './common';
import {
  channel,
  channelMembership,
  channelSubscription,
  uploadList,
  uploadListEntry,
  uploadRecord,
  uploadRecordDownloadSize,
  uploadUserComment,
  uploadUserCommentRating,
  uploadUserRating,
  uploadView,
  uploadViewRanges,
} from './media';
import {
  organizationChannelAssociation,
  organizationMembership,
} from './organizations';

export const appUserRole = pgEnum('app_user_role', ['USER', 'ADMIN']);

export const appUser = pgTable(
  'app_user',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    username: citext('username').notNull(),
    password: text().notNull(),
    fullName: varchar('full_name', { length: 100 }),
    avatarPath: varchar('avatar_path', { length: 255 }),
    avatarBlurhash: varchar('avatar_blurhash', { length: 255 }),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp('updated_at', {
      precision: 3,
      mode: 'string',
    }).notNull(),
    deletedAt: timestamp('deleted_at', { precision: 3, mode: 'string' }),
    role: appUserRole().default('USER').notNull(),
  },
  (table) => [
    {
      usernameKey: uniqueIndex('app_user_username_key').using(
        'btree',
        table.username.asc().nullsLast().op('citext_ops'),
      ),
    },
  ],
);

export const appUserEmail = pgTable(
  'app_user_email',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    appUserId: uuid('app_user_id').notNull(),
    email: citext('email').notNull(),
    key: uuid().defaultRandom().notNull(),
    verifiedAt: timestamp('verified_at', { precision: 3, mode: 'string' }),
  },
  (table) => [
    {
      emailKey: uniqueIndex('app_user_email_email_key').using(
        'btree',
        table.email.asc().nullsLast().op('citext_ops'),
      ),
      appUserEmailAppUserIdFkey: foreignKey({
        columns: [table.appUserId],
        foreignColumns: [appUser.id],
        name: 'app_user_email_app_user_id_fkey',
      })
        .onUpdate('cascade')
        .onDelete('cascade'),
    },
  ],
);

export const appSession = pgTable(
  'app_session',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    appUserId: uuid('app_user_id').notNull(),
    expiresAt: timestamp('expires_at', { precision: 3, mode: 'string' })
      .default(sql`(now() + '30 days'::interval)`)
      .notNull(),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp('updated_at', {
      precision: 3,
      mode: 'string',
    }).notNull(),
    deletedAt: timestamp('deleted_at', { precision: 3, mode: 'string' }),
  },
  (table) => [
    {
      appSessionAppUserIdFkey: foreignKey({
        columns: [table.appUserId],
        foreignColumns: [appUser.id],
        name: 'app_session_app_user_id_fkey',
      })
        .onUpdate('cascade')
        .onDelete('cascade'),
    },
  ],
);

export const appUserEmailRelations = relations(appUserEmail, ({ one }) => ({
  appUser: one(appUser, {
    fields: [appUserEmail.appUserId],
    references: [appUser.id],
  }),
}));

export const appUserRelations = relations(appUser, ({ many }) => ({
  appUserEmails: many(appUserEmail),
  appSessions: many(appSession),
  uploadUserComments: many(uploadUserComment),
  uploadRecords_appUserId: many(uploadRecord, {
    relationName: 'uploadRecord_appUserId_appUser_id',
  }),
  uploadRecords_uploadFinalizedById: many(uploadRecord, {
    relationName: 'uploadRecord_uploadFinalizedById_appUser_id',
  }),
  uploadLists: many(uploadList),
  uploadViewRanges: many(uploadViewRanges),
  channelSubscriptions: many(channelSubscription),
  uploadUserRatings: many(uploadUserRating),
  uploadUserCommentRatings: many(uploadUserCommentRating),
  uploadViews: many(uploadView),
  organizationMemberships: many(organizationMembership),
  channelMemberships: many(channelMembership),
}));

export const appSessionRelations = relations(appSession, ({ one }) => ({
  appUser: one(appUser, {
    fields: [appSession.appUserId],
    references: [appUser.id],
  }),
}));

export const uploadRecordDownloadSizeRelations = relations(
  uploadRecordDownloadSize,
  ({ one }) => ({
    uploadRecord: one(uploadRecord, {
      fields: [uploadRecordDownloadSize.uploadRecordId],
      references: [uploadRecord.id],
    }),
  }),
);

export const uploadRecordRelations = relations(
  uploadRecord,
  ({ one, many }) => ({
    uploadRecordDownloadSizes: many(uploadRecordDownloadSize),
    uploadUserComments: many(uploadUserComment),
    appUser_appUserId: one(appUser, {
      fields: [uploadRecord.appUserId],
      references: [appUser.id],
      relationName: 'uploadRecord_appUserId_appUser_id',
    }),
    channel: one(channel, {
      fields: [uploadRecord.channelId],
      references: [channel.id],
    }),
    appUser_uploadFinalizedById: one(appUser, {
      fields: [uploadRecord.uploadFinalizedById],
      references: [appUser.id],
      relationName: 'uploadRecord_uploadFinalizedById_appUser_id',
    }),
    uploadViewRanges: many(uploadViewRanges),
    uploadListEntries: many(uploadListEntry),
    uploadUserRatings: many(uploadUserRating),
    uploadViews: many(uploadView),
  }),
);

export const uploadUserCommentRelations = relations(
  uploadUserComment,
  ({ one, many }) => ({
    appUser: one(appUser, {
      fields: [uploadUserComment.authorId],
      references: [appUser.id],
    }),
    uploadRecord: one(uploadRecord, {
      fields: [uploadUserComment.uploadId],
      references: [uploadRecord.id],
    }),
    uploadUserComment: one(uploadUserComment, {
      fields: [uploadUserComment.replyingToId],
      references: [uploadUserComment.id],
      relationName: 'uploadUserComment_replyingToId_uploadUserComment_id',
    }),
    uploadUserComments: many(uploadUserComment, {
      relationName: 'uploadUserComment_replyingToId_uploadUserComment_id',
    }),
    uploadUserCommentRatings: many(uploadUserCommentRating),
  }),
);

export const channelRelations = relations(channel, ({ many }) => ({
  uploadRecords: many(uploadRecord),
  uploadLists: many(uploadList),
  channelSubscriptions: many(channelSubscription),
  organizationChannelAssociations: many(organizationChannelAssociation),
  channelMemberships: many(channelMembership),
}));

export const uploadListRelations = relations(uploadList, ({ one, many }) => ({
  appUser: one(appUser, {
    fields: [uploadList.authorId],
    references: [appUser.id],
  }),
  channel: one(channel, {
    fields: [uploadList.channelId],
    references: [channel.id],
  }),
  uploadListEntries: many(uploadListEntry),
}));

export const uploadViewRangesRelations = relations(
  uploadViewRanges,
  ({ one }) => ({
    uploadRecord: one(uploadRecord, {
      fields: [uploadViewRanges.uploadRecordId],
      references: [uploadRecord.id],
    }),
    appUser: one(appUser, {
      fields: [uploadViewRanges.appUserId],
      references: [appUser.id],
    }),
  }),
);
