import { createYoga } from 'graphql-yoga';
import { useDisableIntrospection } from '@envelop/disable-introspection';
import * as Sentry from '@sentry/node';
import envariant from '@knpwrs/envariant';
import context from './util/context';
import schema from './schema';

if (process.env['NODE_ENV'] !== 'development') {
  Sentry.init({
    dsn: envariant('SENTRY_DSN'),
    environment: process.env['NODE_ENV'] ?? 'default',
  });
}

const graphqlPlugins = [
  process.env['NODE_ENV'] !== 'development' && useDisableIntrospection,
];

const graphqlHandler = createYoga({
  schema,
  context,
  plugins: graphqlPlugins,
  fetchAPI: {
    fetch,
    Request,
    ReadableStream,
    Response,
  },
});

const server = Bun.serve({
  fetch: (req, _server) => {
    if (req.url === '/health') {
      return new Response(null, { status: 204 });
    }

    return graphqlHandler.fetch(req);
  },
  port: 3000,
});

console.info(
  `Server is running on ${new URL(
    graphqlHandler.graphqlEndpoint,
    `http://${server.hostname}:${server.port}`,
  )}`,
);
