import { createFileRoute } from '@tanstack/react-router';

// OpenID discovery is deliberately NOT served at the origin root right now.
//
// ChatGPT's app portal probes https://lets.church/.well-known/* when
// connecting our MCP server (/mcp). Finding this document, it assumed the MCP
// server uses our OIDC provider and forced OAuth — which it can't complete,
// since the provider is first-party only (no DCR/CIMD) — even though /mcp
// needs no auth and every tool declares `noauth`. Our only OIDC client
// (lets.bible) builds its endpoints from OIDC_ISSUER and never reads this
// document, so 404ing it breaks nothing.
//
// To serve it again, return `getDiscoveryDocument()` from
// `@/util/oidc/discovery` as JSON. The standards-compliant long-term fix is
// moving the issuer under a path (e.g. https://lets.church/oidc) so discovery
// lives at /oidc/.well-known/openid-configuration instead of the root.
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
