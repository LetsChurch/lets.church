import pb, {
  ResizeType,
  type ResizeOptions,
} from '@bitpatty/imgproxy-url-builder';
import { z } from 'zod';

export { ResizeType };

const { MEDIA_URL, IMGPROXY_URL, IMGPROXY_KEY, IMGPROXY_SALT } = z
  .object({
    MEDIA_URL: z.string(),
    IMGPROXY_URL: z.string(),
    IMGPROXY_KEY: z.string(),
    IMGPROXY_SALT: z.string(),
  })
  .parse(process.env);

export function getPublicMediaUrl(key: string) {
  const url = new URL(MEDIA_URL);
  url.pathname += `/${key}`;
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
