import envariant from '@knpwrs/envariant';
import { getProperty } from 'dot-prop';
import { userV0Schema } from '../../util/ory';
import builder from '../builder';

const ORY_KRATOS_ADMIN_URL = envariant('ORY_KRATOS_ADMIN_URL');

builder.queryType();

const AppUserIdentity = builder.simpleObject('AppUserIdentity', {
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

const AppUser = builder.prismaObject('AppUser', {
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
          role: json.metadataPublic.role,
          verifiableAddresses: json.verifiableAddresses,
        };
      },
    }),
  }),
});

builder.queryFields((t) => ({
  me: t.field({
    type: AppUser,
    nullable: true,
    resolve: async (_root, _args, context, _info) => {
      const identity = await context.identity;

      if (identity) {
        const {
          id,
          traits: { username },
          metadataPublic: { role },
          verifiableAddresses,
        } = identity;

        return {
          id,
          username,
          role,
          verifiableAddresses,
        };
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
