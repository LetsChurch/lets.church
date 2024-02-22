import { createSignal } from 'solid-js';

const [query, setQuery] = createSignal(
  new URLSearchParams(window.location.search),
);

export { query };

window.addEventListener('popstate', () => {
  setQuery(new URLSearchParams(window.location.search));
});

export function pushQueryParams(p: Record<string, string>) {
  const params = new URLSearchParams(window.location.search);
  for (const [key, val] of Object.entries(p)) {
    params.set(key, val);
  }

  const search = `?${params.toString()}`;
  history.pushState(null, '', search);

  setQuery(params);
}
