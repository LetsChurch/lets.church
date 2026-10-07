import { createFileRoute } from '@tanstack/react-router';

// Deliberately 404s. Our OIDC issuer is https://<origin>/oidc, so its
// discovery document lives at /oidc/.well-known/openid-configuration.
//
// Nothing may be served here: ChatGPT's app portal probes the origin root's
// .well-known documents when connecting our MCP server (/mcp), and a root
// discovery document made it assume the MCP server uses this OIDC provider and
// force OAuth (which it can't complete) even though /mcp needs no auth. An
// explicit 404 also avoids the app's non-HTML fallback, which answers JSON
// requests for unknown paths with a 500.
export const Route = createFileRoute('/.well-known/openid-configuration')({
  component: () => null,
  server: {
    handlers: {
      GET: () =>
        new Response('Not found', {
          status: 404,
          headers: { 'cache-control': 'no-store' },
        }),
    },
  },
});
