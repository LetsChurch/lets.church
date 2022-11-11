import slugify from '@sindresorhus/slugify';
import invariant from 'tiny-invariant';
import { indexDocument } from '../../temporal';
import builder from '../builder';

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
    resolve: async (query, _root, { id }, { prisma }, _info) => {
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
      const userId = (await context.identity)?.id;
      invariant(userId);

      const res = await context.prisma.channel.create({
        ...query,
        select: { ...(query.select ?? {}), id: true },
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
      const identity = await context.identity;

      invariant(identity, 'Unauthorized');

      const adminMembership = await context.prisma.channelMembership.findFirst({
        where: {
          channelId,
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
      { channelId, userId, isAdmin, canEdit, canUpload },
      context,
      _info,
    ) => {
      return context.prisma.$transaction(async (tx) => {
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
