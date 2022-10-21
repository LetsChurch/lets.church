import { createServer } from '@graphql-yoga/node';
import { useDisableIntrospection } from '@envelop/disable-introspection';
import context from './util/context';
import schema from './schema';

const plugins = [
  process.env['NODE_ENV'] !== 'development' && useDisableIntrospection,
];

const server = createServer({
  schema,
  context,
  plugins,
  port: 3000,
});

server.start().catch((e) => {
  console.error(e);
  process.exit(-1);
});
