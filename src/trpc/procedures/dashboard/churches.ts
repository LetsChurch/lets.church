import { OrganizationType } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import {
  addChurchMemberSchema,
  addLeaderSchema,
  channelSearchChurchSchema,
  churchQuerySchema,
  linkChannelSchema,
  removeChurchMemberSchema,
  removeLeaderSchema,
  unlinkChannelSchema,
  updateLeaderSchema,
  userSearchChurchSchema,
} from '@/schemas/dashboard';
import db from '@/util/db';
import logger from '@/util/logger';
import { authProcedure, router } from '../../trpc';

const moduleLogger = logger.child({
  module: 'trpc/procedures/dashboard/churches',
});

const churchProcedure = authProcedure
  .input(churchQuerySchema)
  .use(async ({ ctx, input, next }) => {
    const membership = await db.organizationMembership.findFirst({
      where: {
        appUserId: ctx.session.appUserId,
        organizationId: input.churchId,
      },
    });

    if (!membership) {
      moduleLogger.warn('No membership found for church procedure', {
        ...input,
        appUserId: ctx.session.appUserId,
      });

      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }

    return next({ ctx: { ...ctx, membership } });
  });

const churchAdminProcedure = churchProcedure.use(async ({ ctx, next }) => {
  if (!ctx.membership.isAdmin) {
    moduleLogger.warn('User is not admin of church', {
      appUserId: ctx.session.appUserId,
    });

    throw new TRPCError({ code: 'FORBIDDEN' });
  }

  return next();
});

