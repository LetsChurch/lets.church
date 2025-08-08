import SchemaBuilder from '@pothos/core';
import ErrorsPlugin from '@pothos/plugin-errors';
import ScopeAuthPlugin from '@pothos/plugin-scope-auth';
import PrismaPlugin from '@pothos/plugin-prisma';
import RelayPlugin from '@pothos/plugin-relay';
import SimpleObjectsPlugin from '@pothos/plugin-simple-objects';
import ValidationPlugin from '@pothos/plugin-validation';
import type PrismaTypes from '@pothos/plugin-prisma/generated';
import TracingPlugin, {
  isRootField,
  runFunction,
} from '@pothos/plugin-tracing';
import type { Context } from '../util/context';
import prisma from '../util/prisma';
import logger from '../util/logger';
import type { Scalars } from './scalars';

const moduleLogger = logger.child({ module: 'schema/builder' });

export default new SchemaBuilder<{
  // TODO: v4 upgrade: set nullability throughout types
  DefaultFieldNullability: false;
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
  // TODO: v4 upgrade: set nullability throughout types
  defaultFieldNullability: false,
  scopeAuth: {
    authScopes: ({ session }) => ({
      authenticated: !!session,
      unauthenticated: !session,
      admin: session?.appUser.role === 'ADMIN',
    }),
  },
  prisma: {
    client: prisma,
    filterConnectionTotalCount: true,
  },
  relay: {
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
    wrap: (resolver, _options, config) => (source, args, context, info) =>
      runFunction(
        () => resolver(source, args, context, info),
        (error, duration) => {
          const bindings = {
            graphql: {
              kind: config.kind,
              parentType: config.parentType,
              args: JSON.stringify(
                Object.fromEntries(
                  Object.entries(args).map(([key, value]) => [
                    key,
                    key === 'password' ? '********' : value,
                  ]),
                ),
              ),
            },
            duration,
          };

          if (error) {
            moduleLogger.error(
              bindings,
              error instanceof Error ? error.message : `${error}`,
            );
          } else {
            moduleLogger.info(bindings);
          }
        },
      ),
  },
});
