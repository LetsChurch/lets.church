import { createYoga } from 'graphql-yoga';
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

const graphqlHandler = createYoga<{
  req: FastifyRequest;
  reply: FastifyReply;
}>({
  schema,
  context,
  plugins: graphqlPlugins,
});

app.route({
  url: '/graphql',
  method: ['GET', 'POST', 'OPTIONS'],
  async handler(req, reply) {
    const response = await graphqlHandler.handleNodeRequest(req, {
      req,
      reply,
    });
    response.headers.forEach((value, key) => {
      // TODO: https://github.com/prisma-labs/graphql-request/issues/373
      reply.header(key, value.replace('graphql-response+', ''));
    });

    reply.status(response.status);

    reply.send(response.body);

    return reply;
  },
});

app.register(hooks, { prefix: '/hooks' });

await app.listen({ host: '0.0.0.0', port: 3000 });
