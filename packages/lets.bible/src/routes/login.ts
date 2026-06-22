import { createFileRoute } from '@tanstack/react-router';
import { beginLogin } from '@/server/oidc';

export const Route = createFileRoute('/login')({
  component: () => null,
  server: {
    handlers: {
      GET: async () => {
        const { location, setCookie } = await beginLogin();
        const headers = new Headers({ location });
        headers.append('set-cookie', setCookie);
        return new Response(null, { status: 302, headers });
      },
    },
  },
});
