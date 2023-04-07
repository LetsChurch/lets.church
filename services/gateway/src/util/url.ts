import envariant from '@knpwrs/envariant';

const MEDIA_URL = envariant('MEDIA_URL');

export function getPublicMediaUrl(path: string) {
  const url = new URL(MEDIA_URL);
  url.pathname = path;
  return url.toString();
}
