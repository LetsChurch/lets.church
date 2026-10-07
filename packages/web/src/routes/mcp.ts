import { createFileRoute } from '@tanstack/react-router';

import { handleMcpRequest } from '@/mcp/handler.server';

// Model Context Protocol endpoint (Streamable HTTP, stateless). The transport
// answers GET/DELETE with 405 itself since there are no sessions or SSE streams.
export const Route = createFileRoute('/mcp')({
  component: () => null,
  server: {
    handlers: {
      GET: async ({ request }) => handleMcpRequest(request),
      POST: async ({ request }) => handleMcpRequest(request),
      DELETE: async ({ request }) => handleMcpRequest(request),
    },
  },
});
