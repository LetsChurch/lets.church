import { createFileRoute } from '@tanstack/react-router';

/**
 * Domain-verification token for the ChatGPT App Directory listing of our MCP
 * server (https://lets.church/mcp). OpenAI fetches this URL and expects the
 * exact token as plain text. It's public by design — anyone can fetch it from
 * this URL — so it lives in code rather than secret config. Replace it if
 * OpenAI issues a new one.
 */
const OPENAI_APPS_CHALLENGE_TOKEN =
  'pJPKUw69r5EutLxZvb-O0m-3Nphe9b96NmP3kcDYvgs';

export const Route = createFileRoute('/.well-known/openai-apps-challenge')({
  component: () => null,
  server: {
    handlers: {
      GET: () =>
        OPENAI_APPS_CHALLENGE_TOKEN
          ? new Response(OPENAI_APPS_CHALLENGE_TOKEN, {
              headers: {
                'content-type': 'text/plain; charset=utf-8',
                'cache-control': 'no-store',
              },
            })
          : new Response('Not found', {
              status: 404,
              headers: { 'cache-control': 'no-store' },
            }),
    },
  },
});
