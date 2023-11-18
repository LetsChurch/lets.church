import slugify from '@sindresorhus/slugify';
import invariant from 'tiny-invariant';
import {
  OrganizationType,
  Organization as PrismaOrganization,
} from '@prisma/client';
import { indexDocument } from '../../temporal';
import prisma from '../../util/prisma';
import builder from '../builder';
import { Context } from '../../util/context';

async function organizationAdminAuthScope(
  appOrganization: Pick<PrismaOrganization, 'id'>,
  context: Context,
) {
  const userId = context.session?.appUserId;

  invariant(userId, 'Unauthorized');

  const adminMembership = await prisma.organizationMembership.findFirst({
    where: {
      organizationId: appOrganization.id,
      appUserId: userId,
      isAdmin: true,
    },
  });

  if (adminMembership) {
    return true;
  }

  return {
    admin: true,
  };
}

const OrganizationTypeEnum = builder.enumType('OrganizationType', {
  values: Object.keys(OrganizationType),
});

const Organization = builder.prismaObject('Organization', {
  select: { id: true },
  fields: (t) => ({
    id: t.expose('id', { type: 'ShortUuid' }),
    name: t.exposeString('name'),
    slug: t.exposeString('slug'),
    type: t.expose('type', { type: OrganizationTypeEnum }),
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

builder.queryFields((t) => ({
  organizationById: t.prismaField({
    type: 'Organization',
    args: { id: t.arg({ type: 'ShortUuid', required: true }) },
    resolve: async (query, _root, { id }, _context, _info) => {
      return prisma.organization.findUniqueOrThrow({ ...query, where: { id } });
    },
  }),
  organizationsConnection: t.prismaConnection({
    type: 'Organization',
    cursor: 'id',
    resolve: (query, _root, _args, _context, _info) => {
      return prisma.organization.findMany(query);
    },
  }),
}));

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
      const userId = context.session?.appUserId;
      invariant(userId);

      const res = await prisma.organization.create({
        ...query,
        data: {
          ...args,
          slug: args.slug || slugify(args.name),
          memberships: {
            create: {
              isAdmin: true,
              appUser: {
                connect: {
                  id: userId,
                },
              },
            },
          },
        },
      });

      indexDocument('organization', res.id);

      return res;
    },
  }),
  upsertOrganization: t.prismaField({
    type: Organization,
    args: {
      organizationId: t.arg({ type: 'ShortUuid', required: false }),
      name: t.arg.string({ required: false }),
      slug: t.arg.string({ required: false }),
      description: t.arg.string({ required: false }),
    },
    authScopes: (_root, { organizationId }, context, _info) =>
      organizationId
        ? organizationAdminAuthScope({ id: organizationId }, context)
        : { admin: true },
    resolve: async (
      query,
      _parent,
      { organizationId, name, slug, description },
      _context,
    ) => {
      if (organizationId) {
        return prisma.organization.update({
          ...query,
          where: { id: organizationId },
          data: {
            ...(typeof name === 'string' ? { name } : {}),
            ...(typeof slug === 'string' ? { slug } : {}),
            ...(typeof description === 'string' ? { description } : {}),
          },
        });
      }

      invariant(name, 'Must provide name');
      invariant(slug, 'Must provide description');

      return prisma.organization.create({
        data: {
          name,
          slug,
          ...(typeof description === 'string' ? { description } : {}),
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
      const userId = context.session?.appUserId;

      invariant(userId, 'Unauthorized');

      const adminMembership = await prisma.organizationMembership.findFirst({
        where: {
          organizationId,
          appUserId: userId,
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
      _context,
      _info,
    ) => {
      return prisma.$transaction(async (tx) => {
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
