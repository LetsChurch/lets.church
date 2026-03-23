import { prisma, UploadLicense } from '@letschurch/db';
import { PART_SIZE } from '@letschurch/s3';
import { ingestS3 } from '@letschurch/s3/ingest';
import { publicS3 } from '@letschurch/s3/public';
import { BACKGROUND_QUEUE } from '@letschurch/temporal/queues';
import { emailHtml, sanitizeForHtml } from '@letschurch/temporal/util/email';
import { sendEmailWorkflow } from '@letschurch/temporal/workflows/background/send-email';
import { TRPCError } from '@trpc/server';
import { invariant } from 'es-toolkit';
import { stripIndent } from 'proper-tags';
import sanitizeFilename from 'sanitize-filename';
import { z } from 'zod';
import {
  finalizeMultipartUploadSchema,
  getThumbnailResize,
  multipartUploadSchema,
} from '@/schemas/common';
import {
  addToPlaylistSchema,
  bulkSetVisibilitySchema,
  cancelChannelInvitationSchema,
  channelQuerySchema,
  channelUploadsQuerySchema,
  createChannelSchema,
  createPlaylistSchema,
  createUploadSchema,
  deletePlaylistSchema,
  deleteUploadSchema,
  importMediaSchema,
  inviteChannelMemberSchema,
  playlistQuerySchema,
  removeFromPlaylistSchema,
  removeMemberSchema,
  reorderPlaylistSchema,
  resendChannelInvitationSchema,
  updateChannelSchema,
  updatePlaylistSchema,
  updateUploadSchema,
  uploadQuerySchema,
} from '@/schemas/dashboard';
import {
  client,
  completeMultipartMediaUpload,
  deleteUpload,
  handleMultipartMediaUpload,
  importMedia,
  makeProcessMediaWorkflowId,
  sendInvitationEmail,
} from '@/temporal';
import {
  mantineAvatarLg2x,
  mantineAvatarSm2x,
  mantineAvatarXl2x,
} from '@/util/avatar-sizes';
import { coverImageFull, thumbnailMedium } from '@/util/image-sizes';
import logger from '@/util/logger';
import { getPublicImageUrl, getPublicMediaUrl } from '@/util/server-env';
import { uuidTranslator } from '@/util/uuid';
import { authProcedure, router } from '../../trpc';

const moduleLogger = logger.child({
  module: 'trpc/procedures/dashboard/channel',
});

const { ADMIN_EMAIL, WEB_URL } = z
  .object({
    ADMIN_EMAIL: z.email(),
    WEB_URL: z.url(),
  })
  .parse(process.env);

const channelProcedure = authProcedure
  .input(channelQuerySchema)
  .use(async ({ ctx, input, next }) => {
    // Skip membership query for site admins
    const membership = ctx.isSiteAdmin
      ? null
      : await prisma.channelMembership.findFirst({
          where: {
            appUserId: ctx.session.appUserId,
            channelId: input.channelId,
          },
        });

    if (!ctx.isSiteAdmin && !membership) {
      moduleLogger.warn('No membership found for channel procedure');

      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }

    // Compute permissions (site admins and channel admins have all permissions)
    const canAdmin = ctx.isSiteAdmin || !!membership?.isAdmin;
    const canEdit = canAdmin || !!membership?.canEdit;
    const canUpload = canAdmin || !!membership?.canUpload;
    const canDownload = canAdmin || !!membership?.canDownload;

    return next({
      ctx: {
        ...ctx,
        membership,
        canAdmin,
        canEdit,
        canUpload,
        canDownload,
      },
    });
  });

const channelAdminProcedure = channelProcedure.use(async ({ ctx, next }) => {
  if (!ctx.canAdmin) {
    moduleLogger.warn(
      {
        appUserId: ctx.session.appUserId,
      },
      'User is not admin of channel',
    );

    throw new TRPCError({ code: 'FORBIDDEN' });
  }

  return next();
});

const channelUploadProcedure = channelProcedure.use(async ({ ctx, next }) => {
  if (!ctx.canUpload) {
    moduleLogger.warn(
      {
        appUserId: ctx.session.appUserId,
      },
      'User cannot upload to channel',
    );

    throw new TRPCError({ code: 'FORBIDDEN' });
  }

  return next();
});

const channelEditProcedure = channelProcedure.use(async ({ ctx, next }) => {
  if (!ctx.canEdit) {
    moduleLogger.warn(
      {
        appUserId: ctx.session.appUserId,
      },
      'User cannot edit content in channel',
    );

    throw new TRPCError({ code: 'FORBIDDEN' });
  }

  return next();
});

