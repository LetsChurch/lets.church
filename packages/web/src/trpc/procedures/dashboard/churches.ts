import { OrganizationType, prisma } from '@letschurch/db';
import { PART_SIZE } from '@letschurch/s3';
import { ingestS3 } from '@letschurch/s3/ingest';
import { publicS3 } from '@letschurch/s3/public';
import { TRPCError } from '@trpc/server';
import { invariant, isEqual, pick } from 'es-toolkit';
import {
  finalizeMultipartUploadSchema,
  multipartUploadSchema,
} from '@/schemas/common';
import {
  addLeaderSchema,
  cancelChurchInvitationSchema,
  channelSearchChurchSchema,
  churchQuerySchema,
  createChurchSchema,
  inviteChurchMemberSchema,
  linkChannelSchema,
  removeChurchMemberSchema,
  removeLeaderSchema,
  resendChurchInvitationSchema,
  unlinkChannelSchema,
  updateChurchSchema,
  updateLeaderSchema,
} from '@/schemas/dashboard';
import {
  completeMultipartMediaUpload,
  geocodeOrganization,
  handleMultipartMediaUpload,
  sendInvitationEmail,
} from '@/temporal';
import {
  mantineAvatarLg2x,
  mantineAvatarSm2x,
  mantineAvatarXl2x,
} from '@/util/avatar-sizes';
import logger from '@/util/logger';
import { getPublicImageUrl } from '@/util/server-env';
import { authProcedure, router } from '../../trpc';

const moduleLogger = logger.child({
  module: 'trpc/procedures/dashboard/churches',
});

