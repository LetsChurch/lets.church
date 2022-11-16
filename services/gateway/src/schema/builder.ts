import SchemaBuilder from '@pothos/core';
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

export default new SchemaBuilder<{
  PrismaTypes: PrismaTypes;
  Context: Context;
  AuthScopes: {
    authenticated: boolean;
    unauthenticated: boolean;
    admin: boolean;
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
    ValidationPlugin,
  ],
  authScopes: async ({ session }) => ({
    authenticated: async () => !!(await session),
    unauthenticated: async () => !(await session),
    admin: async () => {
      const s = await session;

      if (s) {
        return s.appUser.role === 'ADMIN';
      }

      return false;
    },
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
