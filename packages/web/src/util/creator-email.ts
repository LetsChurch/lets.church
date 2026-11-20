/**
 * Pick the address to show admins for whoever created a channel or
 * organization. Prefers a verified address; otherwise falls back to an
 * unverified one, flagged so the admin knows it isn't confirmed. Creating
 * either doesn't require verification, so filtering to verified addresses
 * alone silently dropped the line for brand-new accounts.
 */
export function creatorEmailLabel(
  emails: ReadonlyArray<{ email: string; verifiedAt: Date | null }> | undefined,
): string | null {
  if (!emails || emails.length === 0) return null;
  const verified = emails.find((e) => e.verifiedAt !== null);
  if (verified) return verified.email;
  return `${emails[0]!.email} (unverified)`;
}
