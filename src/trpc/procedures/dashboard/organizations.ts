import { OrganizationType } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import {
  addOrganizationMemberSchema,
  organizationQuerySchema,
  removeOrganizationMemberSchema,
  updateOrganizationSchema,
  userSearchOrganizationSchema,
} from '@/schemas/dashboard';
import db from '@/util/db';
import logger from '@/util/logger';
import { authProcedure, router } from '../../trpc';

const moduleLogger = logger.child({
  module: 'trpc/procedures/dashboard/organizations',
});

const organizationProcedure = authProcedure
  .input(organizationQuerySchema)
  .use(async ({ ctx, input, next }) => {
    const membership = await db.organizationMembership.findFirst({
      where: {
        appUserId: ctx.session.appUserId,
        organizationId: input.orgId,
      },
    });

    if (!membership) {
      moduleLogger.warn('No membership found for organization procedure', {
        ...input,
        appUserId: ctx.session.appUserId,
      });

      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }

    return next({ ctx: { ...ctx, membership } });
  });

const organizationAdminProcedure = organizationProcedure.use(
  async ({ ctx, next }) => {
    if (!ctx.membership.isAdmin) {
      moduleLogger.warn('User is not admin of organization', {
        appUserId: ctx.session.appUserId,
      });

      throw new TRPCError({ code: 'FORBIDDEN' });
    }

    return next();
  },
);

export const organizationRouter = router({
  getOrganizations: authProcedure.query(async ({ ctx }) => {
    moduleLogger.info('Fetching organizations for user', {
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
        type: OrganizationType.MINISTRY,
        memberships: {
          some: {
            appUserId: ctx.session.appUserId,
          },
        },
      },
    });
  }),

  getOrganizationDetails: organizationProcedure.query(
    async ({ ctx, input }) => {
      moduleLogger.info('Fetching organization details', {
        ...input,
        appUserId: ctx.session.appUserId,
      });

      const organization = await db.organization.findFirst({
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
          _count: {
            select: {
              memberships: true,
            },
          },
        },
        where: {
          id: input.orgId,
          type: 'MINISTRY',
        },
      });

      if (!organization) {
        moduleLogger.warn('Organization not found', {
          ...input,
          appUserId: ctx.session.appUserId,
        });

        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      return {
        ...organization,
        userMembership: ctx.membership,
      };
    },
  ),

  getOrganizationMembers: organizationProcedure.query(
    async ({ ctx, input }) => {
      const organization = await db.organization.findFirst({
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
          id: input.orgId,
          type: OrganizationType.MINISTRY,
        },
      });

      if (!organization) {
        moduleLogger.warn('Organization not found for members', {
          ...input,
        });

        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      return { ...organization, userMembership: ctx.membership };
    },
  ),

  searchUsers: organizationAdminProcedure
    .input(userSearchOrganizationSchema)
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
                organizationId: input.orgId,
              },
            },
          },
        },
        take: 10,
      });

      return users;
    }),

  addOrganizationMember: organizationAdminProcedure
    .input(addOrganizationMemberSchema)
    .mutation(async ({ input }) => {
      await db.organizationMembership.create({
        data: {
          organizationId: input.orgId,
          appUserId: input.userId,
          isAdmin: input.isAdmin,
          canEdit: input.canEdit,
        },
      });

      return { success: true };
    }),

  removeOrganizationMember: organizationAdminProcedure
    .input(removeOrganizationMemberSchema)
    .mutation(async ({ ctx, input }) => {
      // Don't allow removing the last admin
      const adminCount = await db.organizationMembership.count({
        where: {
          organizationId: input.orgId,
          isAdmin: true,
        },
      });

      const membershipToDelete = await db.organizationMembership.findUnique({
        where: {
          organizationId_appUserId: {
            organizationId: input.orgId,
            appUserId: input.appUserId,
          },
        },
        select: { isAdmin: true, appUserId: true },
      });

      if (membershipToDelete?.isAdmin && adminCount <= 1) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot remove the last admin from the organization',
        });
      }

      // Don't allow removing yourself
      if (membershipToDelete?.appUserId === ctx.session.appUser.id) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'You cannot remove yourself from the organization',
        });
      }

      await db.organizationMembership.delete({
        where: {
          organizationId_appUserId: {
            organizationId: input.orgId,
            appUserId: input.appUserId,
          },
        },
      });

      return { success: true };
    }),

  getOrganizationForEdit: organizationAdminProcedure.query(
    async ({ ctx, input }) => {
      moduleLogger.info('Fetching organization for edit', {
        ...input,
        appUserId: ctx.session.appUserId,
      });

      const organization = await db.organization.findFirst({
        select: {
          id: true,
          name: true,
          description: true,
          websiteUrl: true,
          primaryEmail: true,
          primaryPhoneNumber: true,
        },
        where: {
          id: input.orgId,
          type: 'MINISTRY',
        },
      });

      if (!organization) {
        moduleLogger.warn('Organization not found for edit', {
          ...input,
          appUserId: ctx.session.appUserId,
        });

        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      return organization;
    },
  ),

  updateOrganization: organizationAdminProcedure
    .input(updateOrganizationSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info('Updating organization', {
        orgId: input.orgId,
        appUserId: ctx.session.appUserId,
      });

      try {
        await db.organization.update({
          where: {
            id: input.orgId,
          },
          data: {
            name: input.name,
            description: input.description || null,
            websiteUrl: input.websiteUrl || null,
            primaryEmail: input.primaryEmail || null,
            primaryPhoneNumber: input.primaryPhoneNumber || null,
          },
        });

        moduleLogger.info('Organization updated successfully', {
          orgId: input.orgId,
          appUserId: ctx.session.appUserId,
        });

        return { error: false };
      } catch (e) {
        moduleLogger.error('Organization update failed', {
          orgId: input.orgId,
          appUserId: ctx.session.appUserId,
          error: e instanceof Error ? e.message : String(e),
        });
        return { error: 'Error updating organization, please try again!' };
      }
    }),
});
