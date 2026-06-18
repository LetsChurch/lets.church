import { createFileRoute } from '@tanstack/react-router';
import { getPublicJwks } from '@/util/oidc/keys';

export const Route = createFileRoute('/.well-known/jwks.json')({
  component: () => null,
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify(await getPublicJwks()), {
          headers: {
            'content-type': 'application/json',
            'cache-control': 'public, max-age=3600',
          },
        }),
    },
  },
});
