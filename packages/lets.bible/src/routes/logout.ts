import { createFileRoute } from '@tanstack/react-router';

import { buildLogout } from '@/server/oidc';

// Logout is POST-only so a cross-site link or <img> can't sign a user out. The
// session cookie is SameSite=Lax, so a cross-site form POST arrives without it
// and can't end the session either. A stray GET (old bookmark, typed URL) just
// goes home.
export const Route = createFileRoute('/logout')({
  component: () => null,
  server: {
    handlers: {
      GET: () =>
        new Response(null, { status: 303, headers: { location: '/' } }),
      POST: async ({ request }) => {
        const { location, setCookie } = await buildLogout(request);
        const headers = new Headers({ location });
        headers.append('set-cookie', setCookie);
        // 303 so the browser follows the redirect with a GET.
        return new Response(null, { status: 303, headers });
      },
    },
  },
});
