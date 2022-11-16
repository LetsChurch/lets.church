import { createServer } from '@graphql-yoga/node';
import fastify, { FastifyRequest, FastifyReply } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import { useDisableIntrospection } from '@envelop/disable-introspection';
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import envariant from '@knpwrs/envariant';
import context from './util/context';
import schema from './schema';
import hooks from './hooks';

const app = fastify({ logger: true });

app.register(fastifyCookie, {
  secret: envariant('COOKIE_SECRET'),
});

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

const graphqlPlugins = [
  process.env['NODE_ENV'] !== 'development' && useDisableIntrospection,
];

const graphqlServer = createServer<{
  req: FastifyRequest;
  reply: FastifyReply;
}>({
  schema,
  context,
  plugins: graphqlPlugins,
  port: 3000,
});

app.route({
  url: '/graphql',
  method: ['GET', 'POST', 'OPTIONS'],
  async handler(req, reply) {
    const response = await graphqlServer.handleIncomingMessage(req, {
      req,
      reply,
    });
    response.headers.forEach((value, key) => {
      reply.header(key, value);
    });

    reply.status(response.status);

    reply.send(response.body);

    return reply;
  },
});

app.register(hooks, { prefix: '/hooks' });

await app.listen({ host: '0.0.0.0', port: 3000 });
