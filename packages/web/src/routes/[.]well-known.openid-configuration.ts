import { createFileRoute } from '@tanstack/react-router';
import { discoveryDocument } from '@/util/oidc/discovery';

export const Route = createFileRoute('/.well-known/openid-configuration')({
  component: () => null,
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify(discoveryDocument), {
          headers: {
            'content-type': 'application/json',
            'cache-control': 'public, max-age=3600',
          },
        }),
    },
  },
});
