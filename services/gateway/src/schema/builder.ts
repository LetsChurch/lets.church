import SchemaBuilder from '@pothos/core';
import PrismaPlugin from '@pothos/plugin-prisma';
import RelayPlugin from '@pothos/plugin-relay';
import SimpleObjectsPlugin from '@pothos/plugin-simple-objects';
import type PrismaTypes from '@pothos/plugin-prisma/generated';
import TracingPlugin, {
  wrapResolver,
  isRootField,
} from '@pothos/plugin-tracing';
import type { Context } from '../util/context';
import prisma from '../util/prisma';

export default new SchemaBuilder<{
  PrismaTypes: PrismaTypes;
  Context: Context;
}>({
  plugins: [
    // The rest
    PrismaPlugin,
    RelayPlugin,
    TracingPlugin,
    SimpleObjectsPlugin,
  ],
  prisma: {
    client: prisma,
  },
  relayOptions: {
    clientMutationId: 'omit',
    cursorType: 'String',
  },
  tracing: {
    default:
      process.env['NODE_ENV'] === 'development'
        ? true
        : (config) => isRootField(config),
    wrap: (resolver, _options, config) =>
      wrapResolver(resolver, (_error, duration) => {
        console.log(
          `🪴 Executed resolver ${config.parentType}.${config.name} in ${duration}ms`,
        );
      }),
  },
});
