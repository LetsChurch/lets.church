import {
  AppUser,
  Channel,
  db,
  type UploadLicense,
  UploadRecord,
  type UploadVisibility,
} from '@letschurch/db';
import { eq } from 'drizzle-orm';

import type { UploadRecordCreateData } from '../../client';

export default async function createUploadRecord(data: UploadRecordCreateData) {
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

  const [record] = await db
    .insert(UploadRecord)
    .values({
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
    .returning();

  return record;
}
