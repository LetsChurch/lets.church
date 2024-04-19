import slugify from '@sindresorhus/slugify';
import invariant from 'tiny-invariant';
import {
  AddressType,
  OrganizationTagCategory,
  OrganizationLeaderType,
  OrganizationType,
  Organization as PrismaOrganization,
  TagColor,
} from '@prisma/client';
import { parsePhoneNumber } from 'libphonenumber-js';
import { z } from 'zod';
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

const TagColorEnum = builder.enumType(TagColor, { name: 'TagColor' });

const OrganizationTagCategoryEnum = builder.enumType(OrganizationTagCategory, {
  name: 'OrganizationTagCategory',
});

builder.prismaObject('OrganizationTag', {
  fields: (t) => ({
    slug: t.exposeString('slug'),
    label: t.exposeString('label'),
    description: t.exposeString('description', { nullable: true }),
    moreInfoLink: t.exposeString('moreInfoLink', { nullable: true }),
    category: t.expose('category', { type: OrganizationTagCategoryEnum }),
    color: t.expose('color', { type: TagColorEnum }),
    suggests: t.relatedConnection('suggests', {
      cursor: 'parentSlug_suggestedSlug',
    }),
    organizations: t.relatedConnection('organizations', {
      cursor: 'organizationId_tagSlug',
    }),
  }),
});

builder.prismaObject('OrganizationTagSuggestion', {
  fields: (t) => ({
    parent: t.relation('parent'),
    suggested: t.relation('suggested'),
  }),
});

const OrganizationTagInstance = builder.prismaObject(
  'OrganizationTagInstance',
  {
    fields: (t) => ({
      organization: t.relation('organization'),
      tag: t.relation('tag'),
    }),
  },
);

const AddressTypeEnum = builder.enumType(AddressType, {
  name: 'OrganizationAddressType',
});

const AddressInput = builder.inputType('AddressInput', {
  fields: (t) => ({
    type: t.field({ type: AddressTypeEnum, required: true }),
    query: t.string({ required: false }),
    country: t.string({ required: false }),
    streetAddress: t.string({ required: false }),
    locality: t.string({ required: false }),
    region: t.string({ required: false }),
    postalCode: t.string({ required: false }),
  }),
});

const AddressInputSchema = z.object({
  type: z.nativeEnum(AddressType),
  query: z.string().nullable().default(null),
  country: z.string().nullable().default(null),
  streetAddress: z.string().nullable().default(null),
  locality: z.string().nullable().default(null),
  region: z.string().nullable().default(null),
  postalCode: z.string().nullable().default(null),
});

const AddressInputsSchema = z.array(AddressInputSchema);

export const OrganizationTypeEnum = builder.enumType(OrganizationType, {
  name: 'OrganizationType',
});

const OrganizationLeaderTypeEnum = builder.enumType(OrganizationLeaderType, {
  name: 'OrganizationLeaderType',
});

const OrganizationLeaderInput = builder.inputType('OrganizationLeaderInput', {
  fields: (t) => ({
    type: t.field({ type: OrganizationLeaderTypeEnum, required: true }),
    name: t.string({ required: true }),
    phoneNumber: t.string({ required: false }),
    email: t.string({ required: false }),
  }),
});

const OrganizationLeaderInputSchema = z.object({
  type: z.nativeEnum(OrganizationLeaderType),
  name: z.string(),
  phoneNumber: z.string().nullable().default(null),
  email: z.string().nullable().default(null),
});

const OrganizationLeaderInputsSchema = z.array(OrganizationLeaderInputSchema);

