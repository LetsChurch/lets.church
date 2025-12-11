import { OrganizationType, prisma } from '@letschurch/db';
import { TRPCError } from '@trpc/server';
import { invariant } from 'es-toolkit';
import {
  finalizeMultipartUploadSchema,
  multipartUploadSchema,
} from '@/schemas/common';
import {
  addChurchMemberSchema,
  addLeaderSchema,
  channelSearchChurchSchema,
  churchQuerySchema,
  createChurchSchema,
  linkChannelSchema,
  removeChurchMemberSchema,
  removeLeaderSchema,
  unlinkChannelSchema,
  updateChurchSchema,
  updateLeaderSchema,
  userSearchChurchSchema,
} from '@/schemas/dashboard';
import {
  completeMultipartMediaUpload,
  handleMultipartMediaUpload,
} from '@/temporal';
import {
  mantineAvatarLg2x,
  mantineAvatarSm2x,
  mantineAvatarXl2x,
} from '@/util/avatar-sizes';
import logger from '@/util/logger';
import { ingestS3, PART_SIZE, publicS3 } from '@/util/s3';
import { getPublicImageUrl } from '@/util/url';
import { authProcedure, router } from '../../trpc';

const moduleLogger = logger.child({
  module: 'trpc/procedures/dashboard/churches',
});

const churchProcedure = authProcedure
  .input(churchQuerySchema)
  .use(async ({ ctx, input, next }) => {
    // Site admins have full access to all churches
    if (ctx.session.appUser.role === 'ADMIN') {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          context: {
            churchId: input.churchId,
          },
        },
        'Site admin accessing church',
      );

      // Create a virtual admin membership for site admins
      return next({
        ctx: {
          ...ctx,
          membership: {
            appUserId: ctx.session.appUserId,
            organizationId: input.churchId,
            isAdmin: true,
            canEdit: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
      });
    }

    const membership = await prisma.organizationMembership.findFirst({
      where: {
        appUserId: ctx.session.appUserId,
        organizationId: input.churchId,
      },
    });

    if (!membership) {
      moduleLogger.warn(
        {
          appUserId: ctx.session.appUserId,
        },
        'No membership found for church procedure',
      );

      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }

    return next({ ctx: { ...ctx, membership } });
  });

const churchAdminProcedure = churchProcedure.use(async ({ ctx, next }) => {
  if (!ctx.membership.isAdmin) {
    moduleLogger.warn(
      {
        appUserId: ctx.session.appUserId,
      },
      'User is not admin of church',
    );

    throw new TRPCError({ code: 'FORBIDDEN' });
  }

  return next();
});

