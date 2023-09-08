import type { Channel as PrismaChannel } from '@prisma/client';
import type { GraphQLResolveInfo } from 'graphql';
import slugify from '@sindresorhus/slugify';
import invariant from 'tiny-invariant';
import { parseResolveInfo } from 'graphql-parse-resolve-info';
import { indexDocument } from '../../temporal';
import type { Context } from '../../util/context';
import prisma from '../../util/prisma';
import builder from '../builder';
import { getPublicImageUrl } from '../../util/url';
import { getS3ProtocolUri } from '../../util/s3';
import { UploadOrderPropertyEnum } from './upload';

const orderEnum = builder.enumType('Order', {
  values: ['asc', 'desc'] as const,
});

async function channelAdminAuthScope(
  appChannel: Pick<PrismaChannel, 'id'>,
  context: Context,
  info: GraphQLResolveInfo,
) {
  const selectingSubscriberEdges =
    'edges' in
    (parseResolveInfo(info)?.fieldsByTypeName['ChannelSubscribersConnection'] ??
      {});

  // If we aren't selecting subscriber edges (e.g., only getting subscriber
  // count), we don't need to check for permissions
  if (!selectingSubscriberEdges) {
    return true;
  }

  const userId = context.session?.appUserId;

  invariant(userId, 'Unauthorized');

  const adminMembership = await prisma.channelMembership.findFirst({
    where: {
      channelId: appChannel.id,
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

const Channel = builder.prismaObject('Channel', {
  select: { id: true },
  fields: (t) => ({
    id: t.expose('id', { type: 'ShortUuid' }),
    name: t.exposeString('name'),
    avatarUrl: t.field({
      type: 'String',
      nullable: true,
      select: { avatarPath: true },
      resolve: ({ avatarPath }) => {
        if (!avatarPath) {
          return null;
        }

        return getPublicImageUrl(getS3ProtocolUri('PUBLIC', avatarPath), {
          resize: { width: 96, height: 96 },
        });
      },
    }),
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
          required: true,
        }),
        orderBy: t.arg({
          type: UploadOrderPropertyEnum,
          defaultValue: 'createdAt',
          required: true,
        }),
        includeUnlisted: t.arg({ type: 'Boolean', defaultValue: false }),
      },
      authScopes: ({ id }, { includeUnlisted }, context, info) => {
        if (includeUnlisted) {
          channelAdminAuthScope({ id }, context, info);
        }

        return true;
      },
      query: ({ orderBy, order, includeUnlisted }) => ({
        where: includeUnlisted
          ? {}
          : {
              visibility: 'PUBLIC',
              transcodingFinishedAt: { not: null },
              transcribingFinishedAt: { not: null },
            },
        orderBy: [{ [orderBy]: order }, { id: 'asc' }],
      }),
    }),
    subscribersConnection: t.relatedConnection('subscribers', {
      cursor: 'appUserId_channelId',
      totalCount: true,
      authScopes: ({ id }, _args, context, info) =>
        channelAdminAuthScope({ id }, context, info),
    }),
    userIsSubscribed: t.boolean({
      resolve: async ({ id: channelId }, _args, context) => {
        const userId = context.session?.appUserId;

        if (!userId) {
          return false;
        }

        return (
          ((
            await prisma.channel
              .findUnique({ where: { id: channelId } })
              .subscribers({ where: { appUserId: userId } })
          )?.length ?? 0) > 0
        );
      },
    }),
    defaultThumbnailUrl: t.field({
      type: 'String',
      nullable: true,
      select: { defaultThumbnailPath: true },
      resolve: ({ defaultThumbnailPath }) => {
        if (!defaultThumbnailPath) {
          return null;
        }

        return getPublicImageUrl(
          getS3ProtocolUri('PUBLIC', defaultThumbnailPath),
        );
      },
    }),
    defaultThumbnailBlurhash: t.exposeString('defaultThumbnailBlurhash', {
      nullable: true,
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

const ChannelSubscription = builder.prismaObject('ChannelSubscription', {
  fields: (t) => ({
    user: t.relation('appUser'),
    channel: t.relation('channel'),
  }),
});

builder.queryFields((t) => ({
  channelById: t.prismaField({
    type: Channel,
    args: { id: t.arg({ type: 'ShortUuid', required: true }) },
    resolve: async (query, _root, { id }, _context, _info) => {
      return prisma.channel.findUniqueOrThrow({ ...query, where: { id } });
    },
  }),
  channelBySlug: t.prismaField({
    type: Channel,
    args: { slug: t.arg({ type: 'String', required: true }) },
    resolve: async (query, _root, { slug }, _context, _info) => {
      return prisma.channel.findUniqueOrThrow({ ...query, where: { slug } });
    },
  }),
}));

builder.mutationFields((t) => ({
  createChannel: t.prismaField({
    type: Channel,
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
  updateChannel: t.prismaField({
    type: Channel,
    args: {
      channelId: t.arg({ type: 'ShortUuid', required: true }),
      name: t.arg.string({ required: true }),
    },
    authScopes: (_root, { channelId }, context, info) =>
      channelAdminAuthScope({ id: channelId }, context, info),
    resolve: async (query, _parent, { channelId, name }, _context) => {
      return prisma.channel.update({
        ...query,
        where: { id: channelId },
        data: {
          name,
        },
      });
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
    authScopes: (_root, { channelId }, context, info) =>
      channelAdminAuthScope({ id: channelId }, context, info),
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
  subscribeToChannel: t.prismaField({
    type: ChannelSubscription,
    args: {
      channelId: t.arg({ type: 'ShortUuid', required: true }),
    },
    authScopes: { authenticated: true },
    resolve: (query, _root, { channelId }, context, _info) => {
      const userId = context.session?.appUserId;
      invariant(userId, 'Unauthorized');

      return prisma.channelSubscription.upsert({
        ...query,
        where: {
          appUserId_channelId: {
            channelId,
            appUserId: userId,
          },
        },
        update: {},
        create: {
          channelId,
          appUserId: userId,
        },
      });
    },
  }),
  unsubscribeFromChannel: t.boolean({
    args: {
      channelId: t.arg({ type: 'ShortUuid', required: true }),
    },
    authScopes: { authenticated: true },
    resolve: async (_root, { channelId }, context, _info) => {
      const userId = context.session?.appUserId;
      invariant(userId, 'Unauthorized');

      await prisma.channelSubscription.delete({
        where: {
          appUserId_channelId: {
            appUserId: userId,
            channelId,
          },
        },
      });

      return true;
    },
  }),
}));
