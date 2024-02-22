import { createSignal } from 'solid-js';

const [query, setQuery] = createSignal(
  new URLSearchParams(window.location.search),
);

export { query };

window.addEventListener('popstate', () => {
  setQuery(new URLSearchParams(window.location.search));
});

export function pushQueryParams(p: Record<string, string | null>) {
  const params = new URLSearchParams(window.location.search);
  for (const [key, val] of Object.entries(p)) {
    if (val) {
      params.set(key, val);
    } else {
      params.delete(key);
    }
  }

  const search = `?${params.toString()}`;
  history.pushState(null, '', search);

  setQuery(params);
}
