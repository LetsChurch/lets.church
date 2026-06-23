// Pure media/channel visibility predicates — intentionally free of any DB (or
// other env-coupled) import, so they can be unit tested without DATABASE_URL.
// The DB-backed helpers (canViewMediaById / getMemberChannelIds) live in
// ./media-visibility and re-export these.
//
// These mirror the access rules in `media.getMediaById` so that every list/read
// path that returns upload or channel metadata applies the same gate, rather
// than trusting that a row exists or that Elasticsearch said it was public.

export type ChannelVisibilityFields = {
  visibility: 'PUBLIC' | 'PRIVATE' | 'UNLISTED';
  approvedAt: Date | null;
  deletedAt?: Date | null;
};

export type UploadVisibilityFields = {
  visibility: 'PUBLIC' | 'PRIVATE' | 'UNLISTED';
  deletedAt?: Date | null;
};

/**
 * A channel is publicly routable when it is not private, has been approved, and
 * has not been deleted. Private/unapproved channels (and their media) are not
 * exposed through public/list endpoints.
 */
export function isChannelRoutable(channel: ChannelVisibilityFields): boolean {
  return (
    channel.visibility !== 'PRIVATE' &&
    Boolean(channel.approvedAt) &&
    !channel.deletedAt
  );
}

/**
 * Synchronous viewability check for an upload whose channel has already been
 * loaded, given the set of channel ids the caller is a member of. Use this for
 * batch filtering of list results (fetch `getMemberChannelIds` once, then call
 * per item) to avoid an N+1 of membership queries.
 */
export function canViewMedia(args: {
  upload: UploadVisibilityFields;
  channelId: string;
  channel: ChannelVisibilityFields;
  isSiteAdmin: boolean;
  memberChannelIds: ReadonlySet<string>;
}): boolean {
  if (args.upload.deletedAt) {
    return false;
  }
  if (!isChannelRoutable(args.channel)) {
    return false;
  }
  if (args.upload.visibility === 'PRIVATE') {
    return args.isSiteAdmin || args.memberChannelIds.has(args.channelId);
  }
  return true;
}
