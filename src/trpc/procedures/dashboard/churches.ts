import { OrganizationType } from '@prisma/client';
import { TRPCError } from '@trpc/server';
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
  getOrganizationTags: authProcedure.query(async ({ ctx }) => {
    moduleLogger.info('Fetching organization tags', {
      appUserId: ctx.session.appUserId,
    });

    return db.organizationTag.findMany({
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
      moduleLogger.info('Creating church', {
        appUserId: ctx.session.appUserId,
        name: input.name,
      });

      try {
        const slug =
          input.slug ||
          input.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');

        // Get the tag slugs from the single tags array
        const allTagSlugs = input.tags || [];

        const church = await db.organization.create({
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
          await db.organizationOrganizationAssociation.createMany({
            data: input.associatedOrganizations.map((upstreamOrgId) => ({
              upstreamOrganizationId: upstreamOrgId,
              downstreamOrganizationId: church.id,
              downstreamApproved: true, // Church automatically approves being downstream
              upstreamApproved: false, // Upstream organization needs to approve
            })),
          });
        }

        moduleLogger.info('Church created successfully', {
          appUserId: ctx.session.appUserId,
          churchId: church.id,
        });

        return church;
      } catch (error) {
        moduleLogger.error('Failed to create church', {
          appUserId: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create church',
        });
      }
    }),

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
    .query(async ({ ctx, input }) => {
      moduleLogger.info('Searching users for church', {
        churchId: input.churchId,
        query: input.query,
        appUserId: ctx.session.appUserId,
      });

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

      moduleLogger.info('User search completed', {
        churchId: input.churchId,
        query: input.query,
        resultCount: users.length,
        appUserId: ctx.session.appUserId,
      });

      return users;
    }),

  addChurchMember: churchAdminProcedure
    .input(addChurchMemberSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info('Adding church member', {
        churchId: input.churchId,
        newMemberUserId: input.userId,
        isAdmin: input.isAdmin,
        canEdit: input.canEdit,
        addedBy: ctx.session.appUserId,
      });

      try {
        await db.organizationMembership.create({
          data: {
            organizationId: input.churchId,
            appUserId: input.userId,
            isAdmin: input.isAdmin,
            canEdit: input.canEdit,
          },
        });

        moduleLogger.info('Church member added successfully', {
          churchId: input.churchId,
          newMemberUserId: input.userId,
          addedBy: ctx.session.appUserId,
        });

        return { success: true };
      } catch (error) {
        moduleLogger.error('Failed to add church member', {
          churchId: input.churchId,
          newMemberUserId: input.userId,
          addedBy: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }),

  removeChurchMember: churchAdminProcedure
    .input(removeChurchMemberSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info('Removing church member', {
        churchId: input.churchId,
        memberToRemove: input.appUserId,
        removedBy: ctx.session.appUserId,
      });

      try {
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
          moduleLogger.warn('Cannot remove last admin from church', {
            churchId: input.churchId,
            memberToRemove: input.appUserId,
            removedBy: ctx.session.appUserId,
          });
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Cannot remove the last admin from the church',
          });
        }

        // Don't allow removing yourself
        if (membershipToDelete?.appUserId === ctx.session.appUser.id) {
          moduleLogger.warn('User attempted to remove themselves from church', {
            churchId: input.churchId,
            appUserId: ctx.session.appUserId,
          });
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

        moduleLogger.info('Church member removed successfully', {
          churchId: input.churchId,
          memberRemoved: input.appUserId,
          removedBy: ctx.session.appUserId,
          wasAdmin: membershipToDelete?.isAdmin,
        });

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        moduleLogger.error('Failed to remove church member', {
          churchId: input.churchId,
          memberToRemove: input.appUserId,
          removedBy: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }),

  searchChannels: churchAdminProcedure
    .input(channelSearchChurchSchema)
    .query(async ({ ctx, input }) => {
      moduleLogger.info('Searching channels for church', {
        churchId: input.churchId,
        query: input.query,
        appUserId: ctx.session.appUserId,
      });

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

      moduleLogger.info('Channel search completed', {
        churchId: input.churchId,
        query: input.query,
        resultCount: channels.length,
        appUserId: ctx.session.appUserId,
      });

      return channels;
    }),

  linkChannel: churchAdminProcedure
    .input(linkChannelSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info('Linking channel to church', {
        churchId: input.churchId,
        channelId: input.channelId,
        officialChannel: input.officialChannel,
        linkedBy: ctx.session.appUserId,
      });

      try {
        await db.organizationChannelAssociation.create({
          data: {
            organizationId: input.churchId,
            channelId: input.channelId,
            officialChannel: input.officialChannel,
          },
        });

        moduleLogger.info('Channel linked to church successfully', {
          churchId: input.churchId,
          channelId: input.channelId,
          officialChannel: input.officialChannel,
          linkedBy: ctx.session.appUserId,
        });

        return { success: true };
      } catch (error) {
        moduleLogger.error('Failed to link channel to church', {
          churchId: input.churchId,
          channelId: input.channelId,
          linkedBy: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }),

  unlinkChannel: churchAdminProcedure
    .input(unlinkChannelSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info('Unlinking channel from church', {
        churchId: input.churchId,
        channelId: input.channelId,
        unlinkedBy: ctx.session.appUserId,
      });

      try {
        await db.organizationChannelAssociation.delete({
          where: {
            organizationId_channelId: {
              organizationId: input.churchId,
              channelId: input.channelId,
            },
          },
        });

        moduleLogger.info('Channel unlinked from church successfully', {
          churchId: input.churchId,
          channelId: input.channelId,
          unlinkedBy: ctx.session.appUserId,
        });

        return { success: true };
      } catch (error) {
        moduleLogger.error('Failed to unlink channel from church', {
          churchId: input.churchId,
          channelId: input.channelId,
          unlinkedBy: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }),

  addLeader: churchAdminProcedure
    .input(addLeaderSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info('Adding church leader', {
        churchId: input.churchId,
        leaderType: input.type,
        leaderName: input.name,
        addedBy: ctx.session.appUserId,
      });

      try {
        const leader = await db.organizationLeader.create({
          data: {
            organizationId: input.churchId,
            type: input.type,
            name: input.name,
            email: input.email || null,
            phoneNumber: input.phoneNumber || null,
          },
        });

        moduleLogger.info('Church leader added successfully', {
          churchId: input.churchId,
          leaderId: leader.id,
          leaderType: input.type,
          leaderName: input.name,
          addedBy: ctx.session.appUserId,
        });

        return { success: true };
      } catch (error) {
        moduleLogger.error('Failed to add church leader', {
          churchId: input.churchId,
          leaderType: input.type,
          leaderName: input.name,
          addedBy: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }),

  updateLeader: churchAdminProcedure
    .input(updateLeaderSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info('Updating church leader', {
        leaderId: input.leaderId,
        leaderType: input.type,
        leaderName: input.name,
        updatedBy: ctx.session.appUserId,
      });

      try {
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

        moduleLogger.info('Church leader updated successfully', {
          leaderId: input.leaderId,
          leaderType: input.type,
          leaderName: input.name,
          updatedBy: ctx.session.appUserId,
        });

        return { success: true };
      } catch (error) {
        moduleLogger.error('Failed to update church leader', {
          leaderId: input.leaderId,
          leaderType: input.type,
          leaderName: input.name,
          updatedBy: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }),

  removeLeader: churchAdminProcedure
    .input(removeLeaderSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info('Removing church leader', {
        leaderId: input.leaderId,
        removedBy: ctx.session.appUserId,
      });

      try {
        await db.organizationLeader.delete({
          where: {
            id: input.leaderId,
          },
        });

        moduleLogger.info('Church leader removed successfully', {
          leaderId: input.leaderId,
          removedBy: ctx.session.appUserId,
        });

        return { success: true };
      } catch (error) {
        moduleLogger.error('Failed to remove church leader', {
          leaderId: input.leaderId,
          removedBy: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }),

  getChurchForEdit: churchAdminProcedure.query(async ({ ctx, input }) => {
    moduleLogger.info('Fetching church for edit', {
      ...input,
      appUserId: ctx.session.appUserId,
    });

    const church = await db.organization.findFirst({
      select: {
        id: true,
        name: true,
        description: true,
        websiteUrl: true,
        primaryEmail: true,
        primaryPhoneNumber: true,
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
      moduleLogger.warn('Church not found for edit', {
        ...input,
        appUserId: ctx.session.appUserId,
      });

      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    // Transform tags to a flat array of strings and associated organizations
    return {
      ...church,
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
      moduleLogger.info('Updating church', {
        churchId: input.churchId,
        appUserId: ctx.session.appUserId,
      });

      try {
        // Handle tag updates if provided
        if (input.tags !== undefined) {
          // First, delete all existing tags
          await db.organizationTagInstance.deleteMany({
            where: {
              organizationId: input.churchId,
            },
          });

          // Then, create new tag instances if tags are provided
          if (input.tags.length > 0) {
            await db.organizationTagInstance.createMany({
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
          await db.organizationOrganizationAssociation.deleteMany({
            where: {
              downstreamOrganizationId: input.churchId,
            },
          });

          // Then, create new associations if provided
          if (input.associatedOrganizations.length > 0) {
            await db.organizationOrganizationAssociation.createMany({
              data: input.associatedOrganizations.map((upstreamOrgId) => ({
                upstreamOrganizationId: upstreamOrgId,
                downstreamOrganizationId: input.churchId,
                downstreamApproved: true, // Church automatically approves being downstream
                upstreamApproved: false, // Upstream organization needs to approve
              })),
            });
          }
        }

        await db.organization.update({
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

        moduleLogger.info('Church updated successfully', {
          churchId: input.churchId,
          appUserId: ctx.session.appUserId,
        });

        return { error: false };
      } catch (e) {
        moduleLogger.error('Church update failed', {
          churchId: input.churchId,
          appUserId: ctx.session.appUserId,
          error: e instanceof Error ? e.message : String(e),
        });
        return { error: 'Error updating church, please try again!' };
      }
    }),
});