export const churchRouter = router({
  getOrganizationTags: authProcedure.query(async ({ ctx }) => {
    moduleLogger.info(
      {
        appUserId: ctx.session.appUserId,
      },
      'Fetching organization tags',
    );

    return prisma.organizationTag.findMany({
      select: {
        slug: true,
        label: true,
        category: true,
      },
      orderBy: [{ category: 'asc' }, { label: 'asc' }],
    });
  }),

  createChurch: authProcedure
    .input(createChurchSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          context: {
            name: input.name,
          },
        },
        'Creating church',
      );

      try {
        const slug =
          input.slug ||
          input.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');

        // Get the tag slugs from the single tags array
        const allTagSlugs = input.tags || [];

        const church = await prisma.organization.create({
          data: {
            name: input.name,
            slug,
            description: input.description || null,
            type: OrganizationType.CHURCH,
            websiteUrl: input.websiteUrl || null,
            primaryEmail: input.primaryEmail || null,
            primaryPhoneNumber: input.primaryPhoneNumber || null,
            memberships: {
              create: {
                appUserId: ctx.session.appUserId,
                isAdmin: true,
                canEdit: true,
              },
            },
            tags:
              allTagSlugs.length > 0
                ? {
                    createMany: {
                      data: allTagSlugs.map((tagSlug) => ({
                        tagSlug,
                      })),
                    },
                  }
                : undefined,
          },
          select: {
            id: true,
          },
        });

        // Handle organization associations if provided
        if (
          input.associatedOrganizations &&
          input.associatedOrganizations.length > 0
        ) {
          await prisma.organizationOrganizationAssociation.createMany({
            data: input.associatedOrganizations.map((upstreamOrgId) => ({
              upstreamOrganizationId: upstreamOrgId,
              downstreamOrganizationId: church.id,
              downstreamApproved: true, // Church automatically approves being downstream
              upstreamApproved: false, // Upstream organization needs to approve
            })),
          });
        }

        moduleLogger.info(
          {
            appUserId: ctx.session.appUserId,
            context: {
              churchId: church.id,
            },
          },
          'Church created successfully',
        );

        return church;
      } catch (error) {
        moduleLogger.error(
          {
            appUserId: ctx.session.appUserId,
            context: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to create church',
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create church',
        });
      }
    }),

  getChurches: authProcedure.query(async ({ ctx }) => {
    moduleLogger.info(
      {
        appUserId: ctx.session.appUserId,
      },
      'Fetching churches for user',
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
    moduleLogger.info(
      {
        appUserId: ctx.session.appUserId,
      },
      'Fetching church details',
    );

    const church = await prisma.organization.findFirst({
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
      moduleLogger.warn(
        {
          appUserId: ctx.session.appUserId,
        },
        'Church not found',
      );

      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    const { avatarPath, ...churchWithoutPath } = church;
    const avatarUrl = avatarPath
      ? getPublicImageUrl(publicS3.getS3ProtocolUri(avatarPath), {
          resize: mantineAvatarXl2x,
        })
      : null;

    const membershipsWithAvatarUrl = church.memberships.map((membership) => {
      const { avatarPath: userAvatarPath, ...userWithoutPath } =
        membership.appUser;
      const userAvatarUrl = userAvatarPath
        ? getPublicImageUrl(publicS3.getS3ProtocolUri(userAvatarPath), {
            resize: mantineAvatarSm2x,
          })
        : null;

      return {
        ...membership,
        appUser: {
          ...userWithoutPath,
          avatarUrl: userAvatarUrl,
        },
      };
    });

    return {
      ...churchWithoutPath,
      avatarUrl,
      memberships: membershipsWithAvatarUrl,
      userMembership: ctx.membership,
    };
  }),

  getChurchMembers: churchProcedure.query(async ({ ctx, input }) => {
    const church = await prisma.organization.findFirst({
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
      moduleLogger.warn('Church not found for members');

      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    const membershipsWithAvatarUrl = church.memberships.map((membership) => {
      const { avatarPath, ...userWithoutPath } = membership.appUser;
      const avatarUrl = avatarPath
        ? getPublicImageUrl(publicS3.getS3ProtocolUri(avatarPath), {
            resize: mantineAvatarSm2x,
          })
        : null;

      return {
        ...membership,
        appUser: {
          ...userWithoutPath,
          avatarUrl,
        },
      };
    });

    return {
      ...church,
      memberships: membershipsWithAvatarUrl,
      userMembership: ctx.membership,
    };
  }),

  searchUsers: churchAdminProcedure
    .input(userSearchChurchSchema)
    .query(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          context: {
            churchId: input.churchId,
            query: input.query,
          },
        },
        'Searching users for church',
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
                organizationId: input.churchId,
              },
            },
          },
        },
        take: 10,
      });

      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          context: {
            churchId: input.churchId,
            query: input.query,
            resultCount: users.length,
          },
        },
        'User search completed',
      );

      return users.map((user) => {
        const { avatarPath, ...userWithoutPath } = user;
        const avatarUrl = avatarPath
          ? getPublicImageUrl(publicS3.getS3ProtocolUri(avatarPath), {
              resize: mantineAvatarSm2x,
            })
          : null;

        return {
          ...userWithoutPath,
          avatarUrl,
        };
      });
    }),

  addChurchMember: churchAdminProcedure
    .input(addChurchMemberSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          context: {
            churchId: input.churchId,
            newMemberUserId: input.userId,
            isAdmin: input.isAdmin,
            canEdit: input.canEdit,
            addedBy: ctx.session.appUserId,
          },
        },
        'Adding church member',
      );

      try {
        await prisma.organizationMembership.create({
          data: {
            organizationId: input.churchId,
            appUserId: input.userId,
            isAdmin: input.isAdmin,
            canEdit: input.canEdit,
          },
        });

        moduleLogger.info(
          {
            context: {
              churchId: input.churchId,
              newMemberUserId: input.userId,
              addedBy: ctx.session.appUserId,
            },
          },
          'Church member added successfully',
        );

        return { success: true };
      } catch (error) {
        moduleLogger.error(
          {
            context: {
              churchId: input.churchId,
              newMemberUserId: input.userId,
              addedBy: ctx.session.appUserId,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to add church member',
        );
        throw error;
      }
    }),

  removeChurchMember: churchAdminProcedure
    .input(removeChurchMemberSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          context: {
            churchId: input.churchId,
            memberToRemove: input.appUserId,
            removedBy: ctx.session.appUserId,
          },
        },
        'Removing church member',
      );

      try {
        // Don't allow removing the last admin
        const adminCount = await prisma.organizationMembership.count({
          where: {
            organizationId: input.churchId,
            isAdmin: true,
          },
        });

        const membershipToDelete =
          await prisma.organizationMembership.findUnique({
            where: {
              organizationId_appUserId: {
                organizationId: input.churchId,
                appUserId: input.appUserId,
              },
            },
            select: { isAdmin: true, appUserId: true },
          });

        if (membershipToDelete?.isAdmin && adminCount <= 1) {
          moduleLogger.warn(
            {
              context: {
                churchId: input.churchId,
                memberToRemove: input.appUserId,
                removedBy: ctx.session.appUserId,
              },
            },
            'Cannot remove last admin from church',
          );
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Cannot remove the last admin from the church',
          });
        }

        // Don't allow removing yourself
        if (membershipToDelete?.appUserId === ctx.session.appUser.id) {
          moduleLogger.warn(
            {
              appUserId: ctx.session.appUserId,
              context: {
                churchId: input.churchId,
              },
            },
            'User attempted to remove themselves from church',
          );
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'You cannot remove yourself from the church',
          });
        }

        await prisma.organizationMembership.delete({
          where: {
            organizationId_appUserId: {
              organizationId: input.churchId,
              appUserId: input.appUserId,
            },
          },
        });

        moduleLogger.info(
          {
            context: {
              churchId: input.churchId,
              memberRemoved: input.appUserId,
              removedBy: ctx.session.appUserId,
              wasAdmin: membershipToDelete?.isAdmin,
            },
          },
          'Church member removed successfully',
        );

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        moduleLogger.error(
          {
            context: {
              churchId: input.churchId,
              memberToRemove: input.appUserId,
              removedBy: ctx.session.appUserId,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to remove church member',
        );
        throw error;
      }
    }),

  searchChannels: churchAdminProcedure
    .input(channelSearchChurchSchema)
    .query(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          context: {
            churchId: input.churchId,
            query: input.query,
          },
        },
        'Searching channels for church',
      );

      const channels = await prisma.channel.findMany({
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

      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          context: {
            churchId: input.churchId,
            query: input.query,
            resultCount: channels.length,
          },
        },
        'Channel search completed',
      );

      return channels;
    }),

  linkChannel: churchAdminProcedure
    .input(linkChannelSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          channelId: input.channelId,
          context: {
            churchId: input.churchId,
            officialChannel: input.officialChannel,
            linkedBy: ctx.session.appUserId,
          },
        },
        'Linking channel to church',
      );

      try {
        await prisma.organizationChannelAssociation.create({
          data: {
            organizationId: input.churchId,
            channelId: input.channelId,
            officialChannel: input.officialChannel,
          },
        });

        moduleLogger.info(
          {
            channelId: input.channelId,
            context: {
              churchId: input.churchId,
              officialChannel: input.officialChannel,
              linkedBy: ctx.session.appUserId,
            },
          },
          'Channel linked to church successfully',
        );

        return { success: true };
      } catch (error) {
        moduleLogger.error(
          {
            channelId: input.channelId,
            context: {
              churchId: input.churchId,
              linkedBy: ctx.session.appUserId,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to link channel to church',
        );
        throw error;
      }
    }),

  unlinkChannel: churchAdminProcedure
    .input(unlinkChannelSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          channelId: input.channelId,
          context: {
            churchId: input.churchId,
            unlinkedBy: ctx.session.appUserId,
          },
        },
        'Unlinking channel from church',
      );

      try {
        await prisma.organizationChannelAssociation.delete({
          where: {
            organizationId_channelId: {
              organizationId: input.churchId,
              channelId: input.channelId,
            },
          },
        });

        moduleLogger.info(
          {
            channelId: input.channelId,
            context: {
              churchId: input.churchId,
              unlinkedBy: ctx.session.appUserId,
            },
          },
          'Channel unlinked from church successfully',
        );

        return { success: true };
      } catch (error) {
        moduleLogger.error(
          {
            channelId: input.channelId,
            context: {
              churchId: input.churchId,
              unlinkedBy: ctx.session.appUserId,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to unlink channel from church',
        );
        throw error;
      }
    }),

  addLeader: churchAdminProcedure
    .input(addLeaderSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          context: {
            churchId: input.churchId,
            leaderType: input.type,
            leaderName: input.name,
            addedBy: ctx.session.appUserId,
          },
        },
        'Adding church leader',
      );

      try {
        const leader = await prisma.organizationLeader.create({
          data: {
            organizationId: input.churchId,
            type: input.type,
            name: input.name,
            email: input.email || null,
            phoneNumber: input.phoneNumber || null,
          },
        });

        moduleLogger.info(
          {
            context: {
              churchId: input.churchId,
              leaderId: leader.id,
              leaderType: input.type,
              leaderName: input.name,
              addedBy: ctx.session.appUserId,
            },
          },
          'Church leader added successfully',
        );

        return { success: true };
      } catch (error) {
        moduleLogger.error(
          {
            context: {
              churchId: input.churchId,
              leaderType: input.type,
              leaderName: input.name,
              addedBy: ctx.session.appUserId,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to add church leader',
        );
        throw error;
      }
    }),

  updateLeader: churchAdminProcedure
    .input(updateLeaderSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          context: {
            leaderId: input.leaderId,
            leaderType: input.type,
            leaderName: input.name,
            updatedBy: ctx.session.appUserId,
          },
        },
        'Updating church leader',
      );

      try {
        await prisma.organizationLeader.update({
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

        moduleLogger.info(
          {
            context: {
              leaderId: input.leaderId,
              leaderType: input.type,
              leaderName: input.name,
              updatedBy: ctx.session.appUserId,
            },
          },
          'Church leader updated successfully',
        );

        return { success: true };
      } catch (error) {
        moduleLogger.error(
          {
            context: {
              leaderId: input.leaderId,
              leaderType: input.type,
              leaderName: input.name,
              updatedBy: ctx.session.appUserId,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to update church leader',
        );
        throw error;
      }
    }),

  removeLeader: churchAdminProcedure
    .input(removeLeaderSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          context: {
            leaderId: input.leaderId,
            removedBy: ctx.session.appUserId,
          },
        },
        'Removing church leader',
      );

      try {
        await prisma.organizationLeader.delete({
          where: {
            id: input.leaderId,
          },
        });

        moduleLogger.info(
          {
            context: {
              leaderId: input.leaderId,
              removedBy: ctx.session.appUserId,
            },
          },
          'Church leader removed successfully',
        );

        return { success: true };
      } catch (error) {
        moduleLogger.error(
          {
            context: {
              leaderId: input.leaderId,
              removedBy: ctx.session.appUserId,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to remove church leader',
        );
        throw error;
      }
    }),

  getChurchForEdit: churchAdminProcedure.query(async ({ ctx, input }) => {
    moduleLogger.info(
      {
        appUserId: ctx.session.appUserId,
      },
      'Fetching church for edit',
    );

    const church = await prisma.organization.findFirst({
      select: {
        id: true,
        name: true,
        description: true,
        websiteUrl: true,
        primaryEmail: true,
        primaryPhoneNumber: true,
        avatarPath: true,
        tags: {
          select: {
            tagSlug: true,
          },
        },
        upstreamOrganizationAssociations: {
          select: {
            upstreamOrganizationId: true,
            upstreamApproved: true,
          },
        },
      },
      where: {
        id: input.churchId,
        type: 'CHURCH',
      },
    });

    if (!church) {
      moduleLogger.warn(
        {
          appUserId: ctx.session.appUserId,
        },
        'Church not found for edit',
      );

      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    const { avatarPath, ...restChurch } = church;
    const avatarUrl = avatarPath
      ? getPublicImageUrl(publicS3.getS3ProtocolUri(avatarPath), {
          resize: mantineAvatarLg2x,
        })
      : null;

    // Transform tags to a flat array of strings and associated organizations
    return {
      ...restChurch,
      avatarUrl,
      tags: church.tags.map((tag) => tag.tagSlug),
      associatedOrganizations: church.upstreamOrganizationAssociations.map(
        (assoc) => assoc.upstreamOrganizationId,
      ),
      associatedOrganizationsWithStatus:
        church.upstreamOrganizationAssociations.map((assoc) => ({
          organizationId: assoc.upstreamOrganizationId,
          upstreamApproved: assoc.upstreamApproved,
        })),
    };
  }),

  updateChurch: churchAdminProcedure
    .input(updateChurchSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          context: {
            churchId: input.churchId,
          },
        },
        'Updating church',
      );

      try {
        // Handle tag updates if provided
        if (input.tags !== undefined) {
          // First, delete all existing tags
          await prisma.organizationTagInstance.deleteMany({
            where: {
              organizationId: input.churchId,
            },
          });

          // Then, create new tag instances if tags are provided
          if (input.tags.length > 0) {
            await prisma.organizationTagInstance.createMany({
              data: input.tags.map((tagSlug) => ({
                organizationId: input.churchId,
                tagSlug,
              })),
            });
          }
        }

        // Handle organization associations if provided
        if (input.associatedOrganizations !== undefined) {
          // First, delete all existing upstream associations (church is downstream)
          await prisma.organizationOrganizationAssociation.deleteMany({
            where: {
              downstreamOrganizationId: input.churchId,
            },
          });

          // Then, create new associations if provided
          if (input.associatedOrganizations.length > 0) {
            await prisma.organizationOrganizationAssociation.createMany({
              data: input.associatedOrganizations.map((upstreamOrgId) => ({
                upstreamOrganizationId: upstreamOrgId,
                downstreamOrganizationId: input.churchId,
                downstreamApproved: true, // Church automatically approves being downstream
                upstreamApproved: false, // Upstream organization needs to approve
              })),
            });
          }
        }

        await prisma.organization.update({
          where: {
            id: input.churchId,
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
              churchId: input.churchId,
            },
          },
          'Church updated successfully',
        );

        return { error: false };
      } catch (e) {
        moduleLogger.error(
          {
            appUserId: ctx.session.appUserId,
            context: {
              churchId: input.churchId,
              error: e instanceof Error ? e.message : String(e),
            },
          },
          'Church update failed',
        );
        return { error: 'Error updating church, please try again!' };
      }
    }),

  createMultipartUpload: churchAdminProcedure
    .input(multipartUploadSchema)
    .mutation(async ({ input: { targetId, uploadMimeType, bytes } }) => {
      const { uploadKey, uploadId } = await ingestS3.createMultipartUpload(
        targetId,
        uploadMimeType,
      );

      await handleMultipartMediaUpload(
        targetId,
        'INGEST',
        uploadId,
        uploadKey,
        'organizationAvatar',
      );

      const urls = await ingestS3.createPresignedPartUploadUrls(
        uploadId,
        uploadKey,
        bytes,
      );

      return {
        s3UploadKey: uploadKey,
        s3UploadId: uploadId,
        partSize: PART_SIZE,
        urls,
      };
    }),

  finalizeMultipartUpload: churchAdminProcedure
    .input(finalizeMultipartUploadSchema)
    .mutation(
      async ({ ctx, input: { s3UploadId, s3UploadKey, s3PartETags } }) => {
        const userId = ctx.session?.appUserId;
        invariant(userId, 'No user found');
        await completeMultipartMediaUpload(
          s3UploadId,
          s3UploadKey,
          s3PartETags,
          userId,
        );

        return true;
      },
    ),
});
