// Browser-safe type and enum exports — no Node.js imports.
// Runtime enum objects are derived from the pgEnum definitions in schema.ts.

import type { InferSelectModel } from 'drizzle-orm';
import {
  type AppUserRole as AppUserRoleEnum,
  type AppUser as AppUserTable,
  type ChannelLiveStream as ChannelLiveStreamTable,
  type ChannelMembership as ChannelMembershipTable,
  type ChannelSimulcastTarget as ChannelSimulcastTargetTable,
  type Channel as ChannelTable,
  ChannelVisibility as ChannelVisibilityEnum,
  type OrganizationMembership as OrganizationMembershipTable,
  type Organization as OrganizationTable,
  UploadLicense as UploadLicenseEnum,
  type UploadListEntry as UploadListEntryTable,
  type UploadList as UploadListTable,
  UploadListType as UploadListTypeEnum,
  type UploadRecord as UploadRecordTable,
  type UploadUserCommentRating as UploadUserCommentRatingTable,
  type UploadUserComment as UploadUserCommentTable,
  UploadViewSource as UploadViewSourceEnum,
  type UploadView as UploadViewTable,
  UploadVisibility as UploadVisibilityEnum,
} from './schema';

// Type aliases matching the names previously exported from Prisma
export type AppUser = InferSelectModel<typeof AppUserTable>;
export type Channel = InferSelectModel<typeof ChannelTable>;
export type ChannelMembership = InferSelectModel<typeof ChannelMembershipTable>;
export type ChannelLiveStream = InferSelectModel<typeof ChannelLiveStreamTable>;
export type ChannelSimulcastTarget = InferSelectModel<
  typeof ChannelSimulcastTargetTable
>;
export type Organization = InferSelectModel<typeof OrganizationTable>;
export type OrganizationMembership = InferSelectModel<
  typeof OrganizationMembershipTable
>;
export type UploadList = InferSelectModel<typeof UploadListTable>;
export type UploadListEntry = InferSelectModel<typeof UploadListEntryTable>;
export type Upload = InferSelectModel<typeof UploadRecordTable>;
export type Comment = InferSelectModel<typeof UploadUserCommentTable>;
export type CommentVote = InferSelectModel<typeof UploadUserCommentRatingTable>;
export type UploadView = InferSelectModel<typeof UploadViewTable>;

// UserRole type (previously AppUserRole from Prisma enums)
export type UserRole = (typeof AppUserRoleEnum.enumValues)[number];

// Runtime enum objects derived from pgEnum definitions.
// These replicate Prisma's generated enum objects (e.g. ChannelVisibility.PUBLIC).
type EnumObj<T extends { enumValues: readonly string[] }> = {
  [K in T['enumValues'][number]]: K;
};

function makeEnum<T extends { enumValues: readonly string[] }>(
  pgE: T,
): EnumObj<T> {
  return Object.fromEntries(pgE.enumValues.map((v) => [v, v])) as EnumObj<T>;
}

export const ChannelVisibility = makeEnum(ChannelVisibilityEnum);
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type ChannelVisibility =
  (typeof ChannelVisibility)[keyof typeof ChannelVisibility];

export const UploadLicense = makeEnum(UploadLicenseEnum);
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type UploadLicense = (typeof UploadLicense)[keyof typeof UploadLicense];

export const UploadListType = makeEnum(UploadListTypeEnum);
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type UploadListType =
  (typeof UploadListType)[keyof typeof UploadListType];

export const UploadViewSource = makeEnum(UploadViewSourceEnum);
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type UploadViewSource =
  (typeof UploadViewSource)[keyof typeof UploadViewSource];

export const UploadVisibility = makeEnum(UploadVisibilityEnum);
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type UploadVisibility =
  (typeof UploadVisibility)[keyof typeof UploadVisibility];
