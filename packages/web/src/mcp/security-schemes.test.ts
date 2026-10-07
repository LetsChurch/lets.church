import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { exposeSecuritySchemes } from './security-schemes';

// Read tools/list off the wire, as ChatGPT sees it. The SDK's own Client
// strips unknown tool fields while parsing, so it can't observe this.
async function listToolsOverHttp(server: McpServer) {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    const response = await transport.handleRequest(
      new Request('http://localhost/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      }),
    );
    const body = (await response.json()) as {
      result: { tools: Array<Record<string, unknown>> };
    };
    return body.result.tools;
  } finally {
    await server.close();
  }
}

describe('exposeSecuritySchemes', () => {
  it('adds a top-level securitySchemes copy while keeping the _meta mirror', async () => {
    const server = new McpServer({ name: 'test', version: '1' });
    const noauth = [{ type: 'noauth' }];
    server.registerTool(
      'anonymous_tool',
      {
        description: 'd',
        inputSchema: z.object({ q: z.string() }),
        _meta: { securitySchemes: noauth },
      },
      async () => ({ content: [] }),
    );
    server.registerTool(
      'undeclared_tool',
      { description: 'd', inputSchema: z.object({}) },
      async () => ({ content: [] }),
    );
    exposeSecuritySchemes(server);

    const tools = await listToolsOverHttp(server);
    const anonymous = tools.find((t) => t.name === 'anonymous_tool');
    const undeclared = tools.find((t) => t.name === 'undeclared_tool');

    expect(anonymous).toMatchObject({
      securitySchemes: noauth,
      _meta: { securitySchemes: noauth },
    });
    // The rest of the descriptor still comes from the SDK.
    expect(anonymous?.inputSchema).toMatchObject({ type: 'object' });
    expect(undeclared).not.toHaveProperty('securitySchemes');
  });
});
