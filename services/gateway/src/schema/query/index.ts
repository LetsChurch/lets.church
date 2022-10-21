import envariant from '@knpwrs/envariant';
import * as Z from 'zod';
import camelcaseKeys from 'camelcase-keys';
import builder from '../builder';

const ORY_KRATOS_ADMIN_URL = envariant('ORY_KRATOS_ADMIN_URL');

builder.queryType();

const profileSchema = Z.object({
  id: Z.string().uuid(),
  traits: Z.object({
    email: Z.string().email(),
    fullName: Z.string(),
  }),
  verifiable_addresses: Z.array(
    Z.object({
      id: Z.string().uuid(),
      value: Z.string().email(),
      verified: Z.boolean(),
    }),
  ),
  metadata_public: Z.object({ role: Z.enum(['user', 'admin'] as const) }),
}).transform((o) => camelcaseKeys(o));

builder.prismaObject('AppUser', {
  fields: (t) => ({
    id: t.exposeID('id'),
    profile: t.field({
      type: builder.simpleObject('AppUserProfile', {
        fields: (pt) => ({
          id: pt.string(),
          role: pt.field({
            type: builder.enumType('AppUserRole', {
              values: ['admin', 'user'] as const,
            }),
          }),
          verifiableAddresses: pt.field({
            type: [
              builder.simpleObject('AppUserVerifiableAddress', {
                fields: (vat) => ({
                  id: vat.id(),
                  value: vat.string(),
                  verified: vat.boolean(),
                }),
              }),
            ],
          }),
        }),
      }),
      resolve: async ({ id }) => {
        const res = await fetch(`${ORY_KRATOS_ADMIN_URL}/identities/${id}`);
        const json = profileSchema.parse(await res.json());
        return {
          id,
          role: json.metadataPublic.role,
          verifiableAddresses: json.verifiableAddresses,
        };
      },
    }),
  }),
});

builder.queryFields((t) => ({
  usersConnection: t.prismaConnection({
    type: 'AppUser',
    cursor: 'id',
    maxSize: 50,
    defaultSize: 50,
    resolve: (query, _parent, _args, context, _info) =>
      context.prisma.appUser.findMany(query),
  }),
}));
