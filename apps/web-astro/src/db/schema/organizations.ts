import {
  pgTable,
  timestamp,
  text,
  uniqueIndex,
  uuid,
  foreignKey,
  doublePrecision,
  boolean,
  jsonb,
  primaryKey,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { citext } from './common';
import { channel } from './media';
import { appUser } from './users';

export const tagColor = pgEnum('TagColor', [
  'GRAY',
  'RED',
  'YELLOW',
  'GREEN',
  'BLUE',
  'INDIGO',
  'PURPLE',
  'PINK',
]);

export const addressType = pgEnum('address_type', [
  'MAILING',
  'MEETING',
  'OFFICE',
  'OTHER',
]);

export const organizationLeaderType = pgEnum('organization_leader_type', [
  'ELDER',
  'DEACON',
  'OTHER',
]);

export const organizationTagCategory = pgEnum('organization_tag_category', [
  'DENOMINATION',
  'DOCTRINE',
  'ESCHATOLOGY',
  'WORSHIP',
  'CONFESSION',
  'GOVERNMENT',
  'OTHER',
]);

export const organizationType = pgEnum('organization_type', [
  'CHURCH',
  'MINISTRY',
]);

export const organizationAddress = pgTable(
  'organization_address',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    country: text(),
    geocodingJson: jsonb('geocoding_json'),
    locality: text(),
    name: text(),
    organizationId: uuid('organization_id').notNull(),
    postOfficeBoxNumber: text('post_office_box_number'),
    postalCode: text('postal_code'),
    query: text(),
    region: text(),
    streetAddress: text('street_address'),
    type: addressType().notNull(),
    latitude: doublePrecision(),
    longitude: doublePrecision(),
  },
  (table) => [
    {
      organizationAddressOrganizationIdFkey: foreignKey({
        columns: [table.organizationId],
        foreignColumns: [organization.id],
        name: 'organization_address_organization_id_fkey',
      })
        .onUpdate('cascade')
        .onDelete('restrict'),
    },
  ],
);

export const organizationTag = pgTable('organization_tag', {
  slug: citext('slug').notNull(),
  label: text().notNull(),
  description: text(),
  moreInfoLink: text('more_info_link'),
  category: organizationTagCategory().notNull(),
  color: tagColor().default('GRAY').notNull(),
});

export const organization = pgTable(
  'organization',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    name: text().notNull(),
    slug: citext('slug').notNull(),
    description: text(),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp('updated_at', {
      precision: 3,
      mode: 'string',
    }).notNull(),
    type: organizationType().default('MINISTRY').notNull(),
    avatarPath: text('avatar_path'),
    coverPath: text('cover_path'),
    primaryEmail: text('primary_email'),
    primaryPhoneNumber: text('primary_phone_number'),
    websiteUrl: text('website_url'),
    automaticallyApproveOrganizationAssociations: boolean(
      'automatically_approve_organization_associations',
    )
      .default(false)
      .notNull(),
  },
  (table) => [
    {
      slugKey: uniqueIndex('organization_slug_key').using(
        'btree',
        table.slug.asc().nullsLast().op('citext_ops'),
      ),
    },
  ],
);

export const organizationLeader = pgTable(
  'organization_leader',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid('organization_id').notNull(),
    type: organizationLeaderType().notNull(),
    name: text(),
    email: text(),
    phoneNumber: text('phone_number'),
  },
  (table) => [
    {
      organizationLeaderOrganizationIdFkey: foreignKey({
        columns: [table.organizationId],
        foreignColumns: [organization.id],
        name: 'organization_leader_organization_id_fkey',
      })
        .onUpdate('cascade')
        .onDelete('restrict'),
    },
  ],
);

