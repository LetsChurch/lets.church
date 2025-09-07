import { OrganizationType } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import {
  addOrganizationMemberSchema,
  getAllOrganizationsSchema,
  getOrganizationsByIdsSchema,
  organizationQuerySchema,
  organizationRelationshipSchema,
  removeOrganizationMemberSchema,
  searchOrganizationsSchema,
  updateOrganizationSchema,
  upstreamAssociationActionSchema,
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
  getAllOrganizations: authProcedure
    .input(getAllOrganizationsSchema)
    .query(async ({ input }) => {
      moduleLogger.info('Fetching all organizations', {
        excludeChurchTypes: input.excludeChurchTypes,
      });

      const whereClause = input.excludeChurchTypes
        ? { type: { not: OrganizationType.CHURCH } }
        : {};

      return db.organization.findMany({
        select: {
          id: true,
          name: true,
          type: true,
          approvedAt: true,
        },
        where: whereClause,
        orderBy: [
          { approvedAt: 'desc' }, // Approved first
          { name: 'asc' },
        ],
      });
    }),

  searchOrganizations: authProcedure
    .input(searchOrganizationsSchema)
    .query(async ({ input }) => {
      moduleLogger.info('Searching organizations', {
        query: input.query,
        excludeChurchTypes: input.excludeChurchTypes,
        limit: input.limit,
      });

      const whereClause = {
        name: {
          contains: input.query,
          mode: 'insensitive' as const,
        },
        ...(input.excludeChurchTypes && {
          type: { not: OrganizationType.CHURCH },
        }),
      };

      return db.organization.findMany({
        select: {
          id: true,
          name: true,
          type: true,
          approvedAt: true,
        },
        where: whereClause,
        orderBy: [
          { approvedAt: 'desc' }, // Approved first
          { name: 'asc' },
        ],
        take: input.limit,
      });
    }),

  getOrganizationsByIds: authProcedure
    .input(getOrganizationsByIdsSchema)
    .query(async ({ input }) => {
      moduleLogger.info('Fetching organizations by IDs', {
        organizationCount: input.organizationIds.length,
      });

      if (input.organizationIds.length === 0) {
        return [];
      }

      return db.organization.findMany({
        select: {
          id: true,
          name: true,
          type: true,
          approvedAt: true,
        },
        where: {
          id: {
            in: input.organizationIds,
          },
        },
        orderBy: [
          { approvedAt: 'desc' }, // Approved first
          { name: 'asc' },
        ],
      });
    }),

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
          type: true,
          avatarPath: true,
          primaryEmail: true,
          primaryPhoneNumber: true,
          websiteUrl: true,
          createdAt: true,
          updatedAt: true,
          approvedAt: true,
          approvedById: true,
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
              downstreamOrganizationAssociations: true,
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

      // Get count of unapproved upstream associations
      const unapprovedAssociationsCount =
        await db.organizationOrganizationAssociation.count({
          where: {
            upstreamOrganizationId: input.orgId,
            upstreamApproved: false,
          },
        });

      return {
        ...organization,
        userMembership: ctx.membership,
        unapprovedAssociationsCount,
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

  approveOrganization: authProcedure
    .input(organizationQuerySchema)
    .use(async ({ ctx, next }) => {
      // Only site admins can approve organizations
      if (ctx.session.appUser.role !== 'ADMIN') {
        moduleLogger.warn('Non-admin user attempted to approve organization', {
          appUserId: ctx.session.appUserId,
          role: ctx.session.appUser.role,
        });
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      return next();
    })
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info('Approving organization', {
        orgId: input.orgId,
        appUserId: ctx.session.appUserId,
      });

      try {
        await db.organization.update({
          where: {
            id: input.orgId,
          },
          data: {
            approvedAt: new Date(),
            approvedById: ctx.session.appUserId,
          },
        });

        moduleLogger.info('Organization approved successfully', {
          orgId: input.orgId,
          appUserId: ctx.session.appUserId,
        });

        return { success: true };
      } catch (error) {
        moduleLogger.error('Failed to approve organization', {
          orgId: input.orgId,
          appUserId: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to approve organization',
        });
      }
    }),

  unapproveOrganization: authProcedure
    .input(organizationQuerySchema)
    .use(async ({ ctx, next }) => {
      // Only site admins can unapprove organizations
      if (ctx.session.appUser.role !== 'ADMIN') {
        moduleLogger.warn(
          'Non-admin user attempted to unapprove organization',
          {
            appUserId: ctx.session.appUserId,
            role: ctx.session.appUser.role,
          },
        );
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      return next();
    })
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info('Unapproving organization', {
        orgId: input.orgId,
        appUserId: ctx.session.appUserId,
      });

      try {
        await db.organization.update({
          where: {
            id: input.orgId,
          },
          data: {
            approvedAt: null,
            approvedById: null,
          },
        });

        moduleLogger.info('Organization unapproved successfully', {
          orgId: input.orgId,
          appUserId: ctx.session.appUserId,
        });

        return { success: true };
      } catch (error) {
        moduleLogger.error('Failed to unapprove organization', {
          orgId: input.orgId,
          appUserId: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to unapprove organization',
        });
      }
    }),

  getPendingDownstreamApprovals: organizationProcedure.query(
    async ({ ctx, input }) => {
      moduleLogger.info('Fetching pending downstream approvals', {
        ...input,
        appUserId: ctx.session.appUserId,
      });

      // Get the organization to make sure it's not a church
      const organization = await db.organization.findFirst({
        where: {
          id: input.orgId,
          type: OrganizationType.MINISTRY, // Only ministries can have downstream approvals
        },
        select: {
          id: true,
          name: true,
          type: true,
        },
      });

      if (!organization) {
        moduleLogger.warn('Organization not found or is not a ministry', {
          ...input,
          appUserId: ctx.session.appUserId,
        });
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      // Get all pending downstream relationship approvals
      const pendingApprovals =
        await db.organizationOrganizationAssociation.findMany({
          where: {
            upstreamOrganizationId: input.orgId,
            upstreamApproved: false,
          },
          select: {
            downstreamOrganizationId: true,
            createdAt: true,
            downstreamApproved: true,
            downstreamOrganization: {
              select: {
                id: true,
                name: true,
                type: true,
                slug: true,
                description: true,
                avatarPath: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        });

      return pendingApprovals;
    },
  ),

  approveDownstreamRelationship: organizationAdminProcedure
    .input(organizationRelationshipSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info('Approving downstream relationship', {
        ...input,
        appUserId: ctx.session.appUserId,
      });

      try {
        await db.organizationOrganizationAssociation.update({
          where: {
            upstreamOrganizationId_downstreamOrganizationId: {
              upstreamOrganizationId: input.orgId,
              downstreamOrganizationId: input.downstreamOrganizationId,
            },
          },
          data: {
            upstreamApproved: true,
          },
        });

        moduleLogger.info('Downstream relationship approved successfully', {
          ...input,
          appUserId: ctx.session.appUserId,
        });

        return { success: true };
      } catch (error) {
        moduleLogger.error('Failed to approve downstream relationship', {
          ...input,
          appUserId: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to approve downstream relationship',
        });
      }
    }),

  rejectDownstreamRelationship: organizationAdminProcedure
    .input(organizationRelationshipSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info('Rejecting downstream relationship', {
        ...input,
        appUserId: ctx.session.appUserId,
      });

      try {
        await db.organizationOrganizationAssociation.delete({
          where: {
            upstreamOrganizationId_downstreamOrganizationId: {
              upstreamOrganizationId: input.orgId,
              downstreamOrganizationId: input.downstreamOrganizationId,
            },
          },
        });

        moduleLogger.info('Downstream relationship rejected successfully', {
          ...input,
          appUserId: ctx.session.appUserId,
        });

        return { success: true };
      } catch (error) {
        moduleLogger.error('Failed to reject downstream relationship', {
          ...input,
          appUserId: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to reject downstream relationship',
        });
      }
    }),

  getUpstreamAssociations: organizationProcedure.query(
    async ({ ctx, input }) => {
      moduleLogger.info('Fetching upstream associations', {
        ...input,
        appUserId: ctx.session.appUserId,
      });

      // Get all associations where this organization is upstream
      const upstreamAssociations =
        await db.organizationOrganizationAssociation.findMany({
          where: {
            upstreamOrganizationId: input.orgId,
          },
          select: {
            downstreamOrganizationId: true,
            upstreamApproved: true,
            downstreamApproved: true,
            createdAt: true,
            downstreamOrganization: {
              select: {
                id: true,
                name: true,
                type: true,
                slug: true,
                description: true,
                avatarPath: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        });

      return upstreamAssociations;
    },
  ),

  approveUpstreamAssociation: organizationAdminProcedure
    .input(upstreamAssociationActionSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info('Approving upstream association', {
        ...input,
        appUserId: ctx.session.appUserId,
      });

      try {
        await db.organizationOrganizationAssociation.update({
          where: {
            upstreamOrganizationId_downstreamOrganizationId: {
              upstreamOrganizationId: input.orgId,
              downstreamOrganizationId: input.downstreamOrganizationId,
            },
          },
          data: {
            upstreamApproved: true,
          },
        });

        moduleLogger.info('Upstream association approved successfully', {
          ...input,
          appUserId: ctx.session.appUserId,
        });

        return { success: true };
      } catch (error) {
        moduleLogger.error('Failed to approve upstream association', {
          ...input,
          appUserId: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to approve upstream association',
        });
      }
    }),

  unapproveUpstreamAssociation: organizationAdminProcedure
    .input(upstreamAssociationActionSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info('Unapproving upstream association', {
        ...input,
        appUserId: ctx.session.appUserId,
      });

      try {
        await db.organizationOrganizationAssociation.update({
          where: {
            upstreamOrganizationId_downstreamOrganizationId: {
              upstreamOrganizationId: input.orgId,
              downstreamOrganizationId: input.downstreamOrganizationId,
            },
          },
          data: {
            upstreamApproved: false,
          },
        });

        moduleLogger.info('Upstream association unapproved successfully', {
          ...input,
          appUserId: ctx.session.appUserId,
        });

        return { success: true };
      } catch (error) {
        moduleLogger.error('Failed to unapprove upstream association', {
          ...input,
          appUserId: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to unapprove upstream association',
        });
      }
    }),

  deleteUpstreamAssociation: organizationAdminProcedure
    .input(upstreamAssociationActionSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info('Deleting upstream association', {
        ...input,
        appUserId: ctx.session.appUserId,
      });

      try {
        await db.organizationOrganizationAssociation.delete({
          where: {
            upstreamOrganizationId_downstreamOrganizationId: {
              upstreamOrganizationId: input.orgId,
              downstreamOrganizationId: input.downstreamOrganizationId,
            },
          },
        });

        moduleLogger.info('Upstream association deleted successfully', {
          ...input,
          appUserId: ctx.session.appUserId,
        });

        return { success: true };
      } catch (error) {
        moduleLogger.error('Failed to delete upstream association', {
          ...input,
          appUserId: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete upstream association',
        });
      }
    }),
});
