import slugify from '@sindresorhus/slugify';
import invariant from 'tiny-invariant';
import { indexDocument } from '../../temporal';
import prisma from '../../util/prisma';
import builder from '../builder';

const orderEnum = builder.enumType('Order', {
  values: ['asc', 'desc'] as const,
});

builder.prismaObject('Channel', {
  select: { id: true },
  fields: (t) => ({
    id: t.expose('id', { type: 'ShortUuid' }),
    name: t.exposeString('name'),
    slug: t.exposeString('slug'),
    description: t.exposeString('description', { nullable: true }),
    membershipsConnection: t.relatedConnection('memberships', {
      cursor: 'channelId_appUserId',
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
    uploadsConnection: t.relatedConnection('uploadRecords', {
      cursor: 'id',
      totalCount: true,
      args: {
        order: t.arg({
          type: orderEnum,
          defaultValue: 'desc',
        }),
      },
      query: ({ order }) => ({
        orderBy: [{ createdAt: order ?? 'desc' }, { id: 'asc' }],
      }),
    }),
  }),
});

const ChannelMembership = builder.prismaObject('ChannelMembership', {
  fields: (t) => ({
    user: t.relation('appUser'),
    channel: t.relation('channel'),
    isAdmin: t.exposeBoolean('isAdmin'),
    canEdit: t.exposeBoolean('canEdit'),
    canUpload: t.exposeBoolean('canUpload'),
  }),
});

builder.queryFields((t) => ({
  channelById: t.prismaField({
    type: 'Channel',
    args: { id: t.arg({ type: 'ShortUuid', required: true }) },
    resolve: async (query, _root, { id }, _context, _info) => {
      return prisma.channel.findUniqueOrThrow({ ...query, where: { id } });
    },
  }),
}));

builder.mutationFields((t) => ({
  createChannel: t.prismaField({
    type: 'Channel',
    args: {
      name: t.arg.string({ required: true }),
      slug: t.arg.string(),
    },
    authScopes: {
      authenticated: true,
    },
    resolve: async (query, _root, args, context, _info) => {
      const userId = (await context.session)?.appUserId;
      invariant(userId);

      const res = await prisma.channel.create({
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

      indexDocument('channel', res.id);

      return res;
    },
  }),
  upsertChannelMembership: t.prismaField({
    type: ChannelMembership,
    args: {
      channelId: t.arg({ type: 'ShortUuid', required: true }),
      userId: t.arg({ type: 'ShortUuid', required: true }),
      isAdmin: t.arg.boolean({ required: true }),
      canEdit: t.arg.boolean({ required: true }),
      canUpload: t.arg.boolean({ required: true }),
    },
    authScopes: async (_root, { channelId }, context) => {
      const userId = (await context.session)?.appUserId;

      invariant(userId, 'Unauthorized');

      const adminMembership = await prisma.channelMembership.findFirst({
        where: {
          channelId,
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
      { channelId, userId, isAdmin, canEdit, canUpload },
      _context,
      _info,
    ) => {
      return prisma.$transaction(async (tx) => {
        const res = await tx.channelMembership.upsert({
          ...query,
          where: {
            channelId_appUserId: {
              channelId,
              appUserId: userId,
            },
          },
          update: {
            isAdmin,
            canEdit,
            canUpload,
          },
          create: {
            channelId,
            appUserId: userId,
            isAdmin,
            canEdit,
            canUpload,
          },
        });

        const adminCount = await tx.channelMembership.count({
          where: {
            channelId,
            isAdmin: true,
          },
        });

        if (adminCount < 1) {
          throw new Error(`Channel ${channelId} must have at least one admin!`);
        }

        return res;
      });
    },
  }),
}));
