import { OrganizationType, prisma } from '@letschurch/db';
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
import logger from '@/util/logger';
import { authProcedure, router } from '../../trpc';

const moduleLogger = logger.child({
  module: 'trpc/procedures/dashboard/organizations',
});

const organizationProcedure = authProcedure
  .input(organizationQuerySchema)
  .use(async ({ ctx, input, next }) => {
    const membership = await prisma.organizationMembership.findFirst({
      where: {
        appUserId: ctx.session.appUserId,
        organizationId: input.orgId,
      },
    });

    if (!membership) {
      moduleLogger.warn(
        {
          appUserId: ctx.session.appUserId,
        },
        'No membership found for organization procedure',
      );

      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }

    return next({ ctx: { ...ctx, membership } });
  });

const organizationAdminProcedure = organizationProcedure.use(
  async ({ ctx, next }) => {
    if (!ctx.membership.isAdmin) {
      moduleLogger.warn(
        {
          appUserId: ctx.session.appUserId,
        },
        'User is not admin of organization',
      );

      throw new TRPCError({ code: 'FORBIDDEN' });
    }

    return next();
  },
);

export const organizationRouter = router({
  getAllOrganizations: authProcedure
    .input(getAllOrganizationsSchema)
    .query(async ({ input }) => {
      moduleLogger.info(
        {
          context: {
            excludeChurchTypes: input.excludeChurchTypes,
          },
        },
        'Fetching all organizations',
      );

      const whereClause = input.excludeChurchTypes
        ? { type: { not: OrganizationType.CHURCH } }
        : {};

      return prisma.organization.findMany({
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
    .query(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          context: {
            query: input.query,
            excludeChurchTypes: input.excludeChurchTypes,
            limit: input.limit,
          },
        },
        'Searching organizations',
      );

      const whereClause = {
        name: {
          contains: input.query,
          mode: 'insensitive' as const,
        },
        ...(input.excludeChurchTypes && {
          type: { not: OrganizationType.CHURCH },
        }),
      };

      const organizations = await prisma.organization.findMany({
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

      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          context: {
            query: input.query,
            resultCount: organizations.length,
            excludeChurchTypes: input.excludeChurchTypes,
          },
        },
        'Organization search completed',
      );

      return organizations;
    }),

  getOrganizationsByIds: authProcedure
    .input(getOrganizationsByIdsSchema)
    .query(async ({ input }) => {
      moduleLogger.info(
        {
          context: {
            organizationCount: input.organizationIds.length,
          },
        },
        'Fetching organizations by IDs',
      );

      if (input.organizationIds.length === 0) {
        return [];
      }

      return prisma.organization.findMany({
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
    moduleLogger.info(
      {
        appUserId: ctx.session.appUserId,
      },
      'Fetching organizations for user',
    );

    return prisma.organization.findMany({
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
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
        },
        'Fetching organization details',
      );

      const organization = await prisma.organization.findFirst({
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
        moduleLogger.warn(
          {
            appUserId: ctx.session.appUserId,
          },
          'Organization not found',
        );

        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      // Get count of unapproved upstream associations
      const unapprovedAssociationsCount =
        await prisma.organizationOrganizationAssociation.count({
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
      const organization = await prisma.organization.findFirst({
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
        moduleLogger.warn('Organization not found for members');

        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      return { ...organization, userMembership: ctx.membership };
    },
  ),

  searchUsers: organizationAdminProcedure
    .input(userSearchOrganizationSchema)
    .query(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          organizationId: input.orgId,
          appUserId: ctx.session.appUserId,
          context: {
            query: input.query,
          },
        },
        'Searching users for organization',
      );

      const users = await prisma.appUser.findMany({
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

      moduleLogger.info(
        {
          organizationId: input.orgId,
          appUserId: ctx.session.appUserId,
          context: {
            query: input.query,
            resultCount: users.length,
          },
        },
        'User search completed',
      );

      return users;
    }),

  addOrganizationMember: organizationAdminProcedure
    .input(addOrganizationMemberSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          organizationId: input.orgId,
          context: {
            newMemberUserId: input.userId,
            isAdmin: input.isAdmin,
            canEdit: input.canEdit,
            addedBy: ctx.session.appUserId,
          },
        },
        'Adding organization member',
      );

      try {
        await prisma.organizationMembership.create({
          data: {
            organizationId: input.orgId,
            appUserId: input.userId,
            isAdmin: input.isAdmin,
            canEdit: input.canEdit,
          },
        });

        moduleLogger.info(
          {
            organizationId: input.orgId,
            context: {
              newMemberUserId: input.userId,
              addedBy: ctx.session.appUserId,
            },
          },
          'Organization member added successfully',
        );

        return { success: true };
      } catch (error) {
        moduleLogger.error(
          {
            organizationId: input.orgId,
            context: {
              newMemberUserId: input.userId,
              addedBy: ctx.session.appUserId,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to add organization member',
        );
        throw error;
      }
    }),

  removeOrganizationMember: organizationAdminProcedure
    .input(removeOrganizationMemberSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          organizationId: input.orgId,
          context: {
            memberToRemove: input.appUserId,
            removedBy: ctx.session.appUserId,
          },
        },
        'Removing organization member',
      );

      try {
        // Don't allow removing the last admin
        const adminCount = await prisma.organizationMembership.count({
          where: {
            organizationId: input.orgId,
            isAdmin: true,
          },
        });

        const membershipToDelete =
          await prisma.organizationMembership.findUnique({
            where: {
              organizationId_appUserId: {
                organizationId: input.orgId,
                appUserId: input.appUserId,
              },
            },
            select: { isAdmin: true, appUserId: true },
          });

        if (membershipToDelete?.isAdmin && adminCount <= 1) {
          moduleLogger.warn(
            {
              organizationId: input.orgId,
              context: {
                memberToRemove: input.appUserId,
                removedBy: ctx.session.appUserId,
              },
            },
            'Cannot remove last admin from organization',
          );
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Cannot remove the last admin from the organization',
          });
        }

        // Don't allow removing yourself
        if (membershipToDelete?.appUserId === ctx.session.appUser.id) {
          moduleLogger.warn(
            {
              organizationId: input.orgId,
              appUserId: ctx.session.appUserId,
            },
            'User attempted to remove themselves from organization',
          );
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'You cannot remove yourself from the organization',
          });
        }

        await prisma.organizationMembership.delete({
          where: {
            organizationId_appUserId: {
              organizationId: input.orgId,
              appUserId: input.appUserId,
            },
          },
        });

        moduleLogger.info(
          {
            organizationId: input.orgId,
            context: {
              memberRemoved: input.appUserId,
              removedBy: ctx.session.appUserId,
              wasAdmin: membershipToDelete?.isAdmin,
            },
          },
          'Organization member removed successfully',
        );

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        moduleLogger.error(
          {
            organizationId: input.orgId,
            context: {
              memberToRemove: input.appUserId,
              removedBy: ctx.session.appUserId,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to remove organization member',
        );
        throw error;
      }
    }),

  getOrganizationForEdit: organizationAdminProcedure.query(
    async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
        },
        'Fetching organization for edit',
      );

      const organization = await prisma.organization.findFirst({
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
        moduleLogger.warn(
          {
            appUserId: ctx.session.appUserId,
          },
          'Organization not found for edit',
        );

        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      return organization;
    },
  ),

  updateOrganization: organizationAdminProcedure
    .input(updateOrganizationSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          context: {
            orgId: input.orgId,
          },
        },
        'Updating organization',
      );

      try {
        await prisma.organization.update({
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

        moduleLogger.info(
          {
            appUserId: ctx.session.appUserId,
            context: {
              orgId: input.orgId,
            },
          },
          'Organization updated successfully',
        );

        return { error: false };
      } catch (e) {
        moduleLogger.error(
          {
            appUserId: ctx.session.appUserId,
            context: {
              orgId: input.orgId,
              error: e instanceof Error ? e.message : String(e),
            },
          },
          'Organization update failed',
        );
        return { error: 'Error updating organization, please try again!' };
      }
    }),

  approveOrganization: authProcedure
    .input(organizationQuerySchema)
    .use(async ({ ctx, next }) => {
      // Only site admins can approve organizations
      if (ctx.session.appUser.role !== 'ADMIN') {
        moduleLogger.warn(
          {
            appUserId: ctx.session.appUserId,
            context: {
              role: ctx.session.appUser.role,
            },
          },
          'Non-admin user attempted to approve organization',
        );
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      return next();
    })
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          context: {
            orgId: input.orgId,
          },
        },
        'Approving organization',
      );

      try {
        await prisma.organization.update({
          where: {
            id: input.orgId,
          },
          data: {
            approvedAt: new Date(),
            approvedById: ctx.session.appUserId,
          },
        });

        moduleLogger.info(
          {
            appUserId: ctx.session.appUserId,
            context: {
              orgId: input.orgId,
            },
          },
          'Organization approved successfully',
        );

        return { success: true };
      } catch (error) {
        moduleLogger.error(
          {
            appUserId: ctx.session.appUserId,
            context: {
              orgId: input.orgId,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to approve organization',
        );

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
          {
            appUserId: ctx.session.appUserId,
            context: { role: ctx.session.appUser.role },
          },
          'Non-admin user attempted to unapprove organization',
        );
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      return next();
    })
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          context: {
            orgId: input.orgId,
          },
        },
        'Unapproving organization',
      );

      try {
        await prisma.organization.update({
          where: {
            id: input.orgId,
          },
          data: {
            approvedAt: null,
            approvedById: null,
          },
        });

        moduleLogger.info(
          {
            appUserId: ctx.session.appUserId,
            context: {
              orgId: input.orgId,
            },
          },
          'Organization unapproved successfully',
        );

        return { success: true };
      } catch (error) {
        moduleLogger.error(
          {
            appUserId: ctx.session.appUserId,
            context: {
              orgId: input.orgId,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to unapprove organization',
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to unapprove organization',
        });
      }
    }),

  getPendingDownstreamApprovals: organizationProcedure.query(
    async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
        },
        'Fetching pending downstream approvals',
      );

      // Get the organization to make sure it's not a church
      const organization = await prisma.organization.findFirst({
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
        moduleLogger.warn(
          {
            appUserId: ctx.session.appUserId,
          },
          'Organization not found or is not a ministry',
        );
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      // Get all pending downstream relationship approvals
      const pendingApprovals =
        await prisma.organizationOrganizationAssociation.findMany({
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
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
        },
        'Approving downstream relationship',
      );

      try {
        await prisma.organizationOrganizationAssociation.update({
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

        moduleLogger.info(
          {
            appUserId: ctx.session.appUserId,
          },
          'Downstream relationship approved successfully',
        );

        return { success: true };
      } catch (error) {
        moduleLogger.error(
          {
            appUserId: ctx.session.appUserId,
            context: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to approve downstream relationship',
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to approve downstream relationship',
        });
      }
    }),

  rejectDownstreamRelationship: organizationAdminProcedure
    .input(organizationRelationshipSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
        },
        'Rejecting downstream relationship',
      );

      try {
        await prisma.organizationOrganizationAssociation.delete({
          where: {
            upstreamOrganizationId_downstreamOrganizationId: {
              upstreamOrganizationId: input.orgId,
              downstreamOrganizationId: input.downstreamOrganizationId,
            },
          },
        });

        moduleLogger.info(
          {
            appUserId: ctx.session.appUserId,
          },
          'Downstream relationship rejected successfully',
        );

        return { success: true };
      } catch (error) {
        moduleLogger.error(
          {
            appUserId: ctx.session.appUserId,
            context: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to reject downstream relationship',
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to reject downstream relationship',
        });
      }
    }),

  getUpstreamAssociations: organizationProcedure.query(
    async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
        },
        'Fetching upstream associations',
      );

      // Get all associations where this organization is upstream
      const upstreamAssociations =
        await prisma.organizationOrganizationAssociation.findMany({
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
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
        },
        'Approving upstream association',
      );

      try {
        await prisma.organizationOrganizationAssociation.update({
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

        moduleLogger.info(
          {
            appUserId: ctx.session.appUserId,
          },
          'Upstream association approved successfully',
        );

        return { success: true };
      } catch (error) {
        moduleLogger.error(
          {
            appUserId: ctx.session.appUserId,
            context: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to approve upstream association',
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to approve upstream association',
        });
      }
    }),

  unapproveUpstreamAssociation: organizationAdminProcedure
    .input(upstreamAssociationActionSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
        },
        'Unapproving upstream association',
      );

      try {
        await prisma.organizationOrganizationAssociation.update({
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

        moduleLogger.info(
          {
            appUserId: ctx.session.appUserId,
          },
          'Upstream association unapproved successfully',
        );

        return { success: true };
      } catch (error) {
        moduleLogger.error(
          {
            appUserId: ctx.session.appUserId,
            context: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to unapprove upstream association',
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to unapprove upstream association',
        });
      }
    }),

  deleteUpstreamAssociation: organizationAdminProcedure
    .input(upstreamAssociationActionSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
        },
        'Deleting upstream association',
      );

      try {
        await prisma.organizationOrganizationAssociation.delete({
          where: {
            upstreamOrganizationId_downstreamOrganizationId: {
              upstreamOrganizationId: input.orgId,
              downstreamOrganizationId: input.downstreamOrganizationId,
            },
          },
        });

        moduleLogger.info(
          {
            appUserId: ctx.session.appUserId,
          },
          'Upstream association deleted successfully',
        );

        return { success: true };
      } catch (error) {
        moduleLogger.error(
          {
            appUserId: ctx.session.appUserId,
            context: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to delete upstream association',
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete upstream association',
        });
      }
    }),
});
