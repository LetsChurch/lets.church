import SchemaBuilder from '@pothos/core';
import ScopeAuthPlugin from '@pothos/plugin-scope-auth';
import PrismaPlugin from '@pothos/plugin-prisma';
import RelayPlugin from '@pothos/plugin-relay';
import SimpleObjectsPlugin from '@pothos/plugin-simple-objects';
import type PrismaTypes from '@pothos/plugin-prisma/generated';
import envariant from '@knpwrs/envariant';
import TracingPlugin, {
  wrapResolver,
  isRootField,
} from '@pothos/plugin-tracing';
import type { Context } from '../util/context';
import prisma from '../util/prisma';

const AUTH_HOOKS_SECRET = envariant('AUTH_HOOKS_SECRET');

export default new SchemaBuilder<{
  PrismaTypes: PrismaTypes;
  Context: Context;
  AuthScopes: {
    authenticated: boolean;
    admin: boolean;
    internal: boolean;
  };
  Scalars: {
    DateTime: {
      Input: Date | string;
      Output: string;
    };
    Uuid: {
      Input: string;
      Output: string;
    };
    ShortUuid: {
      Input: string;
      Output: string;
    };
  };
}>({
  plugins: [
    // ScopeAuthPlugin must be listed first
    ScopeAuthPlugin,
    // The rest
    PrismaPlugin,
    RelayPlugin,
    TracingPlugin,
    SimpleObjectsPlugin,
  ],
  authScopes: async ({ identity, authorization }) => ({
    authenticated: async () => !!(await identity),
    admin: async () => {
      const i = await identity;

      if (i) {
        return i.metadataPublic?.role === 'admin';
      }

      return false;
    },
    internal: authorization === AUTH_HOOKS_SECRET,
  }),
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