const churchProcedure = authProcedure
  .input(churchQuerySchema)
  .use(async ({ ctx, input, next }) => {
    // Site admins have full access to all churches
    if (ctx.isSiteAdmin) {
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
            addresses:
              input.addresses && input.addresses.length > 0
                ? {
                    createMany: {
                      data: input.addresses.map((address) => ({
                        type: address.type,
                        name: address.name || null,
                        streetAddress: address.streetAddress || null,
                        locality: address.locality || null,
                        region: address.region || null,
                        postalCode: address.postalCode || null,
                        country: address.country || null,
                        postOfficeBoxNumber:
                          address.postOfficeBoxNumber || null,
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

        // Trigger geocoding if addresses were provided
        if (input.addresses && input.addresses.length > 0) {
          await geocodeOrganization(church.id);
          moduleLogger.info(
            {
              appUserId: ctx.session.appUserId,
              context: {
                churchId: church.id,
              },
            },
            'Geocoding workflow triggered for new church addresses',
          );
        }

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

  inviteToChurch: churchAdminProcedure
    .input(inviteChurchMemberSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          context: {
            churchId: input.churchId,
            isAdmin: input.isAdmin,
            canEdit: input.canEdit,
          },
        },
        'Inviting user to church',
      );

      // Check if email already belongs to a member
      const existingMember = await prisma.organizationMembership.findFirst({
        where: {
          organizationId: input.churchId,
          appUser: {
            emails: {
              some: {
                email: input.email,
              },
            },
          },
        },
      });

      // Return success without revealing membership state to prevent user enumeration
      if (existingMember) {
        return { success: true, message: 'Invitation sent successfully' };
      }

      // Check for existing pending invitation
      const existingInvitation = await prisma.organizationInvitation.findUnique(
        {
          where: {
            organizationId_email: {
              organizationId: input.churchId,
              email: input.email,
            },
          },
        },
      );

      // Return success without revealing invitation state to prevent user enumeration
      if (
        existingInvitation &&
        existingInvitation.status === 'PENDING' &&
        existingInvitation.expiresAt > new Date()
      ) {
        return { success: true, message: 'Invitation sent successfully' };
      }

      // Create or update invitation
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const invitation = await prisma.organizationInvitation.upsert({
        where: {
          organizationId_email: {
            organizationId: input.churchId,
            email: input.email,
          },
        },
        update: {
          status: 'PENDING',
          isAdmin: input.isAdmin,
          canEdit: input.canEdit,
          expiresAt,
          respondedAt: null,
          invitedById: ctx.session.appUserId,
        },
        create: {
          organizationId: input.churchId,
          email: input.email,
          isAdmin: input.isAdmin,
          canEdit: input.canEdit,
          invitedById: ctx.session.appUserId,
          expiresAt,
        },
      });

      // Send invitation email
      await sendInvitationEmail({
        invitationId: invitation.id,
        type: 'organization',
      });

      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          context: {
            churchId: input.churchId,
            invitationId: invitation.id,
          },
        },
        'Church invitation created and email sent',
      );

      // Return identical success message for security (no user enumeration)
      return { success: true, message: 'Invitation sent successfully' };
    }),

  getChurchInvitations: churchAdminProcedure
    .input(churchQuerySchema)
    .query(async ({ input }) => {
      return prisma.organizationInvitation.findMany({
        where: {
          organizationId: input.churchId,
          status: 'PENDING',
          expiresAt: { gt: new Date() },
        },
        select: {
          id: true,
          email: true,
          isAdmin: true,
          canEdit: true,
          createdAt: true,
          expiresAt: true,
          invitedBy: {
            select: {
              username: true,
              fullName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    }),

  cancelChurchInvitation: churchAdminProcedure
    .input(cancelChurchInvitationSchema)
    .mutation(async ({ input }) => {
      // Use updateMany to ensure the invitation belongs to the church
      const result = await prisma.organizationInvitation.updateMany({
        where: {
          id: input.invitationId,
          organizationId: input.churchId,
        },
        data: { status: 'CANCELLED' },
      });

      if (result.count === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Invitation not found',
        });
      }

      return { success: true };
    }),

  resendChurchInvitation: churchAdminProcedure
    .input(resendChurchInvitationSchema)
    .mutation(async ({ ctx, input }) => {
      // First fetch and validate the invitation
      const existingInvitation = await prisma.organizationInvitation.findFirst({
        where: {
          id: input.invitationId,
          organizationId: input.churchId,
        },
      });

      if (!existingInvitation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Invitation not found',
        });
      }

      if (existingInvitation.status !== 'PENDING') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Can only resend pending invitations',
        });
      }

      // Update the expiration
      const invitation = await prisma.organizationInvitation.update({
        where: { id: input.invitationId },
        data: {
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      // Send invitation email
      await sendInvitationEmail({
        invitationId: invitation.id,
        type: 'organization',
      });

      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          context: {
            churchId: input.churchId,
            invitationId: invitation.id,
          },
        },
        'Church invitation resent',
      );

      return { success: true };
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
        let wasAdmin = false;
        await prisma.$transaction(async (tx) => {
          // Don't allow removing the last admin
          const adminCount = await tx.organizationMembership.count({
            where: {
              organizationId: input.churchId,
              isAdmin: true,
            },
          });

          const membershipToDelete = await tx.organizationMembership.findUnique(
            {
              where: {
                organizationId_appUserId: {
                  organizationId: input.churchId,
                  appUserId: input.appUserId,
                },
              },
              select: { isAdmin: true, appUserId: true },
            },
          );

          if (!membershipToDelete) {
            moduleLogger.warn(
              {
                context: {
                  churchId: input.churchId,
                  memberToRemove: input.appUserId,
                  removedBy: ctx.session.appUserId,
                },
              },
              'Membership not found',
            );
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Membership not found',
            });
          }

          wasAdmin = membershipToDelete.isAdmin;

          if (membershipToDelete.isAdmin && adminCount <= 1) {
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

          await tx.organizationMembership.delete({
            where: {
              organizationId_appUserId: {
                organizationId: input.churchId,
                appUserId: input.appUserId,
              },
            },
          });
        });

        moduleLogger.info(
          {
            context: {
              churchId: input.churchId,
              memberRemoved: input.appUserId,
              removedBy: ctx.session.appUserId,
              wasAdmin,
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
        addresses: {
          select: {
            type: true,
            name: true,
            streetAddress: true,
            locality: true,
            region: true,
            postalCode: true,
            country: true,
            postOfficeBoxNumber: true,
          },
        },
        facebookUrl: true,
        instagramUrl: true,
        xUrl: true,
        youtubeUrl: true,
        tiktokUrl: true,
        linkedinUrl: true,
        threadsUrl: true,
        applePodcastsUrl: true,
        spotifyUrl: true,
        rssUrl: true,
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
        let hasNewAddresses = false;

        await prisma.$transaction(async (tx) => {
          // Handle tag updates if provided
          if (input.tags !== undefined) {
            // First, delete all existing tags
            await tx.organizationTagInstance.deleteMany({
              where: {
                organizationId: input.churchId,
              },
            });

            // Then, create new tag instances if tags are provided
            if (input.tags.length > 0) {
              await tx.organizationTagInstance.createMany({
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
            await tx.organizationOrganizationAssociation.deleteMany({
              where: {
                downstreamOrganizationId: input.churchId,
              },
            });

            // Then, create new associations if provided
            if (input.associatedOrganizations.length > 0) {
              await tx.organizationOrganizationAssociation.createMany({
                data: input.associatedOrganizations.map((upstreamOrgId) => ({
                  upstreamOrganizationId: upstreamOrgId,
                  downstreamOrganizationId: input.churchId,
                  downstreamApproved: true, // Church automatically approves being downstream
                  upstreamApproved: false, // Upstream organization needs to approve
                })),
              });
            }
          }

          // Handle addresses if provided
          if (input.addresses !== undefined) {
            // Fetch existing addresses with their geocoding data
            const existingAddresses = await tx.organizationAddress.findMany({
              where: {
                organizationId: input.churchId,
              },
            });

            // Helper to check if two addresses are the same (comparing only user-editable fields)
            const addressesMatch = (
              a: Record<string, unknown>,
              b: Record<string, unknown>,
            ): boolean => {
              const editableFields = [
                'type',
                'name',
                'streetAddress',
                'locality',
                'region',
                'postalCode',
                'country',
                'postOfficeBoxNumber',
              ] as const;
              return isEqual(pick(a, editableFields), pick(b, editableFields));
            };

            // Track which existing addresses we're keeping
            const existingAddressIdsToKeep = new Set<string>();

            // Process each input address
            for (const inputAddress of input.addresses) {
              // Check if this address already exists
              const matchingExisting = existingAddresses.find(
                (existing) =>
                  !existingAddressIdsToKeep.has(existing.id) &&
                  addressesMatch(inputAddress, existing),
              );

              if (matchingExisting) {
                // Address unchanged, keep it with its geocoding data
                existingAddressIdsToKeep.add(matchingExisting.id);
              } else {
                // New or changed address, create it
                await tx.organizationAddress.create({
                  data: {
                    organizationId: input.churchId,
                    type: inputAddress.type,
                    name: inputAddress.name || null,
                    streetAddress: inputAddress.streetAddress || null,
                    locality: inputAddress.locality || null,
                    region: inputAddress.region || null,
                    postalCode: inputAddress.postalCode || null,
                    country: inputAddress.country || null,
                    postOfficeBoxNumber:
                      inputAddress.postOfficeBoxNumber || null,
                  },
                });
                hasNewAddresses = true;
              }
            }

            // Delete addresses that are no longer in the input
            const addressIdsToDelete = existingAddresses
              .filter((existing) => !existingAddressIdsToKeep.has(existing.id))
              .map((addr) => addr.id);

            if (addressIdsToDelete.length > 0) {
              await tx.organizationAddress.deleteMany({
                where: {
                  id: { in: addressIdsToDelete },
                },
              });
            }
          }

          await tx.organization.update({
            where: {
              id: input.churchId,
            },
            data: {
              name: input.name,
              description: input.description || null,
              websiteUrl: input.websiteUrl || null,
              primaryEmail: input.primaryEmail || null,
              primaryPhoneNumber: input.primaryPhoneNumber || null,
              facebookUrl: input.facebookUrl || null,
              instagramUrl: input.instagramUrl || null,
              xUrl: input.xUrl || null,
              youtubeUrl: input.youtubeUrl || null,
              tiktokUrl: input.tiktokUrl || null,
              linkedinUrl: input.linkedinUrl || null,
              threadsUrl: input.threadsUrl || null,
              applePodcastsUrl: input.applePodcastsUrl || null,
              spotifyUrl: input.spotifyUrl || null,
              rssUrl: input.rssUrl || null,
            },
          });
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

        // Trigger geocoding only if new addresses were created
        if (hasNewAddresses) {
          await geocodeOrganization(input.churchId);
          moduleLogger.info(
            {
              appUserId: ctx.session.appUserId,
              context: {
                churchId: input.churchId,
              },
            },
            'Geocoding workflow triggered for new church addresses',
          );
        }

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
