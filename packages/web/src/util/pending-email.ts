// How long a requested email change waits for its confirmation link to be
// clicked. After that the request is ignored (and dropped when touched) so a
// stale link sitting in an old inbox can't swap the account's address later.
export const PENDING_EMAIL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function isPendingEmailExpired(createdAt: Date, now = Date.now()) {
  return now - createdAt.getTime() > PENDING_EMAIL_TTL_MS;
}
