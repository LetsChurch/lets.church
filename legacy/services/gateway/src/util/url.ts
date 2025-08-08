import envariant from '@knpwrs/envariant';
import pb, { type ResizeOptions } from '@bitpatty/imgproxy-url-builder';

const MEDIA_URL = envariant('MEDIA_URL');
const IMGPROXY_URL = envariant('IMGPROXY_URL');
const IMGPROXY_KEY = envariant('IMGPROXY_KEY');
const IMGPROXY_SALT = envariant('IMGPROXY_SALT');

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
