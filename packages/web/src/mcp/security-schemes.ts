import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import logger from '@/util/logger';

const moduleLogger = logger.child({ module: 'mcp/security-schemes' });

type RequestHandler = (request: unknown, extra: unknown) => Promise<unknown>;
type ToolDescriptor = Record<string, unknown> & {
  _meta?: { securitySchemes?: unknown };
};

/**
 * Copy each tool's `_meta.securitySchemes` up to a top-level `securitySchemes`
 * in `tools/list`.
 *
 * ChatGPT reads a tool's auth policy (`noauth` / `oauth2`) from the top-level
 * field, with `_meta.securitySchemes` documented only as a back-compat mirror.
 * The SDK's `registerTool` serializes a fixed set of tool fields and drops
 * anything else, so we declare the schemes in `_meta` and wrap the SDK's
 * `tools/list` handler to add the top-level copy.
 *
 * This reaches into the SDK's request-handler map, which isn't public API.
 * `security-schemes.test.ts` exercises it through the real transport, so an
 * SDK upgrade that moves it fails CI instead of silently dropping the field.
 * Call it after every tool is registered (the SDK installs `tools/list` on the
 * first registration).
 */
export function exposeSecuritySchemes(server: McpServer): void {
  const handlers = (
    server.server as unknown as {
      _requestHandlers?: Map<string, RequestHandler>;
    }
  )._requestHandlers;
  const listTools = handlers?.get('tools/list');
  if (!handlers || !listTools) {
    // Degrade to the `_meta` mirror rather than failing every MCP request.
    moduleLogger.warn(
      'Cannot expose top-level securitySchemes: SDK tools/list handler not found',
    );
    return;
  }

  handlers.set('tools/list', async (request, extra) => {
    const result = (await listTools(request, extra)) as {
      tools: Array<ToolDescriptor>;
    };
    return {
      ...result,
      tools: result.tools.map((tool) =>
        tool._meta?.securitySchemes
          ? { ...tool, securitySchemes: tool._meta.securitySchemes }
          : tool,
      ),
    };
  });
}
