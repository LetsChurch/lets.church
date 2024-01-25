export function setQueryParams(
  current: ConstructorParameters<typeof URLSearchParams>[0],
  params: Record<string, string | null | Array<string | null>>,
) {
  const searchParams = new URLSearchParams(current);
  for (const [key, value] of Object.entries(params)) {
    if (value && value.length > 0) {
      searchParams.set(key, Array.isArray(value) ? value.join(',') : value);
    } else {
      searchParams.delete(key);
    }
  }
  return searchParams;
}
