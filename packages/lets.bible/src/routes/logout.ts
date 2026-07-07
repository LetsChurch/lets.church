import { createFileRoute } from '@tanstack/react-router';

import { buildLogout } from '@/server/oidc';

export const Route = createFileRoute('/logout')({
  component: () => null,
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { location, setCookie } = await buildLogout(request);
        const headers = new Headers({ location });
        headers.append('set-cookie', setCookie);
        return new Response(null, { status: 302, headers });
      },
    },
  },
});