export const channelRouter = router({
  createChannel: authProcedure
    .input(createChannelSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          context: {
            name: input.name,
          },
        },
        'Creating channel',
      );

      try {
        const channel = await prisma.channel.create({
          data: {
            name: input.name,
            slug: input.slug,
            description: input.description || null,
            visibility: input.visibility,
            memberships: {
              create: {
                appUserId: ctx.session.appUserId,
                isAdmin: true,
                canEdit: true,
                canUpload: true,
              },
            },
          },
          select: {
            id: true,
            name: true,
            slug: true,
          },
        });

        moduleLogger.info(
          {
            appUserId: ctx.session.appUserId,
            channelId: channel.id,
          },
          'Channel created successfully',
        );

        // Send admin notification email
        try {
          const user = await prisma.appUser.findUnique({
            where: { id: ctx.session.appUserId },
            select: {
              username: true,
              fullName: true,
              emails: {
                where: { verifiedAt: { not: null } },
                select: { email: true },
                take: 1,
              },
            },
          });

          const approvalUrl = `${WEB_URL}/dashboard/admin/channels?filter=pending`;
          const subject = `New Channel Approval Request: ${channel.name}`;
          const text = stripIndent`
            A new channel has been created and is pending approval.

            Channel Name: ${channel.name}
            Channel Slug: ${channel.slug}
            Creator: ${user?.fullName || user?.username || 'Unknown'}
            ${user?.emails[0]?.email ? `Creator Email: ${user.emails[0].email}` : ''}

            Please visit ${approvalUrl} to review and approve this channel.
          `;
          const html = emailHtml(
            'New Channel Approval Request',
            stripIndent`
              A new channel has been created and is pending approval.

              <b>Channel Name:</b> ${sanitizeForHtml(channel.name)}<br>
              <b>Channel Slug:</b> ${sanitizeForHtml(channel.slug)}<br>
              <b>Creator:</b> ${sanitizeForHtml(user?.fullName || user?.username || 'Unknown')}<br>
              ${user?.emails[0]?.email ? `<b>Creator Email:</b> ${sanitizeForHtml(user.emails[0].email)}<br>` : ''}

              Please <a href="${approvalUrl}">click here</a> to review and approve this channel.

              Alternatively, visit: ${approvalUrl}
            `,
          ).html;

          await (await client).workflow.start(sendEmailWorkflow, {
            args: [
              {
                from: 'hello@lets.church',
                to: ADMIN_EMAIL,
                subject,
                text,
                html,
              },
            ],
            workflowId: `channel-approval:${channel.id}:${Date.now()}`,
            taskQueue: BACKGROUND_QUEUE,
            retry: { maximumAttempts: 5 },
          });

          moduleLogger.info(
            {
              channelId: channel.id,
              context: {
                adminEmail: ADMIN_EMAIL,
              },
            },
            'Admin notification email workflow started',
          );
        } catch (emailError) {
          // Log but don't fail the channel creation if email fails
          moduleLogger.error(
            {
              channelId: channel.id,
              context: {
                error:
                  emailError instanceof Error
                    ? emailError.message
                    : String(emailError),
              },
            },
            'Failed to send admin notification email',
          );
        }

        return channel;
      } catch (error) {
        moduleLogger.error(
          {
            appUserId: ctx.session.appUserId,
            context: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to create channel',
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create channel',
        });
      }
    }),

  getChannels: authProcedure.query(({ ctx }) => {
    moduleLogger.info(
      {
        appUserId: ctx.session.appUserId,
      },
      'Fetching channels for user',
    );

    return prisma.channel.findMany({
      select: {
        id: true,
        name: true,
        approvedAt: true,
        memberships: {
          select: {
            isAdmin: true,
            canEdit: true,
            canUpload: true,
          },
          where: {
            appUserId: ctx.session.appUser.id,
          },
        },
      },
      where: {
        memberships: {
          some: {
            appUserId: ctx.session.appUser.id,
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }),

  getChannelDetails: channelProcedure.query(async ({ ctx, input }) => {
    const isSiteAdmin = ctx.isSiteAdmin;

    const channel = await prisma.channel.findFirst({
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        visibility: true,
        avatarPath: true,
        avatarBlurhash: true,
        defaultThumbnailPath: true,
        defaultThumbnailBlurhash: true,
        createdAt: true,
        updatedAt: true,
        approvedAt: true,
        approvedById: true,
        memberships: {
          select: {
            isAdmin: true,
            canEdit: true,
            canUpload: true,
            appUser: {
              select: {
                id: true,
                username: true,
                fullName: true,
                emails: {
                  select: {
                    email: true,
                    verifiedAt: true,
                  },
                },
              },
            },
          },
        },
        subscribers: {
          select: {
            appUserId: true,
          },
        },
        uploadRecords: {
          select: {
            id: true,
            title: true,
            createdAt: true,
          },
          where: {
            deletedAt: null,
            channel: {
              memberships: {
                some: {
                  appUserId: ctx.session.appUser.id,
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        _count: {
          select: {
            uploadRecords: {
              where: {
                deletedAt: null,
              },
            },
            subscribers: true,
            memberships: true,
            uploadLists: true,
          },
        },
      },
      where: {
        id: input.channelId,
        // Only filter by membership for non-admin users
        ...(isSiteAdmin
          ? {}
          : {
              memberships: {
                some: {
                  appUserId: ctx.session.appUser.id,
                },
              },
            }),
      },
    });

    if (!channel) {
      moduleLogger.warn(
        {
          appUserId: ctx.session.appUserId,
        },
        'No channel found for user',
      );

      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    const totalViews = await prisma.uploadView.count({
      where: {
        upload: {
          channelId: input.channelId,
        },
      },
    });

    const { avatarPath, ...channelWithoutPath } = channel;
    const avatarUrl = avatarPath
      ? getPublicImageUrl(publicS3.getS3ProtocolUri(avatarPath), {
          resize: mantineAvatarXl2x,
        })
      : null;

    return {
      ...channelWithoutPath,
      avatarUrl,
      userMembership: ctx.membership,
      totalViews,
    };
  }),

  getChannelForEdit: channelAdminProcedure.query(async ({ ctx, input }) => {
    const isSiteAdmin = ctx.isSiteAdmin;

    const channel = await prisma.channel.findFirst({
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        visibility: true,
        websiteUrl: true,
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
        avatarPath: true,
        coverPath: true,
        defaultThumbnailPath: true,
        defaultUploadVisibility: true,
        defaultUploadLicense: true,
        defaultUploadCommentsEnabled: true,
        defaultUploadDownloadsEnabled: true,
      },
      where: {
        id: input.channelId,
        // Only filter by admin membership for non-site-admin users
        ...(isSiteAdmin
          ? {}
          : {
              memberships: {
                some: {
                  appUserId: ctx.session.appUser.id,
                  isAdmin: true,
                },
              },
            }),
      },
    });

    if (!channel) {
      moduleLogger.warn('Channel not found for editing');

      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    const { avatarPath, coverPath, defaultThumbnailPath, ...restChannel } =
      channel;

    const avatarUrl = avatarPath
      ? getPublicImageUrl(publicS3.getS3ProtocolUri(avatarPath), {
          resize: mantineAvatarLg2x,
        })
      : null;

    const coverUrl = coverPath
      ? getPublicImageUrl(publicS3.getS3ProtocolUri(coverPath), {
          resize: coverImageFull,
        })
      : null;

    const defaultThumbnailUrl = defaultThumbnailPath
      ? getPublicImageUrl(publicS3.getS3ProtocolUri(defaultThumbnailPath), {
          resize: thumbnailMedium,
        })
      : null;

    return { ...restChannel, avatarUrl, coverUrl, defaultThumbnailUrl };
  }),

  updateChannel: channelAdminProcedure
    .input(updateChannelSchema)
    .mutation(async ({ ctx, input }) => {
      const updatedChannel = await prisma.channel.update({
        where: {
          id: input.channelId,
          memberships: {
            some: {
              appUserId: ctx.session.appUser.id,
              isAdmin: true,
            },
          },
        },
        data: {
          name: input.name,
          slug: input.slug,
          description: input.description,
          visibility: input.visibility,
          websiteUrl: input.websiteUrl || null,
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
          defaultUploadVisibility: input.defaultUploadVisibility ?? null,
          defaultUploadLicense: input.defaultUploadLicense ?? null,
          defaultUploadCommentsEnabled:
            input.defaultUploadCommentsEnabled ?? null,
          defaultUploadDownloadsEnabled:
            input.defaultUploadDownloadsEnabled ?? null,
        },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          visibility: true,
          websiteUrl: true,
        },
      });

      return { success: true, channel: updatedChannel };
    }),

  getChannelMembers: channelProcedure.query(async ({ ctx, input }) => {
    const channel = await prisma.channel.findFirst({
      select: {
        id: true,
        name: true,
        slug: true,
        memberships: {
          select: {
            channelId: true,
            appUserId: true,
            isAdmin: true,
            canEdit: true,
            canUpload: true,
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
        id: input.channelId,
      },
    });

    if (!channel) {
      moduleLogger.warn('Channel not found for members');

      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    const membershipsWithAvatarUrl = channel.memberships.map((membership) => {
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
      ...channel,
      memberships: membershipsWithAvatarUrl,
      userMembership: ctx.membership,
      canAdmin: ctx.canAdmin,
    };
  }),

  inviteToChannel: channelAdminProcedure
    .input(inviteChannelMemberSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          channelId: input.channelId,
          appUserId: ctx.session.appUserId,
          context: {
            isAdmin: input.isAdmin,
            canEdit: input.canEdit,
            canUpload: input.canUpload,
            canDownload: input.canDownload,
          },
        },
        'Inviting user to channel',
      );

      // Check if email already belongs to a member
      const existingMember = await prisma.channelMembership.findFirst({
        where: {
          channelId: input.channelId,
          appUser: {
            emails: {
              some: {
                email: input.email,
              },
            },
          },
        },
      });

      // If already a member, treat as no-op to prevent user enumeration
      if (existingMember) {
        moduleLogger.info(
          {
            channelId: input.channelId,
            appUserId: ctx.session.appUserId,
          },
          'User is already a member of this channel, skipping invitation',
        );
        return { success: true, message: 'Invitation sent successfully' };
      }

      // Check for existing pending invitation
      const existingInvitation = await prisma.channelInvitation.findUnique({
        where: {
          channelId_email: {
            channelId: input.channelId,
            email: input.email,
          },
        },
      });

      // If already invited and pending, treat as no-op to prevent user enumeration
      if (
        existingInvitation &&
        existingInvitation.status === 'PENDING' &&
        existingInvitation.expiresAt > new Date()
      ) {
        moduleLogger.info(
          {
            channelId: input.channelId,
            appUserId: ctx.session.appUserId,
          },
          'Pending invitation already exists for this email, skipping',
        );
        return { success: true, message: 'Invitation sent successfully' };
      }

      // Create or update invitation
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const invitation = await prisma.channelInvitation.upsert({
        where: {
          channelId_email: {
            channelId: input.channelId,
            email: input.email,
          },
        },
        update: {
          status: 'PENDING',
          isAdmin: input.isAdmin,
          canEdit: input.canEdit,
          canUpload: input.canUpload,
          canDownload: input.canDownload,
          expiresAt,
          respondedAt: null,
          invitedById: ctx.session.appUserId,
        },
        create: {
          channelId: input.channelId,
          email: input.email,
          isAdmin: input.isAdmin,
          canEdit: input.canEdit,
          canUpload: input.canUpload,
          canDownload: input.canDownload,
          invitedById: ctx.session.appUserId,
          expiresAt,
        },
      });

      // Send invitation email
      await sendInvitationEmail({
        invitationId: invitation.id,
        type: 'channel',
      });

      moduleLogger.info(
        {
          channelId: input.channelId,
          appUserId: ctx.session.appUserId,
          context: {
            invitationId: invitation.id,
          },
        },
        'Channel invitation created and email sent',
      );

      // Return identical success message for security (no user enumeration)
      return { success: true, message: 'Invitation sent successfully' };
    }),

  getChannelInvitations: channelAdminProcedure
    .input(channelQuerySchema)
    .query(async ({ input }) => {
      return prisma.channelInvitation
        .findMany({
          where: {
            channelId: input.channelId,
            status: 'PENDING',
            expiresAt: { gt: new Date() },
          },
          select: {
            id: true,
            email: true,
            isAdmin: true,
            canEdit: true,
            canUpload: true,
            canDownload: true,
            createdAt: true,
            expiresAt: true,
            token: true,
            invitedBy: {
              select: {
                username: true,
                fullName: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        })
        .then((invitations) =>
          invitations.map(({ token, ...inv }) => ({
            ...inv,
            token: uuidTranslator.fromUUID(token),
          })),
        );
    }),

  cancelChannelInvitation: channelAdminProcedure
    .input(cancelChannelInvitationSchema)
    .mutation(async ({ input }) => {
      // Use updateMany to ensure the invitation belongs to the channel
      const result = await prisma.channelInvitation.updateMany({
        where: {
          id: input.invitationId,
          channelId: input.channelId,
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

  resendChannelInvitation: channelAdminProcedure
    .input(resendChannelInvitationSchema)
    .mutation(async ({ ctx, input }) => {
      // First fetch and validate the invitation
      const existingInvitation = await prisma.channelInvitation.findFirst({
        where: {
          id: input.invitationId,
          channelId: input.channelId,
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
      const invitation = await prisma.channelInvitation.update({
        where: { id: input.invitationId },
        data: {
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      // Send invitation email
      await sendInvitationEmail({
        invitationId: invitation.id,
        type: 'channel',
      });

      moduleLogger.info(
        {
          channelId: input.channelId,
          appUserId: ctx.session.appUserId,
          context: {
            invitationId: invitation.id,
          },
        },
        'Channel invitation resent',
      );

      return { success: true };
    }),

  removeChannelMember: channelAdminProcedure
    .input(removeMemberSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          channelId: input.channelId,
          context: {
            memberToRemove: input.appUserId,
            removedBy: ctx.session.appUserId,
          },
        },
        'Removing channel member',
      );

      try {
        let wasAdmin = false;
        await prisma.$transaction(async (tx) => {
          // Don't allow removing the last admin
          const adminCount = await tx.channelMembership.count({
            where: {
              channelId: input.channelId,
              isAdmin: true,
            },
          });

          const membershipToDelete = await tx.channelMembership.findUnique({
            where: {
              channelId_appUserId: {
                channelId: input.channelId,
                appUserId: input.appUserId,
              },
            },
            select: { isAdmin: true, appUserId: true },
          });

          if (!membershipToDelete) {
            moduleLogger.warn(
              {
                channelId: input.channelId,
                context: {
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
                channelId: input.channelId,
                context: {
                  memberToRemove: input.appUserId,
                  removedBy: ctx.session.appUserId,
                },
              },
              'Cannot remove last admin from channel',
            );
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Cannot remove the last admin from the channel',
            });
          }

          await tx.channelMembership.delete({
            where: {
              channelId_appUserId: {
                channelId: input.channelId,
                appUserId: input.appUserId,
              },
            },
          });
        });

        moduleLogger.info(
          {
            channelId: input.channelId,
            context: {
              memberRemoved: input.appUserId,
              removedBy: ctx.session.appUserId,
              wasAdmin,
            },
          },
          'Channel member removed successfully',
        );

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        moduleLogger.error(
          {
            channelId: input.channelId,
            context: {
              memberToRemove: input.appUserId,
              removedBy: ctx.session.appUserId,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to remove channel member',
        );
        throw error;
      }
    }),

  getChannelUploads: channelProcedure
    .input(channelUploadsQuerySchema)
    .query(async ({ ctx, input }) => {
      const channel = await prisma.channel.findFirst({
        select: {
          id: true,
          name: true,
          slug: true,
          defaultUploadVisibility: true,
          defaultUploadLicense: true,
          defaultUploadCommentsEnabled: true,
          defaultUploadDownloadsEnabled: true,
          memberships: {
            select: {
              isAdmin: true,
              canEdit: true,
              canUpload: true,
              canDownload: true,
              appUser: {
                select: {
                  id: true,
                  role: true,
                },
              },
            },
          },
        },
        where: {
          id: input.channelId,
        },
      });

      if (!channel) {
        moduleLogger.warn('Channel not found for uploads');

        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      const offset = (input.page - 1) * input.limit;

      const [uploads, totalCount] = await Promise.all([
        prisma.uploadRecord.findMany({
          select: {
            id: true,
            title: true,
            description: true,
            visibility: true,
            createdAt: true,
            lengthSeconds: true,
            finalizedUploadKey: true,
            defaultThumbnailPath: true,
            overrideThumbnailPath: true,
            featuredUpload: {
              select: {
                uploadRecordId: true,
              },
            },
            _count: {
              select: {
                uploadViews: true,
                userComments: true,
              },
            },
          },
          where: {
            channelId: input.channelId,
            ...(input.search && {
              title: {
                contains: input.search,
                mode: 'insensitive',
              },
            }),
            OR: [
              { visibility: 'PUBLIC' },
              { visibility: 'UNLISTED' },
              {
                AND: [
                  { visibility: 'PRIVATE' },
                  {
                    channel: {
                      memberships: {
                        some: {
                          appUserId: ctx.session.appUser.id,
                        },
                      },
                    },
                  },
                ],
              },
            ],
          },
          orderBy: { createdAt: 'desc' },
          skip: offset,
          take: input.limit,
        }),
        prisma.uploadRecord.count({
          where: {
            channelId: input.channelId,
            ...(input.search && {
              title: {
                contains: input.search,
                mode: 'insensitive',
              },
            }),
            OR: [
              { visibility: 'PUBLIC' },
              { visibility: 'UNLISTED' },
              {
                AND: [
                  { visibility: 'PRIVATE' },
                  {
                    channel: {
                      memberships: {
                        some: {
                          appUserId: ctx.session.appUser.id,
                        },
                      },
                    },
                  },
                ],
              },
            ],
          },
        }),
      ]);

      const totalPages = Math.ceil(totalCount / input.limit);

      const uploadsWithThumbnails = uploads.map((upload) => {
        const {
          defaultThumbnailPath,
          overrideThumbnailPath,
          featuredUpload,
          ...uploadRest
        } = upload;
        const thumbnailPath = overrideThumbnailPath ?? defaultThumbnailPath;
        const thumbnailUrl = thumbnailPath
          ? getPublicImageUrl(
              publicS3.getS3ProtocolUri(thumbnailPath),
              getThumbnailResize('table'),
            )
          : null;

        return {
          ...uploadRest,
          thumbnailUrl,
          isFeatured: !!featuredUpload,
        };
      });

      return {
        channel: {
          ...channel,
          userMembership: ctx.membership,
        },
        uploads: uploadsWithThumbnails,
        pagination: {
          page: input.page,
          limit: input.limit,
          totalCount,
          totalPages,
        },
      };
    }),

  createUploadRecord: channelUploadProcedure
    .input(createUploadSchema)
    .mutation(async ({ ctx, input }) => {
      const channel = await prisma.channel.findUniqueOrThrow({
        where: { id: input.channelId },
        select: {
          defaultUploadVisibility: true,
          defaultUploadLicense: true,
          defaultUploadCommentsEnabled: true,
          defaultUploadDownloadsEnabled: true,
        },
      });

      const { id } = await prisma.uploadRecord.create({
        data: {
          license: channel.defaultUploadLicense ?? UploadLicense.STANDARD,
          visibility: channel.defaultUploadVisibility ?? 'PRIVATE',
          userCommentsEnabled: channel.defaultUploadCommentsEnabled ?? true,
          downloadsEnabled: channel.defaultUploadDownloadsEnabled ?? true,
          originalFileName: input.originalFileName,
          channel: {
            connect: {
              id: input.channelId,
            },
          },
          createdBy: {
            connect: {
              id: ctx.session.appUser.id,
            },
          },
        },
      });

      return id;
    }),

  deleteUploadRecord: channelAdminProcedure
    .input(deleteUploadSchema)
    .mutation(async ({ input }) => {
      // Verify the upload belongs to this channel
      const upload = await prisma.uploadRecord.findFirst({
        select: {
          id: true,
          channelId: true,
        },
        where: {
          id: input.uploadId,
          channelId: input.channelId,
        },
      });

      if (!upload) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Upload not found',
        });
      }

      // Start the delete workflow
      await deleteUpload(input.uploadId);

      return { success: true, uploadId: input.uploadId };
    }),

  bulkSetVisibility: channelEditProcedure
    .input(bulkSetVisibilitySchema)
    .mutation(async ({ input }) => {
      // Verify all uploads belong to this channel
      const uploads = await prisma.uploadRecord.findMany({
        select: {
          id: true,
          channelId: true,
        },
        where: {
          id: { in: input.uploadIds },
          channelId: input.channelId,
        },
      });

      if (uploads.length !== input.uploadIds.length) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Some uploads not found or do not belong to this channel',
        });
      }

      // Update visibility for all uploads
      await prisma.uploadRecord.updateMany({
        where: {
          id: { in: input.uploadIds },
          channelId: input.channelId,
        },
        data: {
          visibility: input.visibility,
        },
      });

      return {
        success: true,
        updatedCount: input.uploadIds.length,
        visibility: input.visibility,
      };
    }),

  getUploadRecord: channelEditProcedure
    .input(uploadQuerySchema)
    .query(async ({ ctx, input }) => {
      const upload = await prisma.uploadRecord.findFirst({
        select: {
          id: true,
          title: true,
          description: true,
          license: true,
          visibility: true,
          publishedAt: true,
          userCommentsEnabled: true,
          downloadsEnabled: true,
          defaultThumbnailPath: true,
          overrideThumbnailPath: true,
          uploadFinalized: true,
          finalizedUploadKey: true,
          transcodingFinishedAt: true,
          transcribingFinishedAt: true,
          transcodingProgress: true,
          variants: true,
          featuredUpload: {
            select: {
              uploadRecordId: true,
            },
          },
          channel: {
            select: {
              id: true,
              name: true,
              memberships: {
                select: {
                  isAdmin: true,
                  canEdit: true,
                  appUser: {
                    select: {
                      id: true,
                      role: true,
                    },
                  },
                },
              },
            },
          },
          uploadListEntries: {
            select: {
              uploadList: {
                select: {
                  id: true,
                  title: true,
                  type: true,
                },
              },
            },
            where: {
              uploadList: {
                type: 'SERIES',
                channelId: input.channelId,
              },
            },
          },
        },
        where: {
          id: input.uploadId,
          channelId: input.channelId,
        },
      });

      if (!upload) {
        moduleLogger.warn('Upload not found');

        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Upload not found or access denied',
        });
      }

      const userMembership = upload.channel.memberships.find(
        (m) => m.appUser.id === ctx.session.appUser.id,
      );

      const {
        defaultThumbnailPath,
        overrideThumbnailPath,
        featuredUpload,
        variants,
        uploadListEntries,
        ...uploadRest
      } = upload;
      const thumbnailPath = overrideThumbnailPath ?? defaultThumbnailPath;

      const thumbnailUrl = thumbnailPath
        ? getPublicImageUrl(publicS3.getS3ProtocolUri(thumbnailPath))
        : null;

      // Generate media source URLs based on available variants
      const hasVideo = variants.some((v) => v.startsWith('VIDEO'));
      const hasAudio = variants.includes('AUDIO');

      const mediaSource = hasVideo
        ? getPublicMediaUrl(`${upload.id}/master.m3u8`)
        : null;

      const audioSource = hasAudio
        ? getPublicMediaUrl(`${upload.id}/AUDIO.m3u8`)
        : null;

      // For site admins, check if there's an active workflow for failed uploads
      let hasActiveWorkflow = false;
      if (
        ctx.isSiteAdmin &&
        upload.uploadFinalized &&
        upload.finalizedUploadKey &&
        (!upload.transcodingFinishedAt || !upload.transcribingFinishedAt)
      ) {
        try {
          const temporalClient = await client;
          const workflowId = makeProcessMediaWorkflowId(
            upload.finalizedUploadKey,
          );
          const handle = temporalClient.workflow.getHandle(workflowId);
          const description = await handle.describe();
          hasActiveWorkflow = description.status.name === 'RUNNING';
        } catch {
          // Workflow doesn't exist
        }
      }

      return {
        upload: {
          ...uploadRest,
          thumbnailUrl,
          isFeatured: !!featuredUpload,
          mediaSource,
          audioSource,
          series: uploadListEntries.map((e) => e.uploadList),
          hasActiveWorkflow,
        },
        channel: {
          ...upload.channel,
          userMembership,
        },
      };
    }),

  updateUploadRecord: channelEditProcedure
    .input(updateUploadSchema)
    .mutation(async ({ input }) => {
      const upload = await prisma.uploadRecord.findFirst({
        select: {
          id: true,
          channel: {
            select: {
              memberships: {
                select: {
                  isAdmin: true,
                  canEdit: true,
                  appUser: {
                    select: {
                      id: true,
                    },
                  },
                },
              },
            },
          },
        },
        where: {
          id: input.uploadId,
          channelId: input.channelId,
        },
      });

      if (!upload) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Upload not found or access denied',
        });
      }

      const updatedUpload = await prisma.uploadRecord.update({
        where: { id: input.uploadId },
        data: {
          title: input.title,
          description: input.description,
          license: input.license,
          publishedAt: input.publishedAt,
          visibility: input.visibility,
          userCommentsEnabled: input.userCommentsEnabled,
          downloadsEnabled: input.downloadsEnabled,
        },
        select: {
          id: true,
          title: true,
          description: true,
          license: true,
          visibility: true,
          publishedAt: true,
          userCommentsEnabled: true,
          downloadsEnabled: true,
        },
      });

      return { success: true, upload: updatedUpload };
    }),

  createMultipartUpload: channelAdminProcedure
    .input(
      multipartUploadSchema.and(
        z.object({
          postProcess: z.enum([
            'media',
            'thumbnail',
            'channelAvatar',
            'channelDefaultThumbnail',
            'channelCover',
          ]),
        }),
      ),
    )
    .mutation(
      async ({ input: { targetId, uploadMimeType, bytes, postProcess } }) => {
        const { uploadKey, uploadId } = await ingestS3.createMultipartUpload(
          targetId,
          uploadMimeType,
        );

        await handleMultipartMediaUpload(
          targetId,
          'INGEST',
          uploadId,
          uploadKey,
          postProcess,
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
      },
    ),

  finalizeMultipartUpload: channelAdminProcedure
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

  getOriginalDownloadUrl: channelProcedure
    .input(
      z.object({
        uploadId: z.uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Fetch upload only if user has channel membership
      const upload = await prisma.uploadRecord.findFirst({
        where: {
          id: input.uploadId,
          channel: {
            memberships: {
              some: {
                appUserId: ctx.session.appUserId,
              },
            },
          },
        },
        select: {
          id: true,
          finalizedUploadKey: true,
          originalFileName: true,
          title: true,
          channel: {
            select: {
              id: true,
              memberships: {
                where: { appUserId: ctx.session.appUserId },
                select: {
                  isAdmin: true,
                  canDownload: true,
                },
              },
            },
          },
        },
      });

      if (!upload) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Upload not found',
        });
      }

      if (!upload.finalizedUploadKey) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Upload not finalized yet',
        });
      }

      // Check permission
      if (!ctx.canDownload) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to download original files',
        });
      }

      // Generate filename
      const filename =
        upload.originalFileName ||
        `${sanitizeFilename(upload.title || 'media')}.bin`;

      // Generate signed URL using ingest bucket
      const url = await ingestS3.getSignedGetObject(upload.finalizedUploadKey, {
        responseContentDisposition: `attachment; filename="${sanitizeFilename(filename)}"`,
        expiresIn: 3600, // 1 hour
      });

      return { url };
    }),

  // Playlist procedures
  getChannelPlaylists: channelProcedure.query(async ({ ctx, input }) => {
    moduleLogger.info(
      {
        channelId: input.channelId,
        appUserId: ctx.session.appUserId,
      },
      'Fetching channel playlists',
    );

    const playlists = await prisma.uploadList.findMany({
      select: {
        id: true,
        title: true,
        type: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            uploads: true,
          },
        },
      },
      where: {
        channelId: input.channelId,
      },
      orderBy: { createdAt: 'desc' },
    });

    return playlists;
  }),

  searchChannelSeries: channelProcedure
    .input(
      z.object({
        channelId: z.string(),
        query: z.string().min(1),
      }),
    )
    .query(async ({ input }) => {
      const series = await prisma.uploadList.findMany({
        where: {
          channelId: input.channelId,
          type: 'SERIES',
          title: {
            contains: input.query,
            mode: 'insensitive',
          },
        },
        select: {
          id: true,
          title: true,
          _count: { select: { uploads: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
      return series;
    }),

  getPlaylistDetails: channelProcedure
    .input(playlistQuerySchema)
    .query(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          channelId: input.channelId,
          appUserId: ctx.session.appUserId,
          context: {
            playlistId: input.playlistId,
          },
        },
        'Fetching playlist details',
      );

      const playlist = await prisma.uploadList.findFirst({
        select: {
          id: true,
          title: true,
          type: true,
          createdAt: true,
          updatedAt: true,
          uploads: {
            select: {
              upload: {
                select: {
                  id: true,
                  title: true,
                  description: true,
                  visibility: true,
                  createdAt: true,
                  lengthSeconds: true,
                  defaultThumbnailPath: true,
                  overrideThumbnailPath: true,
                },
              },
              rank: true,
            },
            orderBy: [{ rank: 'asc' }, { createdAt: 'asc' }],
          },
        },
        where: {
          id: input.playlistId,
          channelId: input.channelId,
        },
      });

      if (!playlist) {
        moduleLogger.warn(
          {
            channelId: input.channelId,
            appUserId: ctx.session.appUserId,
            context: {
              playlistId: input.playlistId,
            },
          },
          'Playlist not found',
        );
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Playlist not found',
        });
      }

      return playlist;
    }),

  createPlaylist: channelEditProcedure
    .input(createPlaylistSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          channelId: input.channelId,
          context: {
            playlistTitle: input.title,
            playlistType: input.type,
            createdBy: ctx.session.appUserId,
          },
        },
        'Creating playlist',
      );

      try {
        const playlist = await prisma.uploadList.create({
          data: {
            title: input.title,
            type: input.type,
            authorId: ctx.session.appUser.id,
            channelId: input.channelId,
          },
          select: {
            id: true,
            title: true,
            type: true,
            createdAt: true,
          },
        });

        moduleLogger.info(
          {
            channelId: input.channelId,
            context: {
              playlistId: playlist.id,
              playlistTitle: input.title,
              createdBy: ctx.session.appUserId,
            },
          },
          'Playlist created successfully',
        );

        return { success: true, playlist };
      } catch (error) {
        moduleLogger.error(
          {
            channelId: input.channelId,
            context: {
              playlistTitle: input.title,
              createdBy: ctx.session.appUserId,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to create playlist',
        );
        throw error;
      }
    }),

  updatePlaylist: channelEditProcedure
    .input(updatePlaylistSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          context: {
            playlistId: input.playlistId,
            playlistTitle: input.title,
            playlistType: input.type,
            updatedBy: ctx.session.appUserId,
          },
        },
        'Updating playlist',
      );

      try {
        const updatedPlaylist = await prisma.uploadList.update({
          where: { id: input.playlistId },
          data: {
            title: input.title,
            type: input.type,
          },
          select: {
            id: true,
            title: true,
            type: true,
            updatedAt: true,
          },
        });

        moduleLogger.info(
          {
            context: {
              playlistId: input.playlistId,
              playlistTitle: input.title,
              updatedBy: ctx.session.appUserId,
            },
          },
          'Playlist updated successfully',
        );

        return { success: true, playlist: updatedPlaylist };
      } catch (error) {
        moduleLogger.error(
          {
            context: {
              playlistId: input.playlistId,
              playlistTitle: input.title,
              updatedBy: ctx.session.appUserId,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to update playlist',
        );
        throw error;
      }
    }),

  deletePlaylist: channelEditProcedure
    .input(deletePlaylistSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          context: {
            playlistId: input.playlistId,
            deletedBy: ctx.session.appUserId,
          },
        },
        'Deleting playlist',
      );

      try {
        const playlist = await prisma.uploadList.findUnique({
          where: { id: input.playlistId },
          select: { id: true },
        });

        if (!playlist) {
          moduleLogger.warn(
            {
              context: {
                playlistId: input.playlistId,
                deletedBy: ctx.session.appUserId,
              },
            },
            'Playlist not found',
          );
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Playlist not found',
          });
        }

        await prisma.uploadList.delete({
          where: { id: input.playlistId },
        });

        moduleLogger.info(
          {
            context: {
              playlistId: input.playlistId,
              deletedBy: ctx.session.appUserId,
            },
          },
          'Playlist deleted successfully',
        );

        return { success: true };
      } catch (error) {
        moduleLogger.error(
          {
            context: {
              playlistId: input.playlistId,
              deletedBy: ctx.session.appUserId,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to delete playlist',
        );
        throw error;
      }
    }),

  addToPlaylist: channelEditProcedure
    .input(addToPlaylistSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          uploadId: input.uploadId,
          context: {
            playlistId: input.playlistId,
            addedBy: ctx.session.appUserId,
          },
        },
        'Adding upload to playlist',
      );

      try {
        // Get the playlist to verify it exists and get its channelId
        const playlist = await prisma.uploadList.findUnique({
          where: { id: input.playlistId },
          select: { id: true, channelId: true },
        });

        if (!playlist?.channelId) {
          moduleLogger.warn(
            {
              uploadId: input.uploadId,
              context: {
                playlistId: input.playlistId,
                addedBy: ctx.session.appUserId,
              },
            },
            'Playlist not found for add to playlist',
          );
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Playlist not found',
          });
        }

        // SECURITY: Verify the playlist belongs to the channel the user has permission for
        if (playlist.channelId !== input.channelId) {
          moduleLogger.warn(
            'Playlist does not belong to the requested channel',
          );
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Playlist does not belong to this channel',
          });
        }

        // Verify the upload belongs to the same channel
        const upload = await prisma.uploadRecord.findFirst({
          where: {
            id: input.uploadId,
            channelId: playlist.channelId,
          },
          select: { id: true },
        });

        if (!upload) {
          moduleLogger.warn(
            {
              uploadId: input.uploadId,
              channelId: playlist.channelId,
              context: {
                playlistId: input.playlistId,
                addedBy: ctx.session.appUserId,
              },
            },
            'Upload not found or channel mismatch',
          );
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Upload not found or does not belong to this channel',
          });
        }

        // Check if upload is already in playlist
        const existingEntry = await prisma.uploadListEntry.findUnique({
          where: {
            uploadListId_uploadRecordId: {
              uploadListId: input.playlistId,
              uploadRecordId: input.uploadId,
            },
          },
        });

        if (existingEntry) {
          moduleLogger.warn(
            {
              uploadId: input.uploadId,
              context: {
                playlistId: input.playlistId,
                addedBy: ctx.session.appUserId,
              },
            },
            'Upload already in playlist',
          );
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Upload is already in this playlist',
          });
        }

        await prisma.uploadListEntry.create({
          data: {
            uploadListId: input.playlistId,
            uploadRecordId: input.uploadId,
          },
        });

        moduleLogger.info(
          {
            uploadId: input.uploadId,
            context: {
              playlistId: input.playlistId,
              addedBy: ctx.session.appUserId,
            },
          },
          'Upload added to playlist successfully',
        );

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        moduleLogger.error(
          {
            uploadId: input.uploadId,
            context: {
              playlistId: input.playlistId,
              addedBy: ctx.session.appUserId,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to add upload to playlist',
        );
        throw error;
      }
    }),

  removeFromPlaylist: channelEditProcedure
    .input(removeFromPlaylistSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          uploadId: input.uploadId,
          context: {
            playlistId: input.playlistId,
            removedBy: ctx.session.appUserId,
          },
        },
        'Removing upload from playlist',
      );

      try {
        // SECURITY: Verify the playlist belongs to the channel the user has permission for
        const playlist = await prisma.uploadList.findUnique({
          where: { id: input.playlistId },
          select: { channelId: true },
        });

        if (!playlist) {
          moduleLogger.warn(
            {
              uploadId: input.uploadId,
              context: {
                playlistId: input.playlistId,
                removedBy: ctx.session.appUserId,
              },
            },
            'Playlist not found for remove from playlist',
          );
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Playlist not found',
          });
        }

        if (playlist.channelId !== input.channelId) {
          moduleLogger.warn(
            'Playlist does not belong to the requested channel',
          );
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Playlist does not belong to this channel',
          });
        }

        const deletedEntry = await prisma.uploadListEntry.deleteMany({
          where: {
            uploadListId: input.playlistId,
            uploadRecordId: input.uploadId,
          },
        });

        if (deletedEntry.count === 0) {
          moduleLogger.warn(
            {
              uploadId: input.uploadId,
              context: {
                playlistId: input.playlistId,
                removedBy: ctx.session.appUserId,
              },
            },
            'Upload not found in playlist for removal',
          );
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Upload not found in playlist',
          });
        }

        moduleLogger.info(
          {
            uploadId: input.uploadId,
            context: {
              playlistId: input.playlistId,
              removedBy: ctx.session.appUserId,
            },
          },
          'Upload removed from playlist successfully',
        );

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        moduleLogger.error(
          {
            uploadId: input.uploadId,
            context: {
              playlistId: input.playlistId,
              removedBy: ctx.session.appUserId,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to remove upload from playlist',
        );
        throw error;
      }
    }),

  reorderPlaylist: channelEditProcedure
    .input(reorderPlaylistSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          context: {
            playlistId: input.playlistId,
            uploadCount: input.uploadIds.length,
            reorderedBy: ctx.session.appUserId,
          },
        },
        'Reordering playlist',
      );

      try {
        await prisma.$transaction(
          input.uploadIds.map((uploadId, index) =>
            prisma.uploadListEntry.update({
              where: {
                uploadListId_uploadRecordId: {
                  uploadListId: input.playlistId,
                  uploadRecordId: uploadId,
                },
              },
              data: {
                rank: index,
              },
            }),
          ),
        );

        moduleLogger.info(
          {
            context: {
              playlistId: input.playlistId,
              uploadCount: input.uploadIds.length,
              reorderedBy: ctx.session.appUserId,
            },
          },
          'Playlist reordered successfully',
        );

        return { success: true };
      } catch (error) {
        moduleLogger.error(
          {
            context: {
              playlistId: input.playlistId,
              uploadCount: input.uploadIds.length,
              reorderedBy: ctx.session.appUserId,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to reorder playlist',
        );
        throw error;
      }
    }),

  approveChannel: authProcedure
    .input(channelQuerySchema)
    .use(async ({ ctx, next }) => {
      // Only site admins can approve channels
      if (ctx.session.appUser.role !== 'ADMIN') {
        moduleLogger.warn(
          {
            appUserId: ctx.session.appUserId,
            context: {
              role: ctx.session.appUser.role,
            },
          },
          'Non-admin user attempted to approve channel',
        );
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      return next();
    })
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          channelId: input.channelId,
          appUserId: ctx.session.appUserId,
        },
        'Approving channel',
      );

      try {
        await prisma.channel.update({
          where: {
            id: input.channelId,
          },
          data: {
            approvedAt: new Date(),
            approvedById: ctx.session.appUserId,
          },
        });

        moduleLogger.info(
          {
            channelId: input.channelId,
            appUserId: ctx.session.appUserId,
          },
          'Channel approved successfully',
        );

        return { success: true };
      } catch (error) {
        moduleLogger.error(
          {
            channelId: input.channelId,
            appUserId: ctx.session.appUserId,
            context: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to approve channel',
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to approve channel',
        });
      }
    }),

  unapproveChannel: authProcedure
    .input(channelQuerySchema)
    .use(async ({ ctx, next }) => {
      // Only site admins can unapprove channels
      if (ctx.session.appUser.role !== 'ADMIN') {
        moduleLogger.warn(
          {
            appUserId: ctx.session.appUserId,
            context: {
              role: ctx.session.appUser.role,
            },
          },
          'Non-admin user attempted to unapprove channel',
        );
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      return next();
    })
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          channelId: input.channelId,
          appUserId: ctx.session.appUserId,
        },
        'Unapproving channel',
      );

      try {
        await prisma.channel.update({
          where: {
            id: input.channelId,
          },
          data: {
            approvedAt: null,
            approvedById: null,
          },
        });

        moduleLogger.info(
          {
            channelId: input.channelId,
            appUserId: ctx.session.appUserId,
          },
          'Channel unapproved successfully',
        );

        return { success: true };
      } catch (error) {
        moduleLogger.error(
          {
            channelId: input.channelId,
            appUserId: ctx.session.appUserId,
            context: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to unapprove channel',
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to unapprove channel',
        });
      }
    }),

  importMedia: channelUploadProcedure
    .input(importMediaSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const { channelId, url, ...workflowData } = input;

        // Get channel and user info for the workflow
        const [channel, user] = await Promise.all([
          prisma.channel.findUniqueOrThrow({
            where: { id: channelId },
            select: { slug: true },
          }),
          prisma.appUser.findUniqueOrThrow({
            where: { id: ctx.session.appUserId },
            select: { username: true },
          }),
        ]);

        // Start the import workflow
        await importMedia({
          url,
          username: user.username,
          channelSlug: channel.slug,
          taskQueue: BACKGROUND_QUEUE,
          ...workflowData,
        });

        moduleLogger.info(
          {
            appUserId: ctx.session.appUserId,
          },
          'Import workflow started',
        );

        return { success: true };
      } catch (error) {
        moduleLogger.error(
          {
            channelId: input.channelId,
            appUserId: ctx.session.appUserId,
            context: {
              url: input.url,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to start import workflow',
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to start import',
        });
      }
    }),
});
