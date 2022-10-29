import envariant from '@knpwrs/envariant';
import { getProperty } from 'dot-prop';
import builder from '../builder';
import { userV0Schema } from '../../util/ory';

const ORY_KRATOS_ADMIN_URL = envariant('ORY_KRATOS_ADMIN_URL');

export const AppUserIdentity = builder.simpleObject('AppUserIdentity', {
  fields: (pt) => ({
    id: pt.field({ type: 'ShortUuid' }),
    username: pt.string(),
    role: pt.field({
      type: builder.enumType('AppUserRole', {
        values: ['admin', 'user'] as const,
      }),
    }),
    verifiableAddresses: pt.field({
      nullable: true,
      authScopes: async (parent, _args, { identity }) => {
        if (getProperty(await identity, 'id') === getProperty(parent, 'id')) {
          return true;
        }

        return {
          admin: true,
        };
      },
      unauthorizedResolver: () => null,
      type: [
        builder.simpleObject('AppUserVerifiableAddress', {
          fields: (vat) => ({
            id: vat.field({ type: 'ShortUuid' }),
            value: vat.string(),
            verified: vat.boolean(),
          }),
        }),
      ],
    }),
  }),
});

export const AppUser = builder.prismaObject('AppUser', {
  fields: (t) => ({
    id: t.expose('id', { type: 'ShortUuid' }),
    profile: t.field({
      type: AppUserIdentity,
      resolve: async ({ id }) => {
        const res = await fetch(`${ORY_KRATOS_ADMIN_URL}/identities/${id}`);
        const json = userV0Schema.parse(await res.json());
        return {
          id,
          username: json.traits.username,
          role: json.metadataPublic?.role ?? 'user',
          verifiableAddresses: json.verifiableAddresses,
        };
      },
    }),
    channelMembershipsConnection: t.relatedConnection('channelMemberships', {
      cursor: 'channelId_appUserId',
    }),
    organizationMemberhipsConnection: t.relatedConnection(
      'organizationMemberships',
      {
        cursor: 'organizationId_appUserId',
      },
    ),
    createdAt: t.field({
      type: 'DateTime',
      select: { createdAt: true },
      resolve: (channel) => channel.createdAt.toISOString(),
    }),
    updatedAt: t.field({
      type: 'DateTime',
      select: { updatedAt: true },
      resolve: (channel) => channel.updatedAt.toISOString(),
    }),
  }),
});

builder.queryFields((t) => ({
  me: t.prismaField({
    type: AppUser,
    nullable: true,
    resolve: async (query, _root, _args, context, _info) => {
      const identity = await context.identity;

      if (identity) {
        return context.prisma.appUser.findUniqueOrThrow({
          ...query,
          where: { id: identity.id },
        });
      }

      return null;
    },
  }),
  usersConnection: t.prismaConnection({
    type: AppUser,
    cursor: 'id',
    maxSize: 50,
    defaultSize: 50,
    resolve: (query, _root, _args, context, _info) =>
      context.prisma.appUser.findMany(query),
  }),
  userById: t.prismaField({
    type: AppUser,
    args: {
      id: t.arg({ type: 'ShortUuid', required: true }),
    },
    resolve: (query, _root, { id }, context) => {
      return context.prisma.appUser.findUniqueOrThrow({
        ...query,
        where: { id },
      });
    },
  }),
}));

builder.mutationFields((t) => ({
  // TODO: this should be moved to another API that isn't visible from the frontend
  syncUserProfile: t.boolean({
    args: {
      id: t.arg({ type: 'Uuid', required: true }),
    },
    authScopes: { internal: true },
    resolve: async (_root, { id }, context, _info) => {
      await context.prisma.appUser.upsert({
        create: { id },
        where: { id },
        update: {},
      });

      return true;
    },
  }),
}));