const Organization = builder.prismaObject('Organization', {
  select: { id: true },
  fields: (t) => ({
    id: t.expose('id', { type: 'ShortUuid' }),
    name: t.exposeString('name'),
    slug: t.exposeString('slug'),
    type: t.expose('type', { type: OrganizationTypeEnum }),
    description: t.exposeString('description', { nullable: true }),
    tags: t.relatedConnection('tags', {
      type: OrganizationTagInstance,
      cursor: 'organizationId_tagSlug',
    }),
    avatarUrl: t.exposeString('avatarPath', { nullable: true }),
    coverUrl: t.exposeString('coverPath', { nullable: true }),
    primaryPhoneNumber: t.string({
      nullable: true,
      select: { primaryPhoneNumber: true },
      resolve: ({ primaryPhoneNumber }) =>
        primaryPhoneNumber
          ? parsePhoneNumber(primaryPhoneNumber).formatNational()
          : null,
    }),
    primaryPhoneUri: t.string({
      select: { primaryPhoneNumber: true },
      nullable: true,
      resolve: ({ primaryPhoneNumber }) =>
        primaryPhoneNumber
          ? parsePhoneNumber(primaryPhoneNumber).getURI()
          : null,
    }),
    primaryEmail: t.exposeString('primaryEmail', {
      nullable: true,
    }),
    websiteUrl: t.exposeString('websiteUrl', { nullable: true }),
    leaders: t.relatedConnection('leaders', {
      // TODO: orderable
      cursor: 'id',
      args: {
        type: t.arg({ type: OrganizationLeaderTypeEnum, required: false }),
      },
      query: (args) => (args.type ? { where: { type: args.type } } : {}),
    }),
    addresses: t.relatedConnection('addresses', {
      // TODO: orderable
      cursor: 'id',
      args: { type: t.arg({ type: AddressTypeEnum, required: false }) },
      query: (args) => (args.type ? { where: { type: args.type } } : {}),
    }),
    membershipsConnection: t.relatedConnection('memberships', {
      cursor: 'organizationId_appUserId',
    }),
    officialChannelsConnection: t.relatedConnection('channelAssociations', {
      cursor: 'organizationId_channelId',
      query: { where: { officialChannel: true } },
    }),
    endorsedChannelsConnection: t.relatedConnection('channelAssociations', {
      cursor: 'organizationId_channelId',
      query: { where: { officialChannel: false } },
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

builder.prismaObject('OrganizationAddress', {
  fields: (t) => ({
    type: t.expose('type', { type: AddressTypeEnum }),
    name: t.exposeString('name', { nullable: true }),
    country: t.exposeString('country', { nullable: true }),
    locality: t.exposeString('locality', { nullable: true }),
    region: t.exposeString('region', { nullable: true }),
    postOfficeBoxNumber: t.exposeString('postOfficeBoxNumber', {
      nullable: true,
    }),
    postalCode: t.exposeString('postalCode', { nullable: true }),
    streetAddress: t.exposeString('streetAddress', { nullable: true }),
    latitude: t.exposeFloat('latitude', { nullable: true }),
    longitude: t.exposeFloat('longitude', { nullable: true }),
  }),
});

builder.prismaObject('OrganizationLeader', {
  fields: (t) => ({
    type: t.expose('type', { type: OrganizationLeaderTypeEnum }),
    name: t.exposeString('name', { nullable: true }),
    phoneNumber: t.exposeString('phoneNumber', { nullable: true }),
    email: t.exposeString('email', { nullable: true }),
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
  organizationBySlug: t.prismaField({
    type: 'Organization',
    args: { slug: t.arg({ type: 'String', required: true }) },
    resolve: async (query, _root, { slug }, _context, _info) => {
      return prisma.organization.findUniqueOrThrow({
        ...query,
        where: { slug },
      });
    },
  }),
  organizationsConnection: t.prismaConnection({
    type: 'Organization',
    cursor: 'id',
    resolve: (query, _root, _args, _context, _info) => {
      return prisma.organization.findMany(query);
    },
  }),
  organizationTagsConnection: t.prismaConnection({
    type: 'OrganizationTag',
    cursor: 'slug',
    resolve: (query, _root, _args, _context, _info) => {
      return prisma.organizationTag.findMany(query);
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
      type: t.arg({ type: OrganizationTypeEnum, required: false }),
      name: t.arg.string({ required: false }),
      slug: t.arg.string({ required: false }),
      description: t.arg.string({ required: false }),
      primaryEmail: t.arg.string({ required: false }),
      primaryPhoneNumber: t.arg.string({ required: false }),
      addresses: t.arg({
        type: [AddressInput],
        required: false,
      }),
      leaders: t.arg({
        type: [OrganizationLeaderInput],
        required: false,
      }),
    },
    authScopes: (_root, { organizationId }, context, _info) =>
      organizationId
        ? organizationAdminAuthScope({ id: organizationId }, context)
        : { admin: true },
    resolve: async (
      query,
      _parent,
      {
        organizationId,
        type,
        name,
        slug,
        description,
        primaryEmail,
        primaryPhoneNumber,
        addresses,
        leaders,
      },
      { session },
    ) => {
      invariant(session, 'Unauthorized');

      return prisma.$transaction(async (tx) => {
        if (organizationId) {
          await tx.organization.update({
            ...query,
            where: { id: organizationId },
            data: {
              ...(typeof name === 'string' ? { name } : {}),
              ...(typeof slug === 'string' ? { slug } : {}),
              ...(typeof description === 'string' ? { description } : {}),
              ...(typeof primaryEmail === 'string' ? { primaryEmail } : {}),
              ...(typeof primaryPhoneNumber === 'string'
                ? { primaryPhoneNumber }
                : {}),
            },
          });

          if (addresses) {
            await tx.organizationAddress.deleteMany({
              where: { organizationId },
            });
            await tx.organizationAddress.createMany({
              data: AddressInputsSchema.parse(addresses).map((a) => ({
                ...a,
                organizationId,
              })),
            });
          }

          if (leaders) {
            await tx.organizationLeader.deleteMany({
              where: { organizationId },
            });
            await tx.organizationLeader.createMany({
              data: OrganizationLeaderInputsSchema.parse(leaders).map((l) => ({
                ...l,
                organizationId,
              })),
            });
          }

          indexDocument('organization', organizationId);

          return tx.organization.findUniqueOrThrow({
            ...query,
            where: { id: organizationId },
          });
        }

        invariant(type, 'Must provide type');
        invariant(name, 'Must provide name');
        invariant(slug, 'Must provide description');

        const res = await tx.organization.create({
          ...query,
          data: {
            type,
            name,
            slug,
            memberships: {
              create: {
                appUserId: session.appUserId,
                isAdmin: true,
              },
            },
            ...(typeof description === 'string' ? { description } : {}),
            ...(typeof primaryEmail === 'string' ? { primaryEmail } : {}),
            ...(typeof primaryPhoneNumber === 'string'
              ? { primaryPhoneNumber }
              : {}),
            ...(addresses
              ? {
                  addresses: {
                    createMany: { data: AddressInputsSchema.parse(addresses) },
                  },
                }
              : {}),
            ...(leaders
              ? {
                  leaders: {
                    createMany: {
                      data: OrganizationLeaderInputsSchema.parse(leaders),
                    },
                  },
                }
              : {}),
          },
        });

        indexDocument('organization', res.id);

        return tx.organization.findUniqueOrThrow({
          ...query,
          where: { id: res.id },
        });
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
