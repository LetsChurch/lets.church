import pb, { type ResizeOptions } from '@bitpatty/imgproxy-url-builder';
import { SignJWT } from 'jose';
import { z } from 'zod';

const {
  MEDIA_URL,
  IMGPROXY_URL,
  IMGPROXY_KEY,
  IMGPROXY_SALT,
  DOWNLOAD_URL,
  JWT_SECRET,
} = z
  .object({
    MEDIA_URL: z.string(),
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
  variant: string,
  filename: string,
): Promise<string> {
  const expiry = Math.floor(Date.now() / 1000) + 15 * 60;
  const token = await new SignJWT({ uploadId, variant, filename })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(expiry)
    .sign(jwtSecret);
  const url = new URL(`/${uploadId}/${variant}`, DOWNLOAD_URL);
  url.searchParams.set('token', token);
  return url.toString();
}

export function getPublicMediaUrl(key: string) {
  const url = new URL(MEDIA_URL);
  // Normalize paths to avoid double slashes
  const basePath = url.pathname.replace(/\/+$/, ''); // Remove trailing slashes
  const normalizedKey = key.replace(/^\/+/, ''); // Remove leading slashes
  url.pathname = `${basePath}/${normalizedKey}`;
  return url.toString();
}

type Optional<T> = T | undefined | null;

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
