/* lets.bible service worker — runtime caching for offline reading.

   Hand-rolled (no Workbox) so it works with the SSR / nitro output as a plain
   static file served at the root scope. Strategies:
     - navigations          → network-first, fall back to the cached page, then
                              any cached page (the client router re-routes).
     - reading + search     → cache-first (the /reading/ chapter assets and
       static content          /search/ index assets are content-stable per
                              deploy; rolled by VERSION). This is what makes the
                              whole Bible + search work offline — the reader
                              fetches chapters from /reading/<id>/<slug>.json and
                              an idle pass precaches them (see local/precache.ts).
     - built static assets  → stale-while-revalidate.
     - Google Fonts         → cache-first (they rarely change).
     - tRPC query GETs       → network-first, so an opened chapter's
                              cross-references / preferences / translations are
                              available offline.

   Bump VERSION to roll all caches on the next activation. */

const VERSION = 'v2';
const PAGES = `lb-pages-${VERSION}`;
const ASSETS = `lb-assets-${VERSION}`;
const FONTS = `lb-fonts-${VERSION}`;
const API = `lb-api-${VERSION}`;
const CONTENT = `lb-content-${VERSION}`;
const KEEP = new Set([PAGES, ASSETS, FONTS, API, CONTENT]);

// Dev vs prod is signalled explicitly by the registration URL (`/sw.js?dev`),
// not by sniffing request shapes. In dev we use network-first for *everything*
// same-origin: while online it always serves the fresh response (so Vite HMR is
// never handed a stale module), and it only falls back to the cache when truly
// offline — which is what lets offline work against `vite dev` too, with no
// fragile "is this a Vite internal request?" guessing.
const DEV = new URL(self.location.href).searchParams.has('dev');

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.map((name) => (KEEP.has(name) ? undefined : caches.delete(name))),
      );
      await self.clients.claim();
    })(),
  );
});

function isGoogleFonts(url) {
  return (
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'
  );
}

// Which cache a URL belongs in — kept consistent with the fetch handler's
// lookups so a warm-cached entry is found on the offline path.
function cacheNameFor(url, isDoc) {
  if (isDoc) {
    return PAGES;
  }
  if (isGoogleFonts(url)) {
    return FONTS;
  }
  if (url.origin !== self.location.origin) {
    return null;
  }
  if (url.pathname.startsWith('/trpc/')) {
    return API;
  }
  if (
    url.pathname.startsWith('/reading/') ||
    url.pathname.startsWith('/search/')
  ) {
    return CONTENT;
  }
  return ASSETS;
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res?.ok) {
      cache.put(request, res.clone());
    }
    return res;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    throw err;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res?.ok) {
        cache.put(request, res.clone());
      }
      return res;
    })
    .catch(() => null);
  // Cache first if present, else the network result. Don't re-fetch on miss
  // (that would be a second request); if both are unavailable (offline, never
  // cached) reject like a normal failed fetch.
  const result = cached || (await network);
  if (!result) {
    throw new TypeError('Failed to fetch');
  }
  return result;
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }
  const res = await fetch(request);
  if (res?.ok) {
    cache.put(request, res.clone());
  }
  return res;
}

async function handleNavigation(request) {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(request);
    if (res?.ok) {
      cache.put(request, res.clone());
    }
    return res;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    // Last resort: any cached page — the client router re-routes to the URL.
    const shell = await cache.match('/');
    if (shell) {
      return shell;
    }
    throw err;
  }
}

// Cold-start warm-up: the page posts the URLs it loaded on first paint, so the
// SW can cache them even though it wasn't controlling that first navigation.
// Without this, a brand-new visitor who goes offline and reloads gets nothing —
// runtime caching only captures requests made once the SW already controls the
// page (i.e. the *second* load onward).
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'lb-precache') {
    return;
  }
  const items = [{ url: data.doc, isDoc: true }].concat(
    (data.urls || []).map((url) => ({ url, isDoc: false })),
  );
  event.waitUntil(
    Promise.all(
      items.map(async ({ url, isDoc }) => {
        try {
          const name = cacheNameFor(new URL(url), isDoc);
          if (!name) {
            return;
          }
          const res = await fetch(url);
          if (res.ok) {
            (await caches.open(name)).put(url, res.clone());
          }
        } catch {
          // best-effort warm — ignore individual failures
        }
      }),
    ),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }
  const url = new URL(request.url);

  // Google Fonts (cross-origin) — cache-first.
  if (isGoogleFonts(url)) {
    event.respondWith(cacheFirst(request, FONTS));
    return;
  }

  // Only handle same-origin requests below.
  if (url.origin !== self.location.origin) {
    return;
  }

  // tRPC query GETs — network-first (cross-refs / prefs / translations etc.).
  if (url.pathname.startsWith('/trpc/')) {
    event.respondWith(networkFirst(request, API));
    return;
  }

  // Reading chapters + search index — content-stable per deploy. Cache-first in
  // prod (instant + offline once fetched; rolled by VERSION); network-first in
  // dev so a `flex:build` regen is picked up while online.
  if (
    url.pathname.startsWith('/reading/') ||
    url.pathname.startsWith('/search/')
  ) {
    event.respondWith(
      DEV ? networkFirst(request, CONTENT) : cacheFirst(request, CONTENT),
    );
    return;
  }

  // Navigations — network-first with a cached-page / shell fallback.
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  // Dev: network-first for every same-origin GET. Online always serves fresh —
  // so HMR module fetches (and Vite's own client) are never stale — and the
  // cache only kicks in offline. No need to enumerate Vite-internal paths.
  // (Caveat: Vite serves CSS as JS-injected, per-load timestamped modules, so
  // styles aren't reliably offline in DEV — a Vite-pipeline limitation; prod
  // ships a stable hashed stylesheet that caches fine.)
  if (DEV) {
    event.respondWith(networkFirst(request, ASSETS));
    return;
  }

  // Prod: built assets are immutable + content-hashed → stale-while-revalidate.
  if (
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'worker' ||
    request.destination === 'font' ||
    request.destination === 'image'
  ) {
    event.respondWith(staleWhileRevalidate(request, ASSETS));
  }
});
