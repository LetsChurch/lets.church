import { db } from '@letschurch/db';

import { isChannelRoutable } from './media-visibility-rules';

// DB-backed media/channel visibility helpers. The pure predicates live in
// ./media-visibility-rules (no DB import, so they're unit-testable without
// DATABASE_URL) and are re-exported here for existing import sites.
export {
  type ChannelVisibilityFields,
  canViewMedia,
  isChannelRoutable,
  type UploadVisibilityFields,
} from './media-visibility-rules';

type ViewerContext = {
  session?: { appUserId: string } | null;
  isSiteAdmin?: boolean;
};

/**
 * The set of channel ids the user is a member of, used to gate PRIVATE media in
 * batch filters. Returns an empty set for anonymous callers.
 */
export async function getMemberChannelIds(
  userId: string | null | undefined,
): Promise<Set<string>> {
  if (!userId) {
    return new Set();
  }
  const rows = await db.query.ChannelMembership.findMany({
    columns: { channelId: true },
    where: (t, { eq }) => eq(t.appUserId, userId),
  });
  return new Set(rows.map((r) => r.channelId));
}

/**
 * Single-item viewability check by upload id. Loads the upload + channel and
 * applies the same rules as {@link canViewMedia}. Use this on write paths
 * (saveMedia, createUploadView, …) to reject planting inaccessible media into
 * user-scoped state. Returns false for missing/deleted/inaccessible uploads.
 */
export async function canViewMediaById(
  uploadRecordId: string,
  ctx: ViewerContext,
): Promise<boolean> {
  const upload = await db.query.UploadRecord.findFirst({
    columns: { visibility: true, deletedAt: true, channelId: true },
    with: {
      channel: {
        columns: { visibility: true, approvedAt: true, deletedAt: true },
      },
    },
    where: (t, { eq }) => eq(t.id, uploadRecordId),
  });

  if (!upload) {
    return false;
  }

  if (upload.deletedAt || !isChannelRoutable(upload.channel)) {
    return false;
  }

  if (upload.visibility === 'PRIVATE') {
    if (ctx.isSiteAdmin) {
      return true;
    }
    const userId = ctx.session?.appUserId ?? null;
    if (!userId) {
      return false;
    }
    const membership = await db.query.ChannelMembership.findFirst({
      columns: { appUserId: true },
      where: (t, { and, eq }) =>
        and(eq(t.channelId, upload.channelId), eq(t.appUserId, userId)),
    });
    return Boolean(membership);
  }

  return true;
}
