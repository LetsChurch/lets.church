import {
  AppUser,
  Channel,
  db,
  type UploadLicense,
  UploadRecord,
  type UploadVisibility,
} from '@letschurch/db';
import { ApplicationFailure } from '@temporalio/activity';
import { eq } from 'drizzle-orm';

import type { CreateUploadRecordActivityInput } from '../../client/create-upload-record';

export const UPLOAD_CREATION_DATA_INTEGRITY_ERROR =
  'UploadCreationDataIntegrityError';

export default async function createUploadRecord({
  data,
  creationOperationId,
  creationRequestFingerprint,
}: CreateUploadRecordActivityInput) {
  // Resolve username -> appUserId if needed
  let appUserId = data.appUserId as string | undefined;
  if (!appUserId && data.createdByUsername) {
    const user = await db
      .select({ id: AppUser.id })
      .from(AppUser)
      .where(eq(AppUser.username, data.createdByUsername as string))
      .then((r) => r[0]);
    if (!user)
      throw new Error(
        `User with username '${data.createdByUsername}' not found`,
      );
    appUserId = user.id;
  }

  // Resolve channelSlug -> channelId if needed
  let channelId = data.channelId as string | undefined;
  if (!channelId && data.channelSlug) {
    const channel = await db
      .select({ id: Channel.id })
      .from(Channel)
      .where(eq(Channel.slug, data.channelSlug as string))
      .then((r) => r[0]);
    if (!channel)
      throw new Error(`Channel with slug '${data.channelSlug}' not found`);
    channelId = channel.id;
  }

  // Resolve uploadFinalizedBy username -> userId if needed
  let uploadFinalizedById = data.uploadFinalizedById as string | undefined;
  if (!uploadFinalizedById && data.uploadFinalizedByUsername) {
    const user = await db
      .select({ id: AppUser.id })
      .from(AppUser)
      .where(eq(AppUser.username, data.uploadFinalizedByUsername as string))
      .then((r) => r[0]);
    if (user) uploadFinalizedById = user.id;
  }

  if (!appUserId)
    throw new Error('appUserId is required to create upload record');
  if (!channelId)
    throw new Error('channelId is required to create upload record');

  return db.transaction(async (tx) => {
    const [record] = await tx
      .insert(UploadRecord)
      .values({
        creationOperationId,
        creationRequestFingerprint,
        title: data.title as string | undefined,
        description: (data.description as string | undefined) ?? null,
        appUserId,
        channelId,
        license: ((data.license as string | undefined) ??
          'STANDARD') as (typeof UploadLicense.enumValues)[number],
        visibility: ((data.visibility as string | undefined) ??
          'PUBLIC') as (typeof UploadVisibility.enumValues)[number],
        uploadFinalized: (data.uploadFinalized as boolean | undefined) ?? false,
        uploadFinalizedAt: (() => {
          if (!data.uploadFinalizedAt) return undefined;
          const d = new Date(data.uploadFinalizedAt as string | Date);
          return Number.isNaN(d.getTime()) ? undefined : d;
        })(),
        uploadFinalizedById,
        finalizedUploadKey: data.finalizedUploadKey as string | undefined,
        publishedAt: (() => {
          if (!data.publishedAt) return new Date();
          const d = new Date(data.publishedAt as string | Date);
          return Number.isNaN(d.getTime()) ? new Date() : d;
        })(),
        userCommentsEnabled:
          (data.userCommentsEnabled as boolean | undefined) ?? true,
        transcodingProgress: 0,
        variants: [] as (typeof UploadRecord.$inferInsert)['variants'],
        score: 0,
        updatedAt: new Date(),
      })
      .onConflictDoNothing({ target: UploadRecord.creationOperationId })
      .returning();

    if (record) return record;

    const [existing] = await tx
      .select()
      .from(UploadRecord)
      .where(eq(UploadRecord.creationOperationId, creationOperationId))
      .limit(1);

    if (!existing) {
      throw new Error(
        `Upload creation conflict did not resolve for operation '${creationOperationId}'`,
      );
    }
    if (existing.creationRequestFingerprint !== creationRequestFingerprint) {
      throw ApplicationFailure.nonRetryable(
        `Upload creation operation '${creationOperationId}' was retried with different data`,
        UPLOAD_CREATION_DATA_INTEGRITY_ERROR,
      );
    }

    return existing;
  });
}