export const churchRouter = router({
  getChurches: authProcedure.query(async ({ ctx }) => {
    moduleLogger.info('Fetching churches for user', {
      appUserId: ctx.session.appUserId,
    });

    return db.organization.findMany({
      select: {
        id: true,
        name: true,
        type: true,
        description: true,
        memberships: {
          select: {
            isAdmin: true,
            canEdit: true,
          },
          where: {
            appUserId: ctx.session.appUserId,
          },
        },
      },
      where: {
        type: OrganizationType.CHURCH,
        memberships: {
          some: {
            appUserId: ctx.session.appUserId,
          },
        },
      },
    });
  }),

  getChurchDetails: churchProcedure.query(async ({ ctx, input }) => {
    moduleLogger.info('Fetching church details', {
      ...input,
      appUserId: ctx.session.appUserId,
    });

    const church = await db.organization.findFirst({
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        avatarPath: true,
        primaryEmail: true,
        primaryPhoneNumber: true,
        websiteUrl: true,
        createdAt: true,
        updatedAt: true,
        memberships: {
          select: {
            organizationId: true,
            appUserId: true,
            isAdmin: true,
            canEdit: true,
            createdAt: true,
            appUser: {
              select: {
                id: true,
                username: true,
                fullName: true,
                avatarPath: true,
                emails: {
                  select: {
                    email: true,
                    verifiedAt: true,
                  },
                },
              },
            },
          },
          orderBy: [{ isAdmin: 'desc' }, { createdAt: 'asc' }],
        },
        channelAssociations: {
          select: {
            channel: {
              select: {
                id: true,
                name: true,
                visibility: true,
                createdAt: true,
              },
            },
            officialChannel: true,
          },
        },
        leaders: {
          select: {
            id: true,
            type: true,
            name: true,
            email: true,
            phoneNumber: true,
          },
        },
        addresses: {
          select: {
            id: true,
            type: true,
            name: true,
            streetAddress: true,
            locality: true,
            region: true,
            postalCode: true,
            country: true,
          },
        },
        _count: {
          select: {
            memberships: true,
            channelAssociations: true,
            leaders: true,
          },
        },
      },
      where: {
        id: input.churchId,
        type: 'CHURCH',
      },
    });

    if (!church) {
      moduleLogger.warn('Church not found', {
        ...input,
        appUserId: ctx.session.appUserId,
      });

      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    return {
      ...church,
      userMembership: ctx.membership,
    };
  }),

  getChurchMembers: churchProcedure.query(async ({ ctx, input }) => {
    const church = await db.organization.findFirst({
      select: {
        id: true,
        name: true,
        slug: true,
        memberships: {
          select: {
            organizationId: true,
            appUserId: true,
            isAdmin: true,
            canEdit: true,
            createdAt: true,
            appUser: {
              select: {
                id: true,
                username: true,
                fullName: true,
                avatarPath: true,
              },
            },
          },
          orderBy: [{ isAdmin: 'desc' }, { createdAt: 'asc' }],
        },
      },
      where: {
        id: input.churchId,
        type: OrganizationType.CHURCH,
      },
    });

    if (!church) {
      moduleLogger.warn('Church not found for members', {
        ...input,
      });

      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    return { ...church, userMembership: ctx.membership };
  }),

  searchUsers: churchAdminProcedure
    .input(userSearchChurchSchema)
    .query(async ({ input }) => {
      const users = await db.appUser.findMany({
        select: {
          id: true,
          username: true,
          fullName: true,
          avatarPath: true,
        },
        where: {
          username: {
            contains: input.query,
            mode: 'insensitive',
          },
          NOT: {
            organizationMemberships: {
              some: {
                organizationId: input.churchId,
              },
            },
          },
        },
        take: 10,
      });

      return users;
    }),

  addChurchMember: churchAdminProcedure
    .input(addChurchMemberSchema)
    .mutation(async ({ input }) => {
      await db.organizationMembership.create({
        data: {
          organizationId: input.churchId,
          appUserId: input.userId,
          isAdmin: input.isAdmin,
          canEdit: input.canEdit,
        },
      });

      return { success: true };
    }),

  removeChurchMember: churchAdminProcedure
    .input(removeChurchMemberSchema)
    .mutation(async ({ ctx, input }) => {
      // Don't allow removing the last admin
      const adminCount = await db.organizationMembership.count({
        where: {
          organizationId: input.churchId,
          isAdmin: true,
        },
      });

      const membershipToDelete = await db.organizationMembership.findUnique({
        where: {
          organizationId_appUserId: {
            organizationId: input.churchId,
            appUserId: input.appUserId,
          },
        },
        select: { isAdmin: true, appUserId: true },
      });

      if (membershipToDelete?.isAdmin && adminCount <= 1) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot remove the last admin from the church',
        });
      }

      // Don't allow removing yourself
      if (membershipToDelete?.appUserId === ctx.session.appUser.id) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'You cannot remove yourself from the church',
        });
      }

      await db.organizationMembership.delete({
        where: {
          organizationId_appUserId: {
            organizationId: input.churchId,
            appUserId: input.appUserId,
          },
        },
      });

      return { success: true };
    }),

  searchChannels: churchAdminProcedure
    .input(channelSearchChurchSchema)
    .query(async ({ input }) => {
      const channels = await db.channel.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          visibility: true,
          description: true,
        },
        where: {
          name: {
            contains: input.query,
            mode: 'insensitive',
          },
          NOT: {
            organizationAssociations: {
              some: {
                organizationId: input.churchId,
              },
            },
          },
        },
        take: 10,
      });

      return channels;
    }),

  linkChannel: churchAdminProcedure
    .input(linkChannelSchema)
    .mutation(async ({ input }) => {
      await db.organizationChannelAssociation.create({
        data: {
          organizationId: input.churchId,
          channelId: input.channelId,
          officialChannel: input.officialChannel,
        },
      });

      return { success: true };
    }),

  unlinkChannel: churchAdminProcedure
    .input(unlinkChannelSchema)
    .mutation(async ({ input }) => {
      await db.organizationChannelAssociation.delete({
        where: {
          organizationId_channelId: {
            organizationId: input.churchId,
            channelId: input.channelId,
          },
        },
      });

      return { success: true };
    }),

  addLeader: churchAdminProcedure
    .input(addLeaderSchema)
    .mutation(async ({ input }) => {
      await db.organizationLeader.create({
        data: {
          organizationId: input.churchId,
          type: input.type,
          name: input.name,
          email: input.email || null,
          phoneNumber: input.phoneNumber || null,
        },
      });

      return { success: true };
    }),

  updateLeader: churchAdminProcedure
    .input(updateLeaderSchema)
    .mutation(async ({ input }) => {
      await db.organizationLeader.update({
        where: {
          id: input.leaderId,
        },
        data: {
          type: input.type,
          name: input.name,
          email: input.email || null,
          phoneNumber: input.phoneNumber || null,
        },
      });

      return { success: true };
    }),

  removeLeader: churchAdminProcedure
    .input(removeLeaderSchema)
    .mutation(async ({ input }) => {
      await db.organizationLeader.delete({
        where: {
          id: input.leaderId,
        },
      });

      return { success: true };
    }),
});