export const organizationTagSuggestion = pgTable(
  'organization_tag_suggestion',
  {
    parentSlug: citext('parent_slug').notNull(),
    recommendedSlug: citext('recommended_slug').notNull(),
  },
  (table) => [
    {
      organizationTagSuggestionParentSlugFkey: foreignKey({
        columns: [table.parentSlug],
        foreignColumns: [organizationTag.slug],
        name: 'organization_tag_suggestion_parent_slug_fkey',
      })
        .onUpdate('cascade')
        .onDelete('restrict'),
      organizationTagSuggestionRecommendedSlugFkey: foreignKey({
        columns: [table.recommendedSlug],
        foreignColumns: [organizationTag.slug],
        name: 'organization_tag_suggestion_recommended_slug_fkey',
      })
        .onUpdate('cascade')
        .onDelete('restrict'),
      organizationTagSuggestionPkey: primaryKey({
        columns: [table.parentSlug, table.recommendedSlug],
        name: 'organization_tag_suggestion_pkey',
      }),
    },
  ],
);

export const organizationTagInstance = pgTable(
  'organization_tag_instance',
  {
    organizationId: uuid('organization_id').notNull(),
    tagSlug: citext('tag_slug').notNull(),
  },
  (table) => [
    {
      organizationTagInstanceOrganizationIdFkey: foreignKey({
        columns: [table.organizationId],
        foreignColumns: [organization.id],
        name: 'organization_tag_instance_organization_id_fkey',
      })
        .onUpdate('cascade')
        .onDelete('restrict'),
      organizationTagInstanceTagSlugFkey: foreignKey({
        columns: [table.tagSlug],
        foreignColumns: [organizationTag.slug],
        name: 'organization_tag_instance_tag_slug_fkey',
      })
        .onUpdate('cascade')
        .onDelete('restrict'),
      organizationTagInstancePkey: primaryKey({
        columns: [table.organizationId, table.tagSlug],
        name: 'organization_tag_instance_pkey',
      }),
    },
  ],
);

export const organizationChannelAssociation = pgTable(
  'organization_channel_association',
  {
    organizationId: uuid('organization_id').notNull(),
    channelId: uuid('channel_id').notNull(),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp('updated_at', {
      precision: 3,
      mode: 'string',
    }).notNull(),
    officialChannel: boolean('official_channel').default(false).notNull(),
  },
  (table) => [
    {
      organizationChannelAssociationOrganizationIdFkey: foreignKey({
        columns: [table.organizationId],
        foreignColumns: [organization.id],
        name: 'organization_channel_association_organization_id_fkey',
      })
        .onUpdate('cascade')
        .onDelete('cascade'),
      organizationChannelAssociationChannelIdFkey: foreignKey({
        columns: [table.channelId],
        foreignColumns: [channel.id],
        name: 'organization_channel_association_channel_id_fkey',
      })
        .onUpdate('cascade')
        .onDelete('cascade'),
      organizationChannelAssociationPkey: primaryKey({
        columns: [table.organizationId, table.channelId],
        name: 'organization_channel_association_pkey',
      }),
    },
  ],
);

export const organizationMembership = pgTable(
  'organization_membership',
  {
    organizationId: uuid('organization_id').notNull(),
    appUserId: uuid('app_user_id').notNull(),
    isAdmin: boolean('is_admin').default(false).notNull(),
    canEdit: boolean('can_edit').default(false).notNull(),
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
      organizationMembershipAppUserIdFkey: foreignKey({
        columns: [table.appUserId],
        foreignColumns: [appUser.id],
        name: 'organization_membership_app_user_id_fkey',
      })
        .onUpdate('cascade')
        .onDelete('cascade'),
      organizationMembershipOrganizationIdFkey: foreignKey({
        columns: [table.organizationId],
        foreignColumns: [organization.id],
        name: 'organization_membership_organization_id_fkey',
      })
        .onUpdate('cascade')
        .onDelete('cascade'),
      organizationMembershipPkey: primaryKey({
        columns: [table.organizationId, table.appUserId],
        name: 'organization_membership_pkey',
      }),
    },
  ],
);

