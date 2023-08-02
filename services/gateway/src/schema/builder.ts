import SchemaBuilder from '@pothos/core';
import ErrorsPlugin from '@pothos/plugin-errors';
import ScopeAuthPlugin from '@pothos/plugin-scope-auth';
import PrismaPlugin from '@pothos/plugin-prisma';
import RelayPlugin from '@pothos/plugin-relay';
import SimpleObjectsPlugin from '@pothos/plugin-simple-objects';
import ValidationPlugin from '@pothos/plugin-validation';
import type PrismaTypes from '@pothos/plugin-prisma/generated';
import TracingPlugin, {
  wrapResolver,
  isRootField,
} from '@pothos/plugin-tracing';
import type { Context } from '../util/context';
import prisma from '../util/prisma';
import type { Scalars } from './scalars';

export default new SchemaBuilder<{
  PrismaTypes: PrismaTypes;
  DefaultEdgesNullability: false;
  DefaultNodeNullability: false;
  Context: Context;
  AuthScopes: {
    authenticated: boolean;
    unauthenticated: boolean;
    admin: boolean;
  };
  Scalars: Scalars;
}>({
  plugins: [
    // ErrorsPlugin must be listed before PrismaPlugin and ValidationPlugin,
    // ahd should generally be listed first in order to catch any errors from
    // subsequent plugins
    ErrorsPlugin,
    // ScopeAuthPlugin must be listed first, aside from ErrorsPlugin
    ScopeAuthPlugin,
    // The rest
    PrismaPlugin,
    RelayPlugin,
    TracingPlugin,
    SimpleObjectsPlugin,
    ValidationPlugin,
  ],
  authScopes: ({ session }) => ({
    authenticated: !!session,
    unauthenticated: !session,
    admin: session?.appUser.role === 'ADMIN',
  }),
  prisma: {
    client: prisma,
    filterConnectionTotalCount: true,
  },
  relayOptions: {
    clientMutationId: 'omit',
    cursorType: 'String',
    edgesFieldOptions: {
      nullable: false,
    },
    nodeFieldOptions: {
      nullable: false,
    },
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
