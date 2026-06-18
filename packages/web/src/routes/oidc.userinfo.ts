import { createFileRoute } from '@tanstack/react-router';
import { buildUserClaims } from '@/util/oidc/claims';
import { verifyAccessToken } from '@/util/oidc/tokens';

const UNAUTHORIZED = new Response(JSON.stringify({ error: 'invalid_token' }), {
  status: 401,
  headers: {
    'content-type': 'application/json',
    'www-authenticate': 'Bearer error="invalid_token"',
  },
});

async function handle(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return UNAUTHORIZED.clone();
  }

  const verified = await verifyAccessToken(authHeader.slice(7).trim());
  if (!verified) {
    return UNAUTHORIZED.clone();
  }

  const claims = (await buildUserClaims(verified.sub, verified.scope)) ?? {};

  return new Response(JSON.stringify({ sub: verified.sub, ...claims }), {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });
}

export const Route = createFileRoute('/oidc/userinfo')({
  component: () => null,
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});
