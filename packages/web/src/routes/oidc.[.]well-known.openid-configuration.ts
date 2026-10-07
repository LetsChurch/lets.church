import { createFileRoute } from '@tanstack/react-router';

import { getDiscoveryDocument } from '@/util/oidc/discovery';

// OpenID discovery for the issuer https://<origin>/oidc (see util/oidc/config.ts).
export const Route = createFileRoute('/oidc/.well-known/openid-configuration')({
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
