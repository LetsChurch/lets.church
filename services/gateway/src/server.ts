import { createYoga } from 'graphql-yoga';
import { Hono, Context } from 'hono';
import { serve } from '@hono/node-server';
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

const app = new Hono();

const graphqlPlugins = [
  process.env['NODE_ENV'] !== 'development' && useDisableIntrospection,
];

const graphqlHandler = createYoga<{
  c: Context;
}>({
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

app.on(['GET', 'POST', 'OPTIONS'], '/graphql', async (c) => {
  return graphqlHandler.fetch(c.req.raw, { c });
});

serve(app);
