import { createFileRoute } from '@tanstack/react-router';
import { getDiscoveryDocument } from '@/util/oidc/discovery';

export const Route = createFileRoute('/.well-known/openid-configuration')({
  component: () => null,
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify(getDiscoveryDocument()), {
          headers: {
            'content-type': 'application/json',
            'cache-control': 'public, max-age=3600',
          },
        }),
    },
  },
});
