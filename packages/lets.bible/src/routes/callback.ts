import { createFileRoute } from '@tanstack/react-router';

import { completeLogin } from '@/server/oidc';

export const Route = createFileRoute('/callback')({
  component: () => null,
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { location, setCookies } = await completeLogin(request);
        const headers = new Headers({ location });
        for (const cookie of setCookies) {
          headers.append('set-cookie', cookie);
        }
        return new Response(null, { status: 302, headers });
      },
    },
  },
});
