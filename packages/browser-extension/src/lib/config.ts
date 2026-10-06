/** Which Let's Church this build talks to (see `wxt.config.ts`). */
export const LC_URL =
  (import.meta.env.WXT_LC_URL as string | undefined) || 'https://lets.church';

export function signInUrl() {
  return `${LC_URL}/auth/login`;
}

export function uploadEditUrl(channelId: string, uploadId: string) {
  return `${LC_URL}/dashboard/channels/${channelId}/uploads/${uploadId}`;
}