export const organizationOrganizationAssociation = pgTable(
  'organization_organization_association',
  {
    upstreamOrganizationId: uuid('upstream_organization_id').notNull(),
    downstreamOrganizationId: uuid('downstream_organization_id').notNull(),
    upstreamApproved: boolean('upstream_approved').default(false).notNull(),
    downstreamApproved: boolean('downstream_approved').default(false).notNull(),
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
      organizationOrganizationAssociationUpstreamOrganizatioFkey: foreignKey({
        columns: [table.upstreamOrganizationId],
        foreignColumns: [organization.id],
        name: 'organization_organization_association_upstream_organizatio_fkey',
      })
        .onUpdate('cascade')
        .onDelete('cascade'),
      organizationOrganizationAssociationDownstreamOrganizatFkey: foreignKey({
        columns: [table.downstreamOrganizationId],
        foreignColumns: [organization.id],
        name: 'organization_organization_association_downstream_organizat_fkey',
      })
        .onUpdate('cascade')
        .onDelete('cascade'),
      organizationOrganizationAssociationPkey: primaryKey({
        columns: [table.upstreamOrganizationId, table.downstreamOrganizationId],
        name: 'organization_organization_association_pkey',
      }),
    },
  ],
);

export const organizationAddressRelations = relations(
  organizationAddress,
  ({ one }) => ({
    organization: one(organization, {
      fields: [organizationAddress.organizationId],
      references: [organization.id],
    }),
  }),
);

export const organizationRelations = relations(organization, ({ many }) => ({
  organizationAddresses: many(organizationAddress),
  organizationLeaders: many(organizationLeader),
  organizationTagInstances: many(organizationTagInstance),
  organizationChannelAssociations: many(organizationChannelAssociation),
  organizationMemberships: many(organizationMembership),
  organizationOrganizationAssociations_upstreamOrganizationId: many(
    organizationOrganizationAssociation,
    {
      relationName:
        'organizationOrganizationAssociation_upstreamOrganizationId_organization_id',
    },
  ),
  organizationOrganizationAssociations_downstreamOrganizationId: many(
    organizationOrganizationAssociation,
    {
      relationName:
        'organizationOrganizationAssociation_downstreamOrganizationId_organization_id',
    },
  ),
}));

export const organizationLeaderRelations = relations(
  organizationLeader,
  ({ one }) => ({
    organization: one(organization, {
      fields: [organizationLeader.organizationId],
      references: [organization.id],
    }),
  }),
);

export const organizationChannelAssociationRelations = relations(
  organizationChannelAssociation,
  ({ one }) => ({
    organization: one(organization, {
      fields: [organizationChannelAssociation.organizationId],
      references: [organization.id],
    }),
    channel: one(channel, {
      fields: [organizationChannelAssociation.channelId],
      references: [channel.id],
    }),
  }),
);

export const organizationMembershipRelations = relations(
  organizationMembership,
  ({ one }) => ({
    appUser: one(appUser, {
      fields: [organizationMembership.appUserId],
      references: [appUser.id],
    }),
    organization: one(organization, {
      fields: [organizationMembership.organizationId],
      references: [organization.id],
    }),
  }),
);

export const organizationOrganizationAssociationRelations = relations(
  organizationOrganizationAssociation,
  ({ one }) => ({
    organization_upstreamOrganizationId: one(organization, {
      fields: [organizationOrganizationAssociation.upstreamOrganizationId],
      references: [organization.id],
      relationName:
        'organizationOrganizationAssociation_upstreamOrganizationId_organization_id',
    }),
    organization_downstreamOrganizationId: one(organization, {
      fields: [organizationOrganizationAssociation.downstreamOrganizationId],
      references: [organization.id],
      relationName:
        'organizationOrganizationAssociation_downstreamOrganizationId_organization_id',
    }),
  }),
);
