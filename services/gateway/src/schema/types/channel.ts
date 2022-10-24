import slugify from '@sindresorhus/slugify';
import invariant from 'tiny-invariant';
import builder from '../builder';

builder.prismaObject('Channel', {
  fields: (t) => ({
    id: t.expose('id', { type: 'ShortUuid' }),
    name: t.exposeString('name'),
    slug: t.exposeString('slug'),
    description: t.exposeString('description', { nullable: true }),
    memberships: t.relatedConnection('memberships', {
      cursor: 'channelId_appUserId',
    }),
    createdAt: t.field({
      type: 'String',
      select: { createdAt: true },
      resolve: (channel) => channel.createdAt.toISOString(), // TODO: datetime scalar
    }),
    updatedAt: t.field({
      type: 'String',
      select: { updatedAt: true },
      resolve: (channel) => channel.updatedAt.toISOString(), // TODO: datetime scalar
    }),
  }),
});

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

      return context.prisma.channel.create({
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
