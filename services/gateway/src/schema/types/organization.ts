import slugify from '@sindresorhus/slugify';
import invariant from 'tiny-invariant';
import builder from '../builder';

builder.prismaObject('Organization', {
  fields: (t) => ({
    id: t.expose('id', { type: 'ShortUuid' }),
    name: t.exposeString('name'),
    slug: t.exposeString('slug'),
    description: t.exposeString('description', { nullable: true }),
    membershipsConnection: t.relatedConnection('memberships', {
      cursor: 'organizationId_appUserId',
    }),
    associationsConnection: t.relatedConnection('associations', {
      cursor: 'organizationId_channelId',
    }),
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

builder.prismaObject('OrganizationChannelAssociation', {
  fields: (t) => ({
    organization: t.relation('organization'),
    channel: t.relation('channel'),
  }),
});

builder.mutationFields((t) => ({
  createOrganization: t.prismaField({
    type: 'Organization',
    args: {
      name: t.arg.string({ required: true }),
      slug: t.arg.string(),
    },
    authScopes: {
      authenticated: true,
    },
    resolve: async (query, _root, args, context, _info) => {
      const userId = (await context.identity)?.id;
      invariant(userId);

      return context.prisma.organization.create({
        ...query,
        data: {
          ...args,
          slug: args.slug || slugify(args.name),
          memberships: {
            create: {
              isAdmin: true,
              appUser: {
                connectOrCreate: {
                  where: {
                    id: userId,
                  },
                  create: {
                    id: userId,
                  },
                },
              },
            },
          },
        },
      });
    },
  }),
}));
