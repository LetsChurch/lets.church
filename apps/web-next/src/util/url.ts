import { type Location } from '@solidjs/router';

export function setQueryParams(
  current: Location['query'] | string,
  params: Record<string, string | null | Array<string | null>>,
) {
  const searchParams = new URLSearchParams(current.toString());

  for (const [key, value] of Object.entries(params)) {
    if (value && value.length > 0) {
      searchParams.set(key, Array.isArray(value) ? value.join(',') : value);
    } else {
      searchParams.delete(key);
    }
  }
  return searchParams;
}
