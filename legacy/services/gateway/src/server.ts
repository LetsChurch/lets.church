import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createYoga } from 'graphql-yoga';
import { useDisableIntrospection } from '@envelop/disable-introspection';
import * as Sentry from '@sentry/node';
import envariant from '@knpwrs/envariant';
import context from './util/context';
import schema from './schema/index';

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

const app = new Hono();

app.get('/health', (c) => {
  c.status(204);
  return c.body(null);
});

app.on(['GET', 'POST'], '/graphql', (c) => graphqlHandler.fetch(c.req.raw));

serve({ fetch: app.fetch, port: 3000 }, (info) => {
  console.info(
    `Server is running on ${new URL(
      graphqlHandler.graphqlEndpoint,
      `http://${info.family === 'IPv6' ? `[${info.address}]` : info.address}:${info.port}`,
    )}`,
  );
});
