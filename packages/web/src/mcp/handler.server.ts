import '@tanstack/react-start/server-only';
import { readBoundedRequest, RequestBodyTooLargeError } from '@letschurch/util';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { TRPCError } from '@trpc/server';
import type { z } from 'zod';

import type { Context } from '@/trpc/context';
import { appRouter } from '@/trpc/router';
import logger from '@/util/logger';

import {
  type Caller,
  findChurches,
  findFilterValues,
  getChannel,
  getRelatedSermons,
  getSeries,
  getSermon,
  getTranscript,
  listChurchTags,
  searchSermons,
  ToolError,
} from './handlers';
import { enforceMcpCallRateLimit, mcpRateLimitSubject } from './rate-limit';
import { serverInfo, serverInstructions } from './server-info';
import { mintMcpSessionId, verifyMcpSessionId } from './session';
import {
  findChurchesTool,
  findFilterValuesTool,
  getChannelTool,
  getRelatedSermonsTool,
  getSeriesTool,
  getSermonTool,
  getTranscriptTool,
  listChurchTagsTool,
  searchSermonsTool,
} from './tools';

const moduleLogger = logger.child({ module: 'mcp' });

/** JSON-RPC tool calls are small; anything bigger is not a legitimate client. */
export const MCP_MAX_BODY_BYTES = 64 * 1024;

const MCP_SESSION_HEADER = 'mcp-session-id';

function structured(value: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(value) }],
    structuredContent: value,
  };
}

function toolError(message: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

/**
 * Report failures to the agent as tool errors (which it can read and react to)
 * rather than protocol errors. Only expected client errors are passed through
 * verbatim; anything else is logged and summarized.
 */
function failureResult(
  error: unknown,
  ctx: Context,
  tool: string,
): CallToolResult {
  if (error instanceof ToolError) return toolError(error.message);
  if (error instanceof TRPCError) {
    switch (error.code) {
      case 'TOO_MANY_REQUESTS': {
        const retryAfter = ctx.resHeaders.get('Retry-After');
        return toolError(
          `Rate limited. ${retryAfter ? `Retry after ${retryAfter} seconds.` : 'Retry later.'}`,
        );
      }
      case 'BAD_REQUEST':
        return toolError(`Invalid arguments: ${error.message}`);
      case 'NOT_FOUND':
        return toolError('Not found.');
      default:
        break;
    }
  }
  moduleLogger.error(
    {
      err: error instanceof Error ? error : new Error(String(error)),
      context: { tool },
    },
    'MCP tool failed',
  );
  return toolError("The Let's Church service failed. Try again shortly.");
}

type ToolDefinition<I extends z.ZodObject> = {
  name: string;
  title: string;
  description: string;
  inputSchema: I;
  outputSchema: z.ZodObject;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    openWorldHint: boolean;
  };
};

function createServer(ctx: Context) {
  const caller = appRouter.createCaller(ctx);
  const server = new McpServer(serverInfo, {
    instructions: serverInstructions,
  });

  function register<I extends z.ZodObject>(
    { name, ...config }: ToolDefinition<I>,
    run: (caller: Caller, input: z.infer<I>) => Promise<object>,
  ) {
    server.registerTool(name, config, (async (input: z.infer<I>) => {
      const limit = await enforceMcpCallRateLimit({
        headers: ctx.req.headers,
        subject: ctx.rateLimitSubject,
      });
      if (!limit.allowed) {
        return toolError(
          `Rate limited. Retry after ${limit.retryAfterSeconds} seconds.`,
        );
      }
      moduleLogger.info(
        { context: { tool: name, session: Boolean(ctx.rateLimitSubject) } },
        `MCP tool call: ${name}`,
      );
      try {
        return structured(
          (await run(caller, input)) as Record<string, unknown>,
        );
      } catch (error) {
        return failureResult(error, ctx, name);
      }
      // The SDK infers callback arg types from the concrete schema; this
      // generic wrapper validates the same schema, so the cast is sound.
    }) as never);
  }

  register(findFilterValuesTool, findFilterValues);
  register(searchSermonsTool, searchSermons);
  register(getSermonTool, getSermon);
  register(getTranscriptTool, getTranscript);
  register(getRelatedSermonsTool, getRelatedSermons);
  register(getChannelTool, getChannel);
  register(getSeriesTool, getSeries);
  register(findChurchesTool, findChurches);
  register(listChurchTagsTool, listChurchTags);

  return server;
}

function sessionNotFound(): Response {
  // Per Streamable HTTP, 404 on a session id tells the client to re-initialize.
  return Response.json(
    {
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Session not found' },
      id: null,
    },
    { status: 404, headers: { 'cache-control': 'no-store' } },
  );
}

async function isInitializeRequest(request: Request): Promise<boolean> {
  try {
    const body: unknown = await request.clone().json();
    const messages = Array.isArray(body) ? body : [body];
    return messages.some(
      (m) =>
        typeof m === 'object' &&
        m !== null &&
        (m as { method?: unknown }).method === 'initialize',
    );
  } catch {
    // Malformed JSON: let the transport produce the JSON-RPC parse error.
    return false;
  }
}

/**
 * Stateless Streamable HTTP endpoint: a fresh server + transport per request
 * and JSON responses (no SSE).
 *
 * Sessions exist only for rate limiting. `initialize` mints a signed
 * `Mcp-Session-Id` (see ./session.ts) that the client echoes on later requests;
 * each session gets its own buckets under a shared per-IP ceiling, so users of
 * a hosted MCP client don't share one IP's budget. Requests without a session
 * fall back to plain per-IP limits.
 *
 * Every tool is read-only and public, so the tRPC context is always anonymous —
 * ambient cookies are ignored, which also means a cross-site request can't act
 * as a signed-in user.
 */
export async function handleMcpRequest(request: Request): Promise<Response> {
  let boundedRequest = request;
  if (request.method === 'POST') {
    try {
      boundedRequest = await readBoundedRequest(request, MCP_MAX_BODY_BYTES);
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        return new Response('Request body too large', {
          status: 413,
          headers: { 'cache-control': 'no-store' },
        });
      }
      throw error;
    }
  }

  let sessionKey: string | null = null;
  let mintedSessionId: string | null = null;
  const presentedSessionId = boundedRequest.headers.get(MCP_SESSION_HEADER);
  if (presentedSessionId) {
    sessionKey = verifyMcpSessionId(presentedSessionId);
    if (!sessionKey) return sessionNotFound();
  } else if (
    boundedRequest.method === 'POST' &&
    (await isInitializeRequest(boundedRequest))
  ) {
    mintedSessionId = mintMcpSessionId();
    sessionKey = verifyMcpSessionId(mintedSessionId);
  }

  const ctx: Context = {
    session: null,
    req: boundedRequest,
    resHeaders: new Headers(),
    isSiteAdmin: false,
    rateLimitSubject: sessionKey ? mcpRateLimitSubject(sessionKey) : null,
  };
  const server = createServer(ctx);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    const response = await transport.handleRequest(boundedRequest);
    if (!mintedSessionId || !response.ok) return response;

    const headers = new Headers(response.headers);
    headers.set(MCP_SESSION_HEADER, mintedSessionId);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } finally {
    await server.close();
  }
}
