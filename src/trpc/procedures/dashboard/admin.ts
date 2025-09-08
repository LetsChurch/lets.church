import { TRPCError } from '@trpc/server';
import * as argon2 from 'argon2';
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

    const [
      pendingChannels,
      pendingOrganizations,
      userCount,
      processingUploadsCount,
    ] = await Promise.all([
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
      db.appUser.count(),
      db.uploadRecord.count({
        where: {
          OR: [
            { transcodingFinishedAt: null },
            { transcribingFinishedAt: null },
          ],
        },
      }),
    ]);

    return {
      channels: pendingChannels,
      organizations: pendingOrganizations,
      userCount,
      processingUploadsCount,
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

  getUsers: adminProcedure.query(async () => {
    moduleLogger.info('Fetching users');

    return db.appUser.findMany({
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        createdAt: true,
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
      orderBy: {
        createdAt: 'desc',
      },
    });
  }),

  getUserCount: adminProcedure.query(async () => {
    moduleLogger.info('Fetching user count');

    return db.appUser.count();
  }),

  createUser: adminProcedure
    .input(
      z.object({
        username: z.string().min(1),
        password: z.string().min(6),
        fullName: z.string().optional(),
        email: z.string().email(),
        role: z.enum(['USER', 'ADMIN']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info('Creating user', {
        username: input.username,
        email: input.email,
        role: input.role,
        appUserId: ctx.session.appUserId,
      });

      try {
        const hashedPassword = await argon2.hash(input.password);

        const user = await db.appUser.create({
          data: {
            username: input.username,
            password: hashedPassword,
            fullName: input.fullName,
            role: input.role,
            emails: {
              create: {
                email: input.email,
                verifiedAt: new Date(),
              },
            },
          },
          select: {
            id: true,
            username: true,
            fullName: true,
            role: true,
            createdAt: true,
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
        });

        moduleLogger.info('User created successfully', {
          userId: user.id,
          username: user.username,
          appUserId: ctx.session.appUserId,
        });

        return user;
      } catch (error) {
        moduleLogger.error('Failed to create user', {
          username: input.username,
          email: input.email,
          appUserId: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create user',
        });
      }
    }),

  updateUser: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        username: z.string().min(1).optional(),
        fullName: z.string().optional(),
        role: z.enum(['USER', 'ADMIN']).optional(),
        email: z.string().email().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info('Updating user', {
        userId: input.userId,
        appUserId: ctx.session.appUserId,
      });

      try {
        const updateData: {
          username?: string;
          fullName?: string | null;
          role?: 'USER' | 'ADMIN';
        } = {};
        if (input.username) updateData.username = input.username;
        if (input.fullName !== undefined) updateData.fullName = input.fullName;
        if (input.role) updateData.role = input.role;

        const user = await db.appUser.update({
          where: { id: input.userId },
          data: updateData,
          select: {
            id: true,
            username: true,
            fullName: true,
            role: true,
            createdAt: true,
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
        });

        if (input.email) {
          await db.appUserEmail.updateMany({
            where: {
              appUserId: input.userId,
              verifiedAt: { not: null },
            },
            data: {
              email: input.email,
            },
          });
        }

        moduleLogger.info('User updated successfully', {
          userId: input.userId,
          appUserId: ctx.session.appUserId,
        });

        return user;
      } catch (error) {
        moduleLogger.error('Failed to update user', {
          userId: input.userId,
          appUserId: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update user',
        });
      }
    }),

  getProcessingUploads: adminProcedure.query(async () => {
    moduleLogger.info('Fetching processing uploads');

    return db.uploadRecord.findMany({
      select: {
        id: true,
        title: true,
        description: true,
        visibility: true,
        createdAt: true,
        lengthSeconds: true,
        transcodingFinishedAt: true,
        transcribingFinishedAt: true,
        transcodingProgress: true,
        channel: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
      where: {
        OR: [{ transcodingFinishedAt: null }, { transcribingFinishedAt: null }],
      },
      orderBy: { createdAt: 'desc' },
    });
  }),
});
