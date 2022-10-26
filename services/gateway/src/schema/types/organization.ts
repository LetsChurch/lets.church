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

const OrganizationMembership = builder.prismaObject('OrganizationMembership', {
  fields: (t) => ({
    user: t.relation('appUser'),
    channel: t.relation('organization'),
    isAdmin: t.exposeBoolean('isAdmin'),
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
  upsertOrganizationMembership: t.prismaField({
    type: OrganizationMembership,
    args: {
      organizationId: t.arg({ type: 'ShortUuid', required: true }),
      userId: t.arg({ type: 'ShortUuid', required: true }),
      isAdmin: t.arg.boolean({ required: true }),
      canEdit: t.arg.boolean({ required: true }),
    },
    authScopes: async (_root, { organizationId }, context) => {
      const identity = await context.identity;

      invariant(identity, 'Unauthorized');

      const adminMembership =
        await context.prisma.organizationMembership.findFirst({
          where: {
            organizationId,
            appUserId: identity.id,
            isAdmin: true,
          },
        });

      if (adminMembership) {
        return true;
      }

      return {
        admin: true,
      };
    },
    resolve: async (
      query,
      _root,
      { organizationId, userId, isAdmin, canEdit },
      context,
      _info,
    ) => {
      return context.prisma.$transaction(async (tx) => {
        const res = await tx.organizationMembership.upsert({
          ...query,
          where: {
            organizationId_appUserId: {
              organizationId,
              appUserId: userId,
            },
          },
          update: {
            isAdmin,
            canEdit,
          },
          create: {
            organizationId,
            appUserId: userId,
            isAdmin,
            canEdit,
          },
        });

        const adminCount = await tx.organizationMembership.count({
          where: {
            organizationId,
            isAdmin: true,
          },
        });

        if (adminCount < 1) {
          throw new Error(
            `Organization ${organizationId} must have at least one admin!`,
          );
        }

        return res;
      });
    },
  }),
}));
