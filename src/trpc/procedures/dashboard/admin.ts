import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import db from '@/util/db';
import logger from '@/util/logger';
import { authProcedure, router } from '../../trpc';

const moduleLogger = logger.child({
  module: 'trpc/procedures/dashboard/admin',
});

const adminProcedure = authProcedure.use(async ({ ctx, next }) => {
  if (ctx.session.appUser.role !== 'ADMIN') {
    moduleLogger.warn('Non-admin user attempted admin action', {
      appUserId: ctx.session.appUserId,
      role: ctx.session.appUser.role,
    });

    throw new TRPCError({ code: 'FORBIDDEN' });
  }

  return next();
});

export const adminRouter = router({
  getPendingApprovals: adminProcedure.query(async () => {
    moduleLogger.info('Fetching pending approvals');

    const [pendingChannels, pendingOrganizations] = await Promise.all([
      db.channel.findMany({
        where: {
          approvedAt: null,
        },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          createdAt: true,
          memberships: {
            select: {
              appUser: {
                select: {
                  id: true,
                  fullName: true,
                  emails: {
                    select: {
                      email: true,
                      verifiedAt: true,
                    },
                    where: {
                      verifiedAt: { not: null },
                    },
                    take: 1,
                  },
                },
              },
            },
            where: {
              isAdmin: true,
            },
            take: 1,
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
      }),
      db.organization.findMany({
        where: {
          approvedAt: null,
        },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          type: true,
          createdAt: true,
          memberships: {
            select: {
              appUser: {
                select: {
                  id: true,
                  fullName: true,
                  emails: {
                    select: {
                      email: true,
                      verifiedAt: true,
                    },
                    where: {
                      verifiedAt: { not: null },
                    },
                    take: 1,
                  },
                },
              },
            },
            where: {
              isAdmin: true,
            },
            take: 1,
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
      }),
    ]);

    return {
      channels: pendingChannels,
      organizations: pendingOrganizations,
    };
  }),

  getPendingChannelApprovals: adminProcedure.query(async () => {
    moduleLogger.info('Fetching pending channel approvals');

    return db.channel.findMany({
      where: {
        approvedAt: null,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        createdAt: true,
        avatarPath: true,
        visibility: true,
        memberships: {
          select: {
            appUser: {
              select: {
                id: true,
                fullName: true,
                emails: {
                  select: {
                    email: true,
                    verifiedAt: true,
                  },
                  where: {
                    verifiedAt: { not: null },
                  },
                  take: 1,
                },
              },
            },
          },
          where: {
            isAdmin: true,
          },
          take: 1,
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }),

  getPendingOrganizationApprovals: adminProcedure.query(async () => {
    moduleLogger.info('Fetching pending organization approvals');

    return db.organization.findMany({
      where: {
        approvedAt: null,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        type: true,
        createdAt: true,
        avatarPath: true,
        memberships: {
          select: {
            appUser: {
              select: {
                id: true,
                fullName: true,
                emails: {
                  select: {
                    email: true,
                    verifiedAt: true,
                  },
                  where: {
                    verifiedAt: { not: null },
                  },
                  take: 1,
                },
              },
            },
          },
          where: {
            isAdmin: true,
          },
          take: 1,
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }),

  approveChannel: adminProcedure
    .input(z.object({ channelId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info('Approving channel', {
        channelId: input.channelId,
        appUserId: ctx.session.appUserId,
      });

      try {
        await db.channel.update({
          where: {
            id: input.channelId,
          },
          data: {
            approvedAt: new Date(),
            approvedById: ctx.session.appUserId,
          },
        });

        moduleLogger.info('Channel approved successfully', {
          channelId: input.channelId,
          appUserId: ctx.session.appUserId,
        });

        return { success: true };
      } catch (error) {
        moduleLogger.error('Failed to approve channel', {
          channelId: input.channelId,
          appUserId: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to approve channel',
        });
      }
    }),

  approveOrganization: adminProcedure
    .input(z.object({ organizationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info('Approving organization', {
        organizationId: input.organizationId,
        appUserId: ctx.session.appUserId,
      });

      try {
        await db.organization.update({
          where: {
            id: input.organizationId,
          },
          data: {
            approvedAt: new Date(),
            approvedById: ctx.session.appUserId,
          },
        });

        moduleLogger.info('Organization approved successfully', {
          organizationId: input.organizationId,
          appUserId: ctx.session.appUserId,
        });

        return { success: true };
      } catch (error) {
        moduleLogger.error('Failed to approve organization', {
          organizationId: input.organizationId,
          appUserId: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to approve organization',
        });
      }
    }),

  deleteChannel: adminProcedure
    .input(z.object({ channelId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info('Deleting channel', {
        channelId: input.channelId,
        appUserId: ctx.session.appUserId,
      });

      try {
        await db.channel.delete({
          where: {
            id: input.channelId,
          },
        });

        moduleLogger.info('Channel deleted successfully', {
          channelId: input.channelId,
          appUserId: ctx.session.appUserId,
        });

        return { success: true };
      } catch (error) {
        moduleLogger.error('Failed to delete channel', {
          channelId: input.channelId,
          appUserId: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete channel',
        });
      }
    }),

  deleteOrganization: adminProcedure
    .input(z.object({ organizationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info('Deleting organization', {
        organizationId: input.organizationId,
        appUserId: ctx.session.appUserId,
      });

      try {
        await db.organization.delete({
          where: {
            id: input.organizationId,
          },
        });

        moduleLogger.info('Organization deleted successfully', {
          organizationId: input.organizationId,
          appUserId: ctx.session.appUserId,
        });

        return { success: true };
      } catch (error) {
        moduleLogger.error('Failed to delete organization', {
          organizationId: input.organizationId,
          appUserId: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete organization',
        });
      }
    }),

  getOrganizationTags: adminProcedure.query(async () => {
    moduleLogger.info('Fetching organization tags');

    return db.organizationTag.findMany({
      select: {
        slug: true,
        label: true,
        description: true,
        category: true,
        color: true,
      },
      orderBy: [{ category: 'asc' }, { label: 'asc' }],
    });
  }),

  upsertOrganizationTag: adminProcedure
    .input(
      z.object({
        slug: z.string().min(1),
        label: z.string().min(1),
        description: z.string().optional(),
        category: z.enum([
          'DENOMINATION',
          'DOCTRINE',
          'ESCHATOLOGY',
          'CONFESSION',
          'WORSHIP',
          'GOVERNMENT',
          'OTHER',
        ]),
        color: z.enum([
          'GRAY',
          'RED',
          'YELLOW',
          'GREEN',
          'BLUE',
          'INDIGO',
          'PURPLE',
          'PINK',
        ]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info('Upserting organization tag', {
        slug: input.slug,
        appUserId: ctx.session.appUserId,
      });

      try {
        const tag = await db.organizationTag.upsert({
          where: { slug: input.slug },
          create: input,
          update: {
            label: input.label,
            description: input.description,
            category: input.category,
            color: input.color,
          },
        });

        moduleLogger.info('Organization tag upserted successfully', {
          tagSlug: tag.slug,
          appUserId: ctx.session.appUserId,
        });

        return tag;
      } catch (error) {
        moduleLogger.error('Failed to upsert organization tag', {
          slug: input.slug,
          appUserId: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to upsert organization tag',
        });
      }
    }),

  deleteOrganizationTag: adminProcedure
    .input(z.object({ slug: z.string() }))
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info('Deleting organization tag', {
        tagSlug: input.slug,
        appUserId: ctx.session.appUserId,
      });

      try {
        await db.organizationTag.delete({
          where: { slug: input.slug },
        });

        moduleLogger.info('Organization tag deleted successfully', {
          tagSlug: input.slug,
          appUserId: ctx.session.appUserId,
        });

        return { success: true };
      } catch (error) {
        moduleLogger.error('Failed to delete organization tag', {
          tagSlug: input.slug,
          appUserId: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete organization tag',
        });
      }
    }),
});
