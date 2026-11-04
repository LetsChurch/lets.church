import { defineHandler, HTTPError } from 'nitro/h3';

// Nitro's static middleware serves every file that exists under /assets/ before
// this handler runs, so a request that reaches it names a file this build doesn't
// have — usually a chunk from a newer or older build, requested mid-rollout from
// a pod that hasn't got it.
//
// Without this handler the request falls through to the SSR 404 page, and that
// page inherits the `public, max-age=31536000, immutable` header Nitro puts on
// /assets/** (Vite's client output is registered with fallthrough, so Nitro's
// own no-store 404 for missing assets never fires). Cloudflare then caches the
// 404 at that edge location for a year, breaking hydration for everyone routed
// through it until a deploy renames the chunk. Answer with an uncacheable 404
// instead so the next request retries the origin.
//
// It must throw rather than return: the /assets/** `headers` route rule writes
// its headers after the handler finishes, overwriting anything set on the
// response, but an error goes through Nitro's error handler, which builds a
// fresh response from the error's own headers.
export default defineHandler(() => {
  throw new HTTPError({
    status: 404,
    statusText: 'Not Found',
    headers: {
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
});
