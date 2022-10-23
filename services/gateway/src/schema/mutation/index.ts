import invariant from 'tiny-invariant';
import slugify from '@sindresorhus/slugify';
import builder from '../builder';

builder.mutationType();

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
