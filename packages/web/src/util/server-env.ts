import pb, { type ResizeOptions } from '@bitpatty/imgproxy-url-builder';
import { getLocation } from '@letschurch/s3/locations';
import { SignJWT } from 'jose';
import { z } from 'zod';

const { IMGPROXY_URL, IMGPROXY_KEY, IMGPROXY_SALT, DOWNLOAD_URL, JWT_SECRET } =
  z
    .object({
      IMGPROXY_URL: z.string(),
      IMGPROXY_KEY: z.string(),
      IMGPROXY_SALT: z.string(),
      DOWNLOAD_URL: z.string(),
      JWT_SECRET: z.string(),
    })
    .parse(process.env);

// NOTE: this derives the key from JWT_SECRET as raw UTF-8 bytes, which is a
// DIFFERENT derivation than session cookies use (those decode JWT_SECRET as hex
// — see util/jwt.ts). These are independent signing domains (download URLs vs
// session cookies) and each must verify with the same derivation it signs with;
// don't "unify" them or you'll invalidate the other's tokens.
const jwtSecret = new TextEncoder().encode(JWT_SECRET);

export async function makeDownloadServiceUrl(
  uploadId: string,
  storageLocation: string,
  variant: string,
  filename: string,
  includeAudio = false,
): Promise<string> {
  const expiry = Math.floor(Date.now() / 1000) + 15 * 60;
  // The download service holds no storage config: the signed token tells it
  // which CDN base to pull the record's HLS from.
  const token = await new SignJWT({
    uploadId,
    variant,
    filename,
    includeAudio,
    mediaUrl: getLocation(storageLocation).publicUrl,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(expiry)
    .sign(jwtSecret);
  const url = new URL(`/${uploadId}/${variant}`, DOWNLOAD_URL);
  url.searchParams.set('token', token);
  return url.toString();
}

/** Public CDN URL for `key` in a storage location's public bucket. */
export function getPublicMediaUrl(storageLocation: string, key: string) {
  return getLocation(storageLocation).publicObjectUrl(key);
}

type Optional<T> = T | undefined | null;

type ImageUrlOptions = Partial<{
  resize: Optional<ResizeOptions>;
  quality: Optional<number>;
}>;

/**
 * Signed imgproxy URL for an image stored in a location's public bucket.
 * imgproxy fetches the original over HTTP from the location's public CDN
 * URL (allow-listed via IMGPROXY_ALLOWED_SOURCES), so it works across any
 * number of providers without S3 credentials of its own. Returns null when
 * the image (or its location) is absent.
 */
export function imageUrl(
  storageLocation: Optional<string>,
  path: Optional<string>,
  options: ImageUrlOptions = {},
): string | null {
  if (!path || !storageLocation) {
    return null;
  }
  return getPublicImageUrl(getPublicMediaUrl(storageLocation, path), options);
}

/** Signed imgproxy URL for an arbitrary allow-listed source URL. */
export function getPublicImageUrl(
  path: string,
  {
    resize,
    quality,
  }: Partial<{
    resize: Optional<ResizeOptions>;
    quality: Optional<number>;
  }> = {},
) {
  const builder = pb();

  if (resize) {
    builder.resize(resize);
  }

  if (quality) {
    builder.quality(quality);
  }

  return builder.build({
    baseUrl: IMGPROXY_URL,
    path,
    signature: { key: IMGPROXY_KEY, salt: IMGPROXY_SALT },
  });
}
