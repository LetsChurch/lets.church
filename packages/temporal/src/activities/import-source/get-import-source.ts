import { AppUser, Channel, ChannelImportSource, db } from '@letschurch/db';
import { eq } from 'drizzle-orm';

/**
 * Fetch import source from database.
 */
export async function getImportSource(importSourceId: string) {
  const source = await db
    .select()
    .from(ChannelImportSource)
    .where(eq(ChannelImportSource.id, importSourceId))
    .then((r) => r[0] ?? null);

  if (!source) {
    throw new Error(`Import source ${importSourceId} not found`);
  }

  const channel = await db
    .select({
      id: Channel.id,
      slug: Channel.slug,
      name: Channel.name,
    })
    .from(Channel)
    .where(eq(Channel.id, source.channelId))
    .then((r) => r[0] ?? null);

  const createdBy = await db
    .select({
      id: AppUser.id,
      username: AppUser.username,
    })
    .from(AppUser)
    .where(eq(AppUser.id, source.createdById))
    .then((r) => r[0] ?? null);

  return {
    ...source,
    channel,
    createdBy,
  };
}
